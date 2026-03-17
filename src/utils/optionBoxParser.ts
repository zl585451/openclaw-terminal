export interface OptionItem {
  num: number;
  label: string;
  value: string;
}

export interface TaskItem {
  id: string;
  text: string;
  done: boolean;
}

export type SegmentType = 'text' | 'pills' | 'checkbox' | 'question' | 'tasklist';

export interface RenderSegment {
  type: SegmentType;
  content: string;
  options: OptionItem[];
}

export interface ParsedContent {
  text: string;
  options: OptionItem[];
  totalPages?: number;
  /** 若为 true，options 应渲染为 TaskList（可勾选清单），而非 OptionBox */
  isTaskList?: boolean;
  /** 若为 true，options 全部是反思问题（以？结尾），应渲染为 QuestionCards 而非 Pill/OptionBox */
  isReflectiveQuestions?: boolean;
  /** 若为 true，强制使用 Pill 胶囊模式（单击发送）；为 false 时使用 checkbox 复选框模式 */
  forcePills?: boolean;
  /** 成对标签解析结果，存在时优先于 text/options 渲染 */
  segments?: RenderSegment[];
}

/**
 * 判断一个选项文本是否是反思问题。
 * 严格规则：必须以 ？ 或 ? 结尾，且长度在合理范围内。
 * 不再依赖"含疑问词"这类宽松条件，避免正文句子被误判。
 */
function isQuestionLabel(label: string): boolean {
  const t = label.trim();
  if (t.length < 5 || t.length > 120) return false;
  return t.endsWith('？') || t.endsWith('?');
}

/**
 * 任务清单触发关键词：必须是带冒号的标题行，或精确词组。
 * 移除了"接下来"等过于常见的词，避免普通建议列表被误识别为 TaskList。
 */
const TASK_HEADER_KEYWORDS = [
  '任务清单：', '待办清单：', '任务列表：',
  'todo:', 'checklist:',
  '步骤清单：', '执行步骤：',
];

function isTaskHeader(line: string): boolean {
  const lower = line.toLowerCase().trim();
  return TASK_HEADER_KEYWORDS.some((k) => lower.startsWith(k.toLowerCase()));
}

const START_MARKER = '[选项框开始]';
const END_MARKER = '[选项框结束]';
const OPTION_REGEX = /\[选项\s*(\d+)\s*:\s*([^\|\]]+)\s*\|\s*([^\]]+)\]/g;

export const OPTIONS_PLACEHOLDER = '\n<!--OPTIONS_HERE-->\n';

/** 解析 "1. xxx 2. xxx" 或 "1) xxx 2) xxx" 风格的选项（同一行或跨行） */
function parseNumberedOptions(text: string): OptionItem[] {
  const options: OptionItem[] = [];
  const rx = /(\d+)[.）、]\s*([^\d\n]+?)(?=\s*\d+[.）、]|$|\n)/gs;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const label = m[2].trim();
    if (label.length > 0 && label.length < 100) {
      options.push({ num: options.length + 1, label, value: label });
    }
  }
  return options;
}

/** 解析 [ ] / [x] 开头的 checkbox 列表（Claude 风格），不含星号的标题行 */
function parseCheckboxOptions(text: string): OptionItem[] {
  const lines = text.split(/\n/).filter((l) => l.trim());
  const options: OptionItem[] = [];
  const rx = /^[\s]*(?:[-*+]\s*)?\[\s*(?:[✓xX]|\s)\s*\]\s*(.+)$/;
  for (const line of lines) {
    if (/[*]/.test(line)) continue;
    const m = line.trim().match(rx);
    if (m) {
      const full = m[1].trim();
      if (full.length > 0 && full.length < 150 && !/[*]/.test(full)) {
        const parts = full.split(/[\s]*—[\s]*/);
        const value = parts[0]?.trim() || full;
        const label = full;
        options.push({ num: options.length + 1, label, value });
      }
    }
  }
  return options.length >= 1 ? options : [];
}

const SYMBOL_CHARS = '■●◆○◉▪▸•·';

/** 从 label 中清除前导符号字符（■●◆○ 等） */
function cleanLabel(label: string): string {
  return label.replace(new RegExp(`^[${SYMBOL_CHARS}]\\s*`), '').trim();
}

/** 解析含 ■ ● ◆ ○ 等符号的选项，支持 "■ xxx"、"- ■ xxx"、"* ■ xxx" 等格式 */
function parseSymbolOptions(text: string): OptionItem[] {
  const lines = text.split(/\n/).filter((l) => l.trim());
  const options: OptionItem[] = [];
  const rx = new RegExp(`^[\\s]*(?:[-*+]\\s*)?[${SYMBOL_CHARS}]\\s*(.+)$`);
  for (const line of lines) {
    const m = line.trim().match(rx);
    if (m) {
      const full = m[1].trim();
      if (full.length > 0 && full.length < 150) {
        const parts = full.split(/[\s]*→[\s]*/);
        const value = parts[0]?.trim() || full;
        options.push({ num: options.length + 1, label: full, value });
      }
    }
  }
  return options.length >= 1 ? options : [];
}

/**
 * 解析换行列表：每行 "1. xxx" 或 "- xxx"。
 * 含 Markdown 强调（*）的行跳过，避免信息列表误触发交互。
 * 最低阈值提高到 3 条，减少两行普通列表的误触发。
 */
function parseLineOptions(text: string): OptionItem[] {
  const lines = text.split(/\n/).filter((l) => l.trim());
  const options: OptionItem[] = [];
  const rx = /^[\s]*(\d+)[.）、]\s*(.+)$|^[\s]*[-*]\s*(.+)$/;
  for (const line of lines) {
    if (/[*]/.test(line)) continue;
    const m = line.match(rx);
    if (m) {
      const raw = (m[2] || m[3] || '').trim();
      const label = cleanLabel(raw);
      if (label.length > 0 && label.length < 100) {
        options.push({ num: options.length + 1, label, value: label });
      }
    }
  }
  // 阈值从 2 提高到 3，减少两行列表的误触发
  return options.length >= 3 ? options : [];
}

/** 从文本解析 "共X页" */
function parseTotalPages(text: string): number | undefined {
  const m = text.match(/共\s*(\d+)\s*页/);
  return m ? Math.max(1, parseInt(m[1], 10)) : undefined;
}

/** 要过滤的 UI 控件文字（已由组件实现，不需显示） */
const UI_TEXT_PATTERNS = [
  /\[上一页\]/,
  /\[下一页\]/,
  /\[第\d+\/\d+页\]/,
  /\[确认导入\]/,
  /\[取消\]/,
  /\[确认发送\]/,
];

function filterExpectedEffect(text: string): string {
  if (!text) return text;
  return text
    .split('\n')
    .filter((line) => {
      if (line.includes('预期效果')) return false;
      return !UI_TEXT_PATTERNS.some((p) => p.test(line.trim()));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 最终清理：只清理 label 前导符号，不再二次清理正文 */
function finalCleanup(result: ParsedContent): ParsedContent {
  if (result.options.length === 0) return result;
  const text = result.text.replace(/\n{3,}/g, '\n\n').trim();
  const options = result.options.map(o => ({
    ...o,
    label: cleanLabel(o.label),
    value: cleanLabel(o.value),
  }));
  return { ...result, text, options };
}

/** 剥离 fenced code blocks（``` ... ```），返回只含非代码块内容的文本，用于选项检测 */
function stripFencedCodeBlocks(text: string): string {
  return text.replace(/^`{3,}[^\n]*\n[\s\S]*?^`{3,}\s*$/gm, '');
}

/** 剥离 Markdown 表格行（2+ 连续以 | 开头的行视为表格块），避免表格内容触发交互检测 */
function stripMarkdownTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (/^\s*\|/.test(lines[i])) {
      let j = i;
      while (j < lines.length && /^\s*\|/.test(lines[j])) j++;
      if (j - i >= 2) {
        i = j;
        continue;
      }
    }
    result.push(lines[i]);
    i++;
  }
  return result.join('\n');
}

/** 移除代码块外部的 checkbox 行，保留代码块内部的不动 */
function removeCheckboxLinesOutsideCodeBlocks(text: string, placeholder?: string): string {
  const lines = text.split('\n');
  let inCodeBlock = false;
  let placeholderInserted = false;
  const checkRx = /^[\s]*(?:[-*+]\s*)?\[\s*(?:[✓xX]|\s)\s*\]\s*/;
  const result: string[] = [];
  for (const line of lines) {
    if (/^`{3,}/.test(line.trim())) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    if (inCodeBlock) { result.push(line); continue; }
    if (checkRx.test(line)) {
      if (placeholder && !placeholderInserted) {
        placeholderInserted = true;
        result.push(placeholder);
      }
      continue;
    }
    result.push(line);
  }
  return result.join('\n');
}

type RenderHint = 'pill' | 'checkbox' | 'question' | 'tasklist' | 'none';
const RENDER_HINT_RX = /\[RENDER:(pill|checkbox|question|tasklist|none)\]/i;

/** 检测并剥离 [RENDER:xxx] 标记 */
function extractRenderHint(text: string): { hint: RenderHint | null; cleaned: string } {
  const m = text.match(RENDER_HINT_RX);
  if (!m) return { hint: null, cleaned: text };
  return {
    hint: m[1].toLowerCase() as RenderHint,
    cleaned: text.replace(RENDER_HINT_RX, '').replace(/\n{3,}/g, '\n\n').trim(),
  };
}

const PAIRED_TAG_RX = /\[(pills|checkbox|question|tasklist|text)\]([\s\S]*?)\[\/\1\]/gi;

/** 将非空行作为普通选项（兜底：标签内没有标准格式时） */
function parsePlainLines(text: string): OptionItem[] {
  return text.split('\n')
    .map(l => l.replace(/^[-*+]\s*/, '').trim())
    .filter(l => l.length > 0 && l.length < 100)
    .map((l, i) => ({ num: i + 1, label: l, value: l }));
}

/**
 * 计算原始文本中所有 fenced code block 的字符范围 [start, end)。
 * 用于在 parseTaggedContent 中过滤掉落在代码块内的标签匹配。
 */
function getCodeBlockRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fence = /^(`{3,})[^\n]*$/gm;
  let openMatch: RegExpExecArray | null = null;
  let openFence = '';
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text)) !== null) {
    const ticks = m[1]!;
    if (!openMatch) {
      openMatch = m;
      openFence = ticks;
    } else if (ticks.length >= openFence.length) {
      const start = openMatch.index;
      const end = m.index + m[0].length;
      ranges.push([start, end]);
      openMatch = null;
      openFence = '';
    }
  }
  if (openMatch) {
    ranges.push([openMatch.index, text.length]);
  }
  return ranges;
}

/** 检查一个字符位置是否落在任意代码块范围内 */
function isInsideCodeBlock(pos: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => pos >= start && pos < end);
}

/** 解析成对标签 [pills]...[/pills] 等，返回按顺序排列的渲染段 */
function parseTaggedContent(content: string): { segments: RenderSegment[]; found: boolean } {
  PAIRED_TAG_RX.lastIndex = 0;
  const allMatches = [...content.matchAll(PAIRED_TAG_RX)];
  if (allMatches.length === 0) return { segments: [], found: false };

  const codeRanges = getCodeBlockRanges(content);
  const matches = codeRanges.length > 0
    ? allMatches.filter(m => !isInsideCodeBlock(m.index!, codeRanges))
    : allMatches;

  if (matches.length === 0) return { segments: [], found: false };

  const segments: RenderSegment[] = [];
  let lastIndex = 0;

  for (const m of matches) {
    const matchStart = m.index!;
    const matchEnd = matchStart + m[0].length;

    const textBefore = content.slice(lastIndex, matchStart).trim();
    if (textBefore) {
      segments.push({ type: 'text', content: filterExpectedEffect(textBefore), options: [] });
    }

    const tagType = m[1].toLowerCase() as SegmentType;
    const inner = m[2].trim();

    switch (tagType) {
      case 'text':
        if (inner) segments.push({ type: 'text', content: filterExpectedEffect(inner), options: [] });
        break;
      case 'pills': {
        let opts = parseSymbolOptions(inner);
        if (opts.length === 0) opts = parsePlainLines(inner);
        segments.push({ type: 'pills', content: '', options: opts.map(o => ({ ...o, label: cleanLabel(o.label), value: cleanLabel(o.value) })) });
        break;
      }
      case 'checkbox': {
        let opts = parseCheckboxOptions(inner);
        if (opts.length === 0) opts = parsePlainLines(inner);
        segments.push({ type: 'checkbox', content: '', options: opts.map(o => ({ ...o, label: cleanLabel(o.label), value: cleanLabel(o.value) })) });
        break;
      }
      case 'question': {
        let opts = parseNumberedOptions(inner);
        if (opts.length < 2) opts = parseLineOptions(inner);
        if (opts.length < 2) opts = parsePlainLines(inner);
        const qOpts = opts.filter(o => isQuestionLabel(o.label));
        const finalOpts = qOpts.length >= 2 ? qOpts : opts;
        segments.push({ type: 'question', content: '', options: finalOpts.map((o, i) => ({ ...o, num: i + 1, label: cleanLabel(o.label), value: cleanLabel(o.value) })) });
        break;
      }
      case 'tasklist': {
        let opts = parseCheckboxOptions(inner);
        if (opts.length === 0) opts = parsePlainLines(inner);
        segments.push({ type: 'tasklist', content: '', options: opts.map(o => ({ ...o, label: cleanLabel(o.label), value: cleanLabel(o.value) })) });
        break;
      }
    }

    lastIndex = matchEnd;
  }

  const textAfter = content.slice(lastIndex).trim();
  if (textAfter) {
    segments.push({ type: 'text', content: filterExpectedEffect(textAfter), options: [] });
  }

  return { segments, found: true };
}

// LRU 缓存：避免同一条消息反复解析
const parseCache = new Map<string, ParsedContent>();
const CACHE_MAX = 200;

function getCacheKey(content: string): string {
  return content.slice(0, 100) + ':' + content.length;
}

function _parseOptionBox(content: string): ParsedContent {
  if (!content || typeof content !== 'string') return { text: filterExpectedEffect(content || ''), options: [] };

  // ① 成对标签 [pills]...[/pills] 等——最高优先级
  const { segments, found: hasTaggedContent } = parseTaggedContent(content);
  if (hasTaggedContent) {
    const textParts = segments.filter(s => s.type === 'text').map(s => s.content).join('\n\n');
    return { text: textParts, options: [], segments };
  }

  // ② 检测 [RENDER:xxx] 显式标记
  const { hint, cleaned: contentWithoutHint } = extractRenderHint(content);

  if (hint === 'none') {
    return { text: filterExpectedEffect(contentWithoutHint), options: [] };
  }

  // ③ 显式协议 [选项框开始] ... [选项框结束]（遗留，保持兼容）
  const startIdx = contentWithoutHint.indexOf(START_MARKER);
  const endIdx = contentWithoutHint.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const beforeBlock = contentWithoutHint.slice(0, startIdx).trim();
    const blockContent = contentWithoutHint.slice(startIdx + START_MARKER.length, endIdx).trim();
    const afterBlock = contentWithoutHint.slice(endIdx + END_MARKER.length).trim();
    const options: OptionItem[] = [];
    let m: RegExpExecArray | null;
    OPTION_REGEX.lastIndex = 0;
    while ((m = OPTION_REGEX.exec(blockContent)) !== null) {
      options.push({
        num: parseInt(m[1], 10),
        label: m[2].trim(),
        value: m[3].trim(),
      });
    }
    const fullText = [beforeBlock, blockContent, afterBlock].filter(Boolean).join('\n\n');
    const totalPages = parseTotalPages(fullText);
    const text = filterExpectedEffect([beforeBlock, afterBlock].filter(Boolean).join('\n\n').trim());
    return finalCleanup({ text, options, totalPages });
  }

  const textForDetection = stripMarkdownTables(stripFencedCodeBlocks(contentWithoutHint));

  // 当有 hint 时，只运行对应的检测分支
  if (hint === 'pill') {
    const symbolOpts = parseSymbolOptions(textForDetection);
    if (symbolOpts.length >= 1) {
      const totalPages = parseTotalPages(contentWithoutHint);
      const symbolLineRx = new RegExp(`^[\\s]*(?:[-*+]\\s*)?[${SYMBOL_CHARS}]\\s*[^\\n]*$`, 'gm');
      let replaced = false;
      const withPlaceholder = contentWithoutHint.replace(symbolLineRx, (_match) => {
        if (!replaced) { replaced = true; return OPTIONS_PLACEHOLDER; }
        return '';
      });
      const text = filterExpectedEffect(withPlaceholder.replace(/\n{3,}/g, '\n\n').trim());
      return finalCleanup({ text, options: symbolOpts, totalPages, forcePills: true });
    }
    return { text: filterExpectedEffect(contentWithoutHint), options: [] };
  }

  if (hint === 'checkbox') {
    const checkboxOpts = parseCheckboxOptions(textForDetection);
    if (checkboxOpts.length >= 1) {
      const totalPages = parseTotalPages(contentWithoutHint);
      const cleaned = removeCheckboxLinesOutsideCodeBlocks(contentWithoutHint, OPTIONS_PLACEHOLDER);
      const text = filterExpectedEffect(cleaned.replace(/\n{3,}/g, '\n\n').trim());
      return finalCleanup({ text, options: checkboxOpts, totalPages, forcePills: false });
    }
    return { text: filterExpectedEffect(contentWithoutHint), options: [] };
  }

  if (hint === 'tasklist') {
    const checkboxOpts = parseCheckboxOptions(textForDetection);
    if (checkboxOpts.length >= 1) {
      const totalPages = parseTotalPages(contentWithoutHint);
      const cleaned = removeCheckboxLinesOutsideCodeBlocks(contentWithoutHint, OPTIONS_PLACEHOLDER);
      const text = filterExpectedEffect(cleaned.replace(/\n{3,}/g, '\n\n').trim());
      return finalCleanup({ text, options: checkboxOpts, totalPages, isTaskList: true, forcePills: false });
    }
    return { text: filterExpectedEffect(contentWithoutHint), options: [] };
  }

  if (hint === 'question') {
    const paragraphs = textForDetection.split(/\n\n+/);
    for (let i = 0; i < paragraphs.length; i++) {
      const block = paragraphs[i].trim();
      let options = parseNumberedOptions(block);
      if (options.length < 2) options = parseLineOptions(block);
      if (options.length >= 2) {
        const questionOpts = options.filter((o) => isQuestionLabel(o.label));
        if (questionOpts.length >= 2) {
          const renumbered = questionOpts.map((o, idx) => ({ ...o, num: idx + 1 }));
          const before = paragraphs.slice(0, i).join('\n\n').trim();
          const after = paragraphs.slice(i + 1).join('\n\n').trim();
          const text = filterExpectedEffect([before, OPTIONS_PLACEHOLDER, after].filter(Boolean).join('\n\n').trim());
          return finalCleanup({ text, options: renumbered, totalPages: undefined, isReflectiveQuestions: true });
        }
      }
    }
    return { text: filterExpectedEffect(contentWithoutHint), options: [] };
  }

  // ④ 无 hint 时，使用自动检测流程（保守模式）

  // 自动检测 [ ] checkbox 列表——仅在代码块外部检测
  const checkboxOpts = parseCheckboxOptions(textForDetection);
  if (checkboxOpts.length >= 1) {
    const totalPages = parseTotalPages(contentWithoutHint);
    const cleaned = removeCheckboxLinesOutsideCodeBlocks(contentWithoutHint, OPTIONS_PLACEHOLDER);
    const text = filterExpectedEffect(cleaned.replace(/\n{3,}/g, '\n\n').trim());

    // 精确关键词匹配：只有带冒号的任务标题行才触发 TaskList
    const linesBeforeCheckbox = textForDetection.split('\n');
    let foundTaskHeader = false;
    for (const line of linesBeforeCheckbox) {
      if (/^\s*[\-\*\+]?\s*\[\s*(?:[✓xX]|\s)\s*\]/.test(line)) break;
      if (isTaskHeader(line)) { foundTaskHeader = true; break; }
    }
    return finalCleanup({ text, options: checkboxOpts, totalPages, isTaskList: foundTaskHeader, forcePills: false });
  }

  // 自动检测 ■ ● ◆ ○ 等符号开头的选项
  const symbolOpts = parseSymbolOptions(textForDetection);
  if (symbolOpts.length >= 1) {
    const totalPages = parseTotalPages(contentWithoutHint);
    const symbolLineRx = new RegExp(`^[\\s]*(?:[-*+]\\s*)?[${SYMBOL_CHARS}]\\s*[^\\n]*$`, 'gm');
    let replaced = false;
    const withPlaceholder = contentWithoutHint.replace(symbolLineRx, (_match) => {
      if (!replaced) { replaced = true; return OPTIONS_PLACEHOLDER; }
      return '';
    });
    const text = filterExpectedEffect(withPlaceholder.replace(/\n{3,}/g, '\n\n').trim());
    return finalCleanup({ text, options: symbolOpts, totalPages, forcePills: true });
  }

  // 自动检测：扫描所有段落的 "1. xxx" / "- xxx" 列表
  // 注意：parseLineOptions 阈值已提高到 3，减少误触发
  const paragraphs = textForDetection.split(/\n\n+/);
  let bestReflective: { options: OptionItem[]; i: number } | null = null;
  let bestOptions: { options: OptionItem[]; i: number } | null = null;

  for (let i = 0; i < paragraphs.length; i++) {
    const block = paragraphs[i].trim();
    let options = parseNumberedOptions(block);
    if (options.length < 3) options = parseLineOptions(block);
    if (options.length >= 3 && options.length <= 20) {
      const questionOpts = options.filter((o) => isQuestionLabel(o.label));
      // 问题卡片要求所有选项都以问号结尾，且至少 2 个
      const hasEnoughQuestions = questionOpts.length >= 2 && questionOpts.length === options.length;

      if (hasEnoughQuestions) {
        const renumbered = questionOpts.map((o, idx) => ({ ...o, num: idx + 1 }));
        if (!bestReflective || renumbered.length > bestReflective.options.length) {
          bestReflective = { options: renumbered, i };
        }
      } else if (!bestOptions) {
        bestOptions = { options, i };
      }
    }
  }

  const chosen = bestReflective ?? bestOptions;
  if (chosen) {
    const { options, i } = chosen;
    const before = paragraphs.slice(0, i).join('\n\n').trim();
    const after = paragraphs.slice(i + 1).join('\n\n').trim();
    const totalPages = parseTotalPages(contentWithoutHint);
    const text = filterExpectedEffect([before, OPTIONS_PLACEHOLDER, after].filter(Boolean).join('\n\n').trim());
    const isReflectiveQuestions = !!bestReflective;
    return finalCleanup({ text, options, totalPages, isReflectiveQuestions });
  }

  const totalPages = parseTotalPages(contentWithoutHint);
  return { text: filterExpectedEffect(contentWithoutHint), options: [], totalPages };
}

export function parseOptionBox(content: string): ParsedContent {
  if (!content || typeof content !== 'string')
    return { text: filterExpectedEffect(content || ''), options: [] };

  const cacheKey = getCacheKey(content);
  const cached = parseCache.get(cacheKey);
  if (cached) return cached;

  const result = _parseOptionBox(content);

  if (parseCache.size >= CACHE_MAX) {
    const firstKey = parseCache.keys().next().value;
    if (firstKey !== undefined) parseCache.delete(firstKey);
  }
  parseCache.set(cacheKey, result);

  return result;
}
