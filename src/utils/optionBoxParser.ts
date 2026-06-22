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

export type SegmentType = 'text' | 'pills' | 'checkbox' | 'question' | 'tasklist' | 'cot';

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
export function isQuestionLabel(label: string): boolean {
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
  const lower = line.toLowerCase().replace(/[#>*_`]/g, '').trim();
  if (TASK_HEADER_KEYWORDS.some((k) => lower.startsWith(k.toLowerCase()))) return true;
  return /(?:接下来|下面|以下|需要|执行|待完成|待处理).{0,16}(?:任务清单|待办清单|任务列表|执行清单|步骤清单)/.test(lower);
}

const CHOICE_CUE_KEYWORDS = [
  '请选择',
  '请选',
  '选一个',
  '选哪',
  '你想选',
  '你想先做',
  '想先做哪个',
  '你更想',
  '选项',
  '可选',
  '从下面选',
  '从以下选',
  '可以选',
  '你要哪个',
  '哪个方向',
  '哪个方案',
  '选哪个',
];

function hasChoiceCue(text: string): boolean {
  const normalized = text.replace(/\s+/g, '').toLowerCase();
  return CHOICE_CUE_KEYWORDS.some((keyword) => normalized.includes(keyword.replace(/\s+/g, '').toLowerCase()));
}

function hasNegativeInteractionCue(text: string): boolean {
  const normalized = text.replace(/\s+/g, '').toLowerCase();
  return [
    '不是选项',
    '不是用户待选项',
    '不是按钮',
    '不触发任何真正的交互按钮',
    '只是协议说明',
    '只是文档示例',
    '语法示例',
  ].some((keyword) => normalized.includes(keyword.replace(/\s+/g, '').toLowerCase()));
}

function isMostlySymbolOptionBlock(text: string): boolean {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const symbolLineRx = new RegExp(`^(?:[-*+]\\s*)?[${SYMBOL_CHARS}]\\s*.+$`);
  return lines.every((line) => symbolLineRx.test(line));
}

function isMostlyCheckboxOptionBlock(text: string): boolean {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const checkboxLineRx = /^(?:[-*+]\s*)?(?:\[\s*(?:[✓xX]|\s)\s*\]|[☐□☑✓])\s*.+$/;
  return lines.every((line) => checkboxLineRx.test(line));
}

function shouldAutoDetectSymbolOptions(text: string, options: OptionItem[]): boolean {
  if (options.length < 2) return false;
  if (hasNegativeInteractionCue(text) && !isMostlySymbolOptionBlock(text)) return false;
  return hasChoiceCue(text) || isMostlySymbolOptionBlock(text);
}

function shouldAutoDetectCheckboxOptions(text: string, options: OptionItem[], hasTaskHeader: boolean): boolean {
  if (options.length < 2) return false;
  if (hasNegativeInteractionCue(text) && !isMostlyCheckboxOptionBlock(text)) return false;
  return hasTaskHeader || hasChoiceCue(text) || isMostlyCheckboxOptionBlock(text);
}

const START_MARKER = '[选项框开始]';
const END_MARKER = '[选项框结束]';
const OPTION_REGEX = /\[选项\s*(\d+)\s*:\s*([^\|\]]+)\s*\|\s*([^\]]+)\]/g;

export const OPTIONS_PLACEHOLDER = '\n<!--OPTIONS_HERE-->\n';

/** 解析 "1. xxx 2. xxx" 或 "1) xxx 2) xxx" 风格的选项（同一行或跨行） */
export function parseNumberedOptions(text: string): OptionItem[] {
  const options: OptionItem[] = [];
  // 只把“行首的编号”当作边界，允许内容里出现数字（版本号/日期/金额等）
  // 例如：`1. OCT v0.1.4 最想加什么？` 不应被截断。
  const rx = /(?:^|\n)\s*(\d+)[.）、]\s*(.+?)(?=\n\s*\d+[.）、]\s*|$)/gs;
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
export function parseCheckboxOptions(text: string): OptionItem[] {
  const lines = text.split(/\n/).filter((l) => l.trim());
  const options: OptionItem[] = [];
  const rx = /^[\s]*(?:[-*+]\s*)?(?:\[\s*(?:[✓xX]|\s)\s*\]|[☐□☑✓])\s*(.+)$/;
  for (const line of lines) {
    const m = line.trim().match(rx);
    if (m) {
      const full = m[1]
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .trim();
      if (full.length > 0 && full.length < 150) {
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
export function cleanLabel(label: string): string {
  return label.replace(new RegExp(`^[${SYMBOL_CHARS}]\\s*`), '').trim();
}

/** 对一组选项的 label/value 批量做 cleanLabel，可选地重新编号（num: index+1） */
function cleanOptions(opts: OptionItem[], renumber = false): OptionItem[] {
  return opts.map((o, i) => ({
    ...o,
    ...(renumber ? { num: i + 1 } : null),
    label: cleanLabel(o.label),
    value: cleanLabel(o.value),
  }));
}

/** 解析含 ■ ● ◆ ○ 等符号的选项，支持 "■ xxx"、"- ■ xxx"、"* ■ xxx" 等格式 */
export function parseSymbolOptions(text: string): OptionItem[] {
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
 * 仅供显式标签/Hint 分支使用；自动检测阶段不要直接拿普通 "-" Markdown 列表做交互。
 * 含 Markdown 强调（*）的行跳过，避免信息列表误触发交互。
 * 最低阈值提高到 3 条，减少两行普通列表的误触发。
 */
export function parseLineOptions(text: string): OptionItem[] {
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
  
  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // 检测代码块开始/结束
    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    
    // 在代码块内，保留所有内容
    if (inCodeBlock) {
      result.push(line);
      continue;
    }
    
    // 保留真正的 Markdown 表格行（排除文件树结构的误识别）
    if (/^\s*\|/.test(line) && !isFileTreeLine(line)) {
      result.push(line);
      continue;
    }
    
    // 保留列表项（- * + 或数字. 开头）
    if (/^\s*[-*+]\s/.test(line) || /^\s*\d+[.)、]\s/.test(line)) {
      result.push(line);
      continue;
    }
    
    // 保留空行
    if (trimmed === '') {
      result.push(line);
      continue;
    }
    
    // 过滤"预期效果"行
    if (line.includes('预期效果')) {
      continue;
    }
    
    // 过滤 UI 控件描述行
    if (UI_TEXT_PATTERNS.some((p) => p.test(trimmed))) {
      continue;
    }
    
    // 其他内容保留
    result.push(line);
  }
  
  return result
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 最终清理：只清理 label 前导符号，不再二次清理正文 */
function finalCleanup(result: ParsedContent): ParsedContent {
  if (result.options.length === 0) return result;
  const text = result.text.replace(/\n{3,}/g, '\n\n').trim();
  const options = cleanOptions(result.options);
  return { ...result, text, options };
}

/** 剥离 fenced code blocks（``` ... ```），返回只含非代码块内容的文本，用于选项检测 */
function stripFencedCodeBlocks(text: string): string {
  return text.replace(/^`{3,}[^\n]*\n[\s\S]*?^`{3,}\s*$/gm, '');
}

/** 检查是否为 Markdown 表格分隔符行（如 |------|------| 或 |:-----|:----:|） */
function isMarkdownTableSeparator(line: string): boolean {
  // 分隔符行特征：以 | 开头，包含至少一个 - 或 :，且只有 | - : 和空白字符
  const trimmed = line.trim();
  if (!/^\s*\|/.test(trimmed)) return false;
  // 检查是否包含 - 或 :，且只有允许的字符
  const content = trimmed.replace(/^\s*\|/, '').replace(/\|\s*$/, '');
  return /^[\s\-:|]+$/.test(content) && /[-]/.test(content);
}

/** 检查是否为文件树结构（包含 ├── └── │ 等符号） */
function isFileTreeLine(line: string): boolean {
  // 文件树结构特征：包含 ├──、└──、│ 等符号
  return /[├└┌┐┘┼─│]/.test(line);
}

/** 剥离 Markdown 表格行（真正的表格：表头 + 分隔符行），避免表格内容触发交互检测
 *  修复：排除文件树结构的误识别（文件树使用 | 符号但不是表格）
 */
function stripMarkdownTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const currentLine = lines[i];

    // 检查是否以 | 开头（潜在表格行）
    if (/^\s*\|/.test(currentLine)) {
      // 首先排除文件树结构
      if (isFileTreeLine(currentLine)) {
        result.push(currentLine);
        i++;
        continue;
      }

      // 收集连续的以 | 开头的行
      const potentialTableLines: string[] = [currentLine];
      let j = i + 1;
      while (j < lines.length && /^\s*\|/.test(lines[j])) {
        // 同样检查文件树
        if (isFileTreeLine(lines[j])) {
          break;
        }
        potentialTableLines.push(lines[j]);
        j++;
      }

      // 检查是否是真正的 Markdown 表格：
      // 1. 至少需要 2 行（表头 + 分隔符）
      // 2. 第二行必须是分隔符行（包含 --- 格式）
      if (potentialTableLines.length >= 2) {
        const secondLine = potentialTableLines[1];
        const hasSeparator = isMarkdownTableSeparator(secondLine);

        if (hasSeparator) {
          // 跳过整个表格块，避免表格内 | 符号干扰后续 ■ / - [ ] 检测
          i = j;
          continue;
        } else {
          // 无分隔符，非标准表格，保留
        }
      }
    }

    result.push(currentLine);
    i++;
  }

  return result.join('\n');
}

/**
 * 移除代码块/表格行之外的 ■●◆○ 等符号选项行，在第一处命中位置插入占位符。
 * 用于符号选项被检测到之后，从原文中"摘掉"选项行，只保留正文。
 */
function removeSymbolOptionLinesOutsideCodeBlocks(text: string, placeholder: string): string {
  const lines = text.split('\n');
  const symbolLineRx = new RegExp(`^[\\s]*(?:[-*+]\\s*)?[${SYMBOL_CHARS}]\\s*.+$`);
  const codeRanges = getCodeBlockRanges(text);
  let placeholderInserted = false;
  const resultLines: string[] = [];
  let charOffset = 0;

  for (const line of lines) {
    const lineStart = charOffset;
    charOffset += line.length + 1; // +1 for \n

    // 跳过代码块内的行
    if (isInsideCodeBlock(lineStart, codeRanges)) {
      resultLines.push(line);
      continue;
    }

    // 跳过表格行（| 开头）
    if (/^\s*\|/.test(line)) {
      resultLines.push(line);
      continue;
    }

    // 匹配选项行：不加入结果（被移除），仅在第一次命中处插入占位符
    if (symbolLineRx.test(line)) {
      if (!placeholderInserted) {
        resultLines.push(placeholder);
        placeholderInserted = true;
      }
      continue;
    }

    resultLines.push(line);
  }

  return resultLines.join('\n');
}

/** 移除代码块外部的 checkbox 行，保留代码块内部的不动 */
function removeCheckboxLinesOutsideCodeBlocks(text: string, placeholder?: string): string {
  const lines = text.split('\n');
  let inCodeBlock = false;
  let placeholderInserted = false;
  const checkRx = /^[\s]*(?:[-*+]\s*)?(?:\[\s*(?:[✓xX]|\s)\s*\]|[☐□☑✓])\s*/;
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

// 允许开标签前多一个 `/`（例如错误输出成 `/[question]...[/question]`）
// 或 `/   [question]...`：这样可避免标签原样泄露成纯文本。
// 标签名两侧允许可选空白（模型可能输出 [ question ] 或 [ / question ]）
// 注意：保持 // 不受影响，不匹配纯 // 注释
// ⚠️ 此 regex 带 g flag，内部 parseTaggedContent 已改用局部实例避免并发问题；
//    保留导出仅供外部测试或兼容使用，调用者应使用 matchAll 或每次创建新实例。
export const PAIRED_TAG_RX = /(?:\/\s*)?\[\s*(pills|checkbox|question|tasklist|text|cot)\s*\]([\s\S]*?)\[\s*\/\s*\1\s*\]/gi;

/** 将非空行作为普通选项（兜底：标签内没有标准格式时） */
export function parsePlainLines(text: string): OptionItem[] {
  return text.split('\n')
    .map(l => l.replace(/^[-*+]\s*/, '').trim())
    .filter(l => l.length > 0 && l.length < 100)
    .map((l, i) => ({ num: i + 1, label: l, value: l }));
}

/** 解析形如 "A || B || C" 的选项（用于部分模型输出的降级格式） */
export function parsePipeSeparatedOptions(text: string): OptionItem[] {
  const parts = text
    .split(/\s*\|\|\s*/g)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p.length < 120);

  // 低阈值：至少 2 项才认为是选项列表
  if (parts.length < 2) return [];

  return parts.map((label, i) => ({ num: i + 1, label, value: label }));
}

/**
 * 计算原始文本中所有 fenced code block 的字符范围 [start, end)。
 * 用于在 parseTaggedContent 中过滤掉落在代码块内的标签匹配。
 */
export function getCodeBlockRanges(text: string): Array<[number, number]> {
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
export function isInsideCodeBlock(pos: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => pos >= start && pos < end);
}

/** 成对标签解析后，对纯 text 段内 □ / [ ] 行做二次拆分，避免与 [pills] 等混排时漏渲染 */
function enhanceTextSegmentsWithInlineCheckboxes(segments: RenderSegment[]): RenderSegment[] {
  const taskHintFromEnhanced = (enhanced: RenderSegment[]): boolean => {
    for (let i = enhanced.length - 1; i >= 0; i--) {
      const s = enhanced[i];
      if (s.type !== 'text' || !s.content.trim()) continue;
      const lines = s.content.split('\n');
      for (let j = lines.length - 1; j >= 0; j--) {
        const t = lines[j].trim().toLowerCase();
        if (!t) continue;
        return isTaskHeader(t);
      }
    }
    return false;
  };

  const enhancedSegments: RenderSegment[] = [];

  for (const seg of segments) {
    if (seg.type !== 'text' || !seg.content.trim()) {
      enhancedSegments.push(seg);
      continue;
    }

    const lines = seg.content.split('\n');
    const normalLines: string[] = [];
    const checkboxLines: string[] = [];
    let inCheckboxBlock = false;

    const parseCheckboxLabels = (cls: string[]) =>
      cls
        .map((cl, i) => {
          const label = cl
            .replace(/^[•\-*+]?\s*[□☐☑✓✗]\s*/, '')
            .replace(/^[•\-*+]?\s*\[\s*[xX✓ ]?\s*\]\s*/, '')
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/__(.*?)__/g, '$1')
            .trim();
          return { num: i + 1, label, value: label };
        })
        .filter((o) => o.label.length > 0);

    const flushCheckboxBlock = () => {
      if (checkboxLines.length === 0) return;
      const opts = parseCheckboxLabels(checkboxLines);
      if (opts.length >= 2) {
        if (normalLines.length > 0) {
          enhancedSegments.push({ type: 'text', content: normalLines.join('\n'), options: [] });
          normalLines.length = 0;
        }
        const isTask = taskHintFromEnhanced(enhancedSegments);
        enhancedSegments.push({
          type: isTask ? 'tasklist' : 'checkbox',
          content: '',
          options: cleanOptions(opts),
        });
      } else {
        normalLines.push(...checkboxLines);
      }
      checkboxLines.length = 0;
      inCheckboxBlock = false;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const isCheckboxLine =
        /^[•\-*+]?\s*[□☐☑✓✗]/.test(trimmed) ||
        /^[•\-*+]?\s*\[\s*[xX✓ ]?\s*\]/.test(trimmed);

      if (isCheckboxLine) {
        if (!inCheckboxBlock && normalLines.length > 0) {
          enhancedSegments.push({ type: 'text', content: normalLines.join('\n'), options: [] });
          normalLines.length = 0;
        }
        inCheckboxBlock = true;
        checkboxLines.push(trimmed);
      } else {
        if (inCheckboxBlock) flushCheckboxBlock();
        normalLines.push(line);
      }
    }
    if (inCheckboxBlock) flushCheckboxBlock();

    if (normalLines.length > 0) {
      const content = normalLines.join('\n').trim();
      if (content) enhancedSegments.push({ type: 'text', content, options: [] });
    }
  }

  const changed =
    enhancedSegments.length !== segments.length ||
    enhancedSegments.some((s, i) => s.type !== segments[i]?.type);
  return changed ? enhancedSegments : segments;
}

/** 解析成对标签 [pills]...[/pills] 等，返回按顺序排列的渲染段 */
function parseTaggedContent(content: string): { segments: RenderSegment[]; found: boolean } {
  // 每次调用创建新的 regex 实例，避免全局状态的 lastIndex 并发问题
  const pairedTagRx = /(?:\/\s*)?\[\s*(pills|checkbox|question|tasklist|text|cot)\s*\]([\s\S]*?)\[\s*\/\s*\1\s*\]/gi;
  const allMatches = [...content.matchAll(pairedTagRx)];
  
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

    const textBefore = content.slice(lastIndex, matchStart);
    
    if (textBefore.trim()) {
      const filtered = filterExpectedEffect(textBefore);
      segments.push({ type: 'text', content: filtered, options: [] });
    }

    const tagType = m[1].toLowerCase() as SegmentType;
    const inner = m[2].trim();

    switch (tagType) {
      case 'text':
        if (inner) segments.push({ type: 'text', content: filterExpectedEffect(inner), options: [] });
        break;
      case 'cot': {
        // CoT 内容原样保留，不解析选项
        if (inner) {
          segments.push({ type: 'cot', content: inner, options: [] });
        }
        break;
      }
      case 'pills': {
        // pills 标签内必须有符号选项（■●◆○ 等），没有就当普通文本
        const opts = parseSymbolOptions(inner);
        
        if (opts.length > 0) {
          // 过滤掉选项行，保留其他内容作为文本
          const optLines = inner.split('\n');
          const remainingLines: string[] = [];
          for (const line of optLines) {
            const trimmed = line.trim();
            const isOptionLine = /^[\s]*(?:[-*+]\s*)?[■●◆○◉▪▸•·]/.test(line);
            const isKnownOption = opts.some(o => trimmed.includes(o.label) || trimmed.includes(o.value));
            if (!isOptionLine && !isKnownOption && trimmed !== '') {
              remainingLines.push(line);
            } else if (trimmed === '') {
              remainingLines.push(line);
            }
          }
          
          segments.push({ type: 'pills', content: '', options: cleanOptions(opts) });
          
          const remainingContent = remainingLines.join('\n').trim();
          if (remainingContent.length > 0) {
            const filtered = filterExpectedEffect(remainingContent);
            if (filtered.length > 0) {
              segments.push({ type: 'text', content: filtered, options: [] });
            }
          }
        } else {
          // 没有符号选项 → 整个内容当普通文本渲染，不做交互
          if (inner.trim()) {
            segments.push({ type: 'text', content: filterExpectedEffect(inner), options: [] });
          }
        }
        break;
      }
      case 'checkbox':
      case 'tasklist': {
        let opts = parseCheckboxOptions(inner);
        if (opts.length === 0) opts = parsePlainLines(inner);
        segments.push({ type: tagType, content: '', options: cleanOptions(opts) });
        break;
      }
      case 'question': {
        let opts = parseNumberedOptions(inner);
        if (opts.length < 2) opts = parseLineOptions(inner);
        if (opts.length < 2) opts = parsePipeSeparatedOptions(inner);
        if (opts.length < 2) opts = parsePlainLines(inner);
        const qOpts = opts.filter(o => isQuestionLabel(o.label));
        const finalOpts = qOpts.length >= 2 ? qOpts : opts;
        segments.push({ type: 'question', content: '', options: cleanOptions(finalOpts, true) });
        break;
      }
    }

    lastIndex = matchEnd;
  }

  const textAfter = content.slice(lastIndex);
  
  if (textAfter.trim()) {
    const filtered = filterExpectedEffect(textAfter);
    segments.push({ type: 'text', content: filtered, options: [] });
  }

  // 清理所有 text segment 中残留的孤立标签文字（如未闭合的 [pills]）
  // 标签名两侧允许可选空白，与 PAIRED_TAG_RX 一致；不匹配 // 注释
  const TAG_STRIP_RX = /\[\s*\/?\s*(pills|checkbox|question|tasklist|cot|clarify_card)\s*\]\s*/gi;
  for (const seg of segments) {
    if (seg.type === 'text' && seg.content) {
      seg.content = seg.content.replace(TAG_STRIP_RX, '').replace(/\n{3,}/g, '\n\n').trim();
    }
  }

  const withInline = enhanceTextSegmentsWithInlineCheckboxes(segments);
  return { segments: withInline.filter((s) => s.type !== 'text' || s.content.trim()), found: true };
}

// LRU 缓存：避免同一条消息反复解析
const parseCache = new Map<string, ParsedContent>();
const CACHE_MAX = 200;

/** 简单哈希，用于生成可靠的缓存键，避免长消息因仅用 prefix+length 导致碰撞 */
function simpleHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function getCacheKey(content: string): string {
  // 原逻辑 content.slice(0,100)+':'+length 在长消息中易碰撞：
  // 两条不同消息若前缀相同、长度相近，会错误复用缓存，导致交互元素不渲染
  return content.length + ':' + simpleHash(content);
}

function _parseOptionBox(content: string): ParsedContent {
  if (!content || typeof content !== 'string') return { text: filterExpectedEffect(content || ''), options: [] };

  // ⓪ 剥离 clarify_card 标签（由浮层单独处理，不参与消息流渲染）
  //    沿用既有的代码块保护：代码块内的 [clarify_card] 示例保持原样
  {
    const codeRangesForClarify = getCodeBlockRanges(content);
    content = content.replace(
      /\[clarify_card(?:\s+[^\]]*)?\]([\s\S]*?)\[\/clarify_card\]/gi,
      (match, _inner, offset) => {
        if (codeRangesForClarify.some(([s, e]) => offset >= s && offset < e)) return match;
        return '';
      }
    ).replace(/\n{3,}/g, '\n\n').trim();
  }

  // ① 成对标签 [pills]...[/pills] 等——最高优先级
  const { segments, found: hasTaggedContent } = parseTaggedContent(content);
  if (hasTaggedContent) {
    const textParts = segments.filter(s => s.type === 'text').map(s => s.content).join('\n\n');
    return { text: textParts, options: [], segments };
  }

  // ①b 孤立标签清理：parseTaggedContent 没找到成对标签
  //     如果内容中有代码块外的 [pills] 等标签文字，剥离掉防止原样显示
  //     不提前 return——让后续的 ②③④ 自动检测正常处理 ■ 选项
  const codeRangesForClean = getCodeBlockRanges(content);
  content = content.replace(
    /\[\s*\/?\s*(pills|checkbox|question|tasklist|clarify_card)\s*\]\s*/gi,
    (match, _g1, offset) => {
      if (codeRangesForClean.some(([s, e]) => offset >= s && offset < e)) return match;
      return '';
    }
  );

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
      // 只移除选项行（■ 开头），保留所有其他内容（表格、代码块等）
      const withPlaceholder = removeSymbolOptionLinesOutsideCodeBlocks(contentWithoutHint, OPTIONS_PLACEHOLDER);
      const text = filterExpectedEffect(withPlaceholder.replace(/\n{3,}/g, '\n\n').trim());
      return finalCleanup({ text, options: symbolOpts, totalPages, forcePills: true });
    }
    return { text: filterExpectedEffect(contentWithoutHint), options: [] };
  }

  if (hint === 'checkbox' || hint === 'tasklist') {
    const checkboxOpts = parseCheckboxOptions(textForDetection);
    if (checkboxOpts.length >= 1) {
      const totalPages = parseTotalPages(contentWithoutHint);
      const cleaned = removeCheckboxLinesOutsideCodeBlocks(contentWithoutHint, OPTIONS_PLACEHOLDER);
      const text = filterExpectedEffect(cleaned.replace(/\n{3,}/g, '\n\n').trim());
      return finalCleanup({
        text,
        options: checkboxOpts,
        totalPages,
        isTaskList: hint === 'tasklist',
        forcePills: false,
      });
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
  const linesBeforeCheckbox = textForDetection.split('\n');
  let foundTaskHeader = false;
  for (const line of linesBeforeCheckbox) {
    if (/^\s*[\-\*\+]?\s*\[\s*(?:[✓xX]|\s)\s*\]/.test(line)) break;
    if (isTaskHeader(line)) { foundTaskHeader = true; break; }
  }
  if (shouldAutoDetectCheckboxOptions(textForDetection, checkboxOpts, foundTaskHeader)) {
    const totalPages = parseTotalPages(contentWithoutHint);
    const cleaned = removeCheckboxLinesOutsideCodeBlocks(contentWithoutHint, OPTIONS_PLACEHOLDER);
    const text = filterExpectedEffect(cleaned.replace(/\n{3,}/g, '\n\n').trim());

    // 精确关键词匹配：只有带任务语义的标题行才触发 TaskList
    return finalCleanup({ text, options: checkboxOpts, totalPages, isTaskList: foundTaskHeader, forcePills: false });
  }

  // 自动检测 ■ ● ◆ ○ 等符号开头的选项
  const symbolOpts = parseSymbolOptions(textForDetection);
  if (shouldAutoDetectSymbolOptions(textForDetection, symbolOpts)) {
    const totalPages = parseTotalPages(contentWithoutHint);
    // 只移除选项行（■ 开头），保留所有其他内容（表格、代码块等）
    const withPlaceholder = removeSymbolOptionLinesOutsideCodeBlocks(contentWithoutHint, OPTIONS_PLACEHOLDER);
    const text = filterExpectedEffect(withPlaceholder.replace(/\n{3,}/g, '\n\n').trim());
    return finalCleanup({ text, options: symbolOpts, totalPages, forcePills: true });
  }

  // 自动检测：仅扫描所有段落的编号列表 "1. xxx"
  // 普通 "-" Markdown 列表默认保留为正文，避免被误判成交互组件。
  const paragraphs = textForDetection.split(/\n\n+/);
  let bestReflective: { options: OptionItem[]; i: number } | null = null;
  let bestOptions: { options: OptionItem[]; i: number } | null = null;

  for (let i = 0; i < paragraphs.length; i++) {
    const block = paragraphs[i].trim();
    let options = parseNumberedOptions(block);
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
    const allowAutoOptionBox = !!bestReflective || hasChoiceCue([before, paragraphs[i]].filter(Boolean).join('\n\n'));
    if (!allowAutoOptionBox) {
      const totalPages = parseTotalPages(contentWithoutHint);
      return { text: filterExpectedEffect(contentWithoutHint), options: [], totalPages };
    }
    const totalPages = parseTotalPages(contentWithoutHint);
    const text = filterExpectedEffect([before, OPTIONS_PLACEHOLDER, after].filter(Boolean).join('\n\n').trim());
    const isReflectiveQuestions = !!bestReflective;
    return finalCleanup({ text, options, totalPages, isReflectiveQuestions });
  }

  const totalPages = parseTotalPages(contentWithoutHint);
  return { text: filterExpectedEffect(contentWithoutHint), options: [], totalPages };
}

/** 清空解析缓存，开发时修改逻辑后或排查渲染异常时可调用 */
export function clearParseCache(): void {
  parseCache.clear();
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
