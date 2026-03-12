export interface OptionItem {
  num: number;
  label: string;
  value: string;
}

export interface ParsedContent {
  text: string;
  options: OptionItem[];
  totalPages?: number;  // 从 "共X页" 解析
}

const START_MARKER = '[选项框开始]';
const END_MARKER = '[选项框结束]';
const OPTION_REGEX = /\[选项\s*(\d+)\s*:\s*([^\|\]]+)\s*\|\s*([^\]]+)\]/g;

/** 解析 "1. xxx 2. xxx" 或 "1) xxx 2) xxx" 风格的选项（同一行或跨行） */
function parseNumberedOptions(text: string): OptionItem[] {
  const options: OptionItem[] = [];
  // 匹配 1. xxx 或 1) xxx 或 1、xxx，支持同一行多个
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
  // 支持两种格式：[ ] xxx  和  - [ ] xxx（Markdown task list）
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

/** 解析换行列表：每行 "1. xxx" 或 "- xxx" */
function parseLineOptions(text: string): OptionItem[] {
  const lines = text.split(/\n/).filter((l) => l.trim());
  const options: OptionItem[] = [];
  const rx = /^[\s]*(\d+)[.）、]\s*(.+)$|^[\s]*[-*]\s*(.+)$/;
  for (const line of lines) {
    const m = line.match(rx);
    if (m) {
      const label = (m[2] || m[3] || '').trim();
      if (label.length > 0 && label.length < 100) {
        options.push({ num: options.length + 1, label, value: label });
      }
    }
  }
  return options.length >= 2 ? options : [];
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

export function parseOptionBox(content: string): ParsedContent {
  if (!content || typeof content !== 'string') return { text: filterExpectedEffect(content || ''), options: [] };

  // 1. 显式协议 [选项框开始] ... [选项框结束]
  const startIdx = content.indexOf(START_MARKER);
  const endIdx = content.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const beforeBlock = content.slice(0, startIdx).trim();
    const blockContent = content.slice(startIdx + START_MARKER.length, endIdx).trim();
    const afterBlock = content.slice(endIdx + END_MARKER.length).trim();
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
    return { text, options, totalPages };
  }

  // 2. 自动检测 [ ] checkbox 列表（优先）
  const checkboxOpts = parseCheckboxOptions(content);
  if (checkboxOpts.length >= 1) {
    const totalPages = parseTotalPages(content);
    const checkboxLineRx = /^[\s]*\[\s*(?:[✓xX]|\s)\s*\]\s*[^\n*]*\n?/gm;
    const withoutCheckboxes = content.replace(checkboxLineRx, '');
    const text = filterExpectedEffect(withoutCheckboxes.replace(/\n{3,}/g, '\n\n').trim());
    return { text, options: checkboxOpts, totalPages };
  }

  // 3. 自动检测：段落末尾的 "1. xxx 2. xxx 3. xxx" 或换行列表
  const paragraphs = content.split(/\n\n+/);
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const block = paragraphs[i].trim();
    let options = parseNumberedOptions(block);
    if (options.length < 2) options = parseLineOptions(block);
    if (options.length >= 2 && options.length <= 20) {
      const before = paragraphs.slice(0, i).join('\n\n').trim();
      const after = paragraphs.slice(i + 1).join('\n\n').trim();
      const totalPages = parseTotalPages(content);
      const text = filterExpectedEffect([before, after].filter(Boolean).join('\n\n').trim());
      return { text, options, totalPages };
    }
  }

  const totalPages = parseTotalPages(content);
  return { text: filterExpectedEffect(content), options: [], totalPages };
}
