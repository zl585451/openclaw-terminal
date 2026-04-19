import type { ClarifyCardSpec } from './types';

/** 匹配 [clarify_card ...]{...JSON...}[/clarify_card] */
const CLARIFY_CARD_RX =
  /\[clarify_card(?:\s+[^\]]*)?\]([\s\S]*?)\[\/clarify_card\]/gi;

/** 解析结果 */
export interface ParseClarifyResult {
  /** 卡片规格（若解析成功） */
  spec: ClarifyCardSpec | null;
  /** 卡片原始范围 [startIndex, endIndex] */
  range: [number, number] | null;
  /** 剥离卡片标签后的纯文本（用于其他段落正常渲染） */
  stripped: string;
}

/**
 * 从消息内容中提取第一张 clarify_card。
 * 设计原则：一条消息最多一张卡片（AMY 规则），多出的视为无效。
 */
export function parseClarifyCard(content: string): ParseClarifyResult {
  if (!content || typeof content !== 'string') {
    return { spec: null, range: null, stripped: content || '' };
  }

  CLARIFY_CARD_RX.lastIndex = 0;
  const match = CLARIFY_CARD_RX.exec(content);
  if (!match) {
    return { spec: null, range: null, stripped: content };
  }

  const startIndex = match.index;
  const endIndex = startIndex + match[0].length;
  const inner = match[1].trim();

  // 尝试解析 JSON
  const jsonStart = inner.indexOf('{');
  const jsonEnd = inner.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    // JSON 不完整：剥离标签避免原样显示，但不弹卡
    return {
      spec: null,
      range: [startIndex, endIndex],
      stripped: stripRange(content, startIndex, endIndex),
    };
  }

  const jsonStr = inner.slice(jsonStart, jsonEnd + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return {
      spec: null,
      range: [startIndex, endIndex],
      stripped: stripRange(content, startIndex, endIndex),
    };
  }

  const spec = normalizeSpec(parsed);
  return {
    spec,
    range: [startIndex, endIndex],
    stripped: stripRange(content, startIndex, endIndex),
  };
}

/** 把 [start, end) 范围内的内容从原文本剥离 */
function stripRange(content: string, start: number, end: number): string {
  return (content.slice(0, start) + content.slice(end))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 宽松校验与默认值填充 */
function normalizeSpec(raw: unknown): ClarifyCardSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  // title 改为可选：每页使用 field.label 展示
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';

  const fieldsRaw = Array.isArray(obj.fields) ? obj.fields : [];
  const fields = fieldsRaw
    .map(normalizeField)
    .filter((f): f is NonNullable<ReturnType<typeof normalizeField>> => f !== null);

  if (fields.length === 0) return null;

  const variant = obj.variant === 'confirm' ? 'confirm' : 'normal';

  return {
    title,
    subtitle: typeof obj.subtitle === 'string' ? obj.subtitle : undefined,
    fields,
    submit_label: typeof obj.submit_label === 'string' ? obj.submit_label : undefined,
    skip_label: typeof obj.skip_label === 'string' ? obj.skip_label : undefined,
    variant,
  };
}

function normalizeField(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  const label = typeof obj.label === 'string' ? obj.label.trim() : '';
  const type = obj.type;
  if (!id || !label) return null;
  if (type !== 'single' && type !== 'multi' && type !== 'text' && type !== 'confirm') return null;

  const options = Array.isArray(obj.options)
    ? obj.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
    : undefined;

  // single / multi / confirm 必须有 options
  if ((type === 'single' || type === 'multi' || type === 'confirm') && (!options || options.length < 2)) {
    return null;
  }

  const inspirations = Array.isArray(obj.inspirations)
    ? obj.inspirations.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
    : undefined;

  return {
    id,
    label,
    type: type as 'single' | 'multi' | 'text' | 'confirm',
    options,
    allow_custom: obj.allow_custom === true,
    custom_label: typeof obj.custom_label === 'string' ? obj.custom_label : undefined,
    custom_placeholder: typeof obj.custom_placeholder === 'string' ? obj.custom_placeholder : undefined,
    inspirations,
    placeholder: typeof obj.placeholder === 'string' ? obj.placeholder : undefined,
    required: obj.required === true,
  };
}
