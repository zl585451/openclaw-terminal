/**
 * 检测文本中所有代码块的位置范围（行号）。
 * 返回一组 [startLine, endLine) 范围，用于排除代码块内的内容。
 */
export function getCodeBlockLineRanges(lines: string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let inCodeBlock = false;
  let startLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // 检测代码块开始/结束标记
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        startLine = i;
      } else {
        inCodeBlock = false;
        if (startLine !== -1) {
          ranges.push([startLine, i + 1]);
        }
        startLine = -1;
      }
    }
  }

  // 如果文档结束时仍在代码块内，关闭它
  if (inCodeBlock && startLine !== -1) {
    ranges.push([startLine, lines.length]);
  }

  return ranges;
}

/**
 * 检查某一行是否在代码块内部。
 */
export function isLineInCodeBlock(lineIndex: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => lineIndex >= start && lineIndex < end);
}

/**
 * 判断一行是否为表格行。支持两种格式：
 * - 标准格式：| col1 | col2 | （以 | 开头，可以不以 | 结尾）
 * - 紧凑格式：| col1 | col2 （行末没有 |）
 */
export function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  // 必须以 | 开头
  if (!trimmed.startsWith('|')) return false;
  // 排除文件树结构（包含 ├── └── │ 等符号）
  if (/[├└┌┐┘┼─│]/.test(line)) return false;
  // 以 | 结尾，或行内有 | 分隔符
  if (trimmed.endsWith('|')) return true;
  // 行末没有 |，但中间有 | 分隔
  return trimmed.includes('|');
}

export function shouldPreprocessMarkdownTables(text: string): boolean {
  if (!text) return false;
  // 简单判定：包含至少两行"|...|"样式的行，才启用表格预处理，避免误伤普通文本
  const lines = text.split('\n');
  const codeBlockRanges = getCodeBlockLineRanges(lines);
  let tableLike = 0;
  for (let i = 0; i < lines.length; i++) {
    // 跳过代码块内的行
    if (isLineInCodeBlock(i, codeBlockRanges)) continue;
    if (isTableRow(lines[i])) tableLike++;
    if (tableLike >= 2) return true;
  }
  return false;
}

export function fillEmptyCellsInTables(text: string): string {
  // 将表格行里的空单元格填充为单个空格，避免 remark-gfm 对 `| |` 的不稳定解析；
  // 使用空格而非 &nbsp;，防止某些解析路径下单元格内容异常
  const lines = text.split('\n');
  const codeBlockRanges = getCodeBlockLineRanges(lines);

  return lines.map((line, i) => {
    if (isLineInCodeBlock(i, codeBlockRanges)) return line;
    if (isTableRow(line)) {
      return line.replace(/\|\s*\|/g, '| |');
    }
    return line;
  }).join('\n');
}

export function escapeTableBrackets(text: string): string {
  // 仅转义表格行里形如 [text](url) 的链接语法，避免破坏表格解析；
  // 不转义纯 [xxx]（如 [AGENTS.md]），否则反斜杠会导致 remark-gfm 解析异常、单元格内容丢失
  const lines = text.split('\n');
  const codeBlockRanges = getCodeBlockLineRanges(lines);

  return lines.map((line, i) => {
    if (isLineInCodeBlock(i, codeBlockRanges)) return line;
    if (isTableRow(line)) {
      // 只转义 [text](url) 形式，替换为 \[text](url) 使方括号不触发链接解析
      return line.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '\\[$1]($2)');
    }
    return line;
  }).join('\n');
}

/**
 * 修复表格分隔符行重复问题：
 * - 一个表格块（连续以 `|` 开头的行）中，只允许表头后出现一次分隔符行
 * - 该表格块内后续出现的分隔符行一律删除
 */
export function normalizeMarkdownTables(text: string): string {
  if (!text || typeof text !== 'string') return text;
  const lines = text.split('\n');
  const out: string[] = [];

  const isTableRow = (l: string) => /^\s*\|/.test(l);
  const isSeparator = (l: string) => {
    const trimmed = String(l || '').trim();
    if (!/^\|/.test(trimmed)) return false;
    return /[\-:]+/.test(trimmed) && !/[a-zA-Z0-9]/.test(trimmed.replace(/[\|\s\-:]/g, ''));
  };

  let i = 0;
  while (i < lines.length) {
    if (!isTableRow(lines[i] || '')) {
      out.push(lines[i] || '');
      i++;
      continue;
    }

    const block: string[] = [];
    while (i < lines.length && isTableRow(lines[i] || '')) {
      block.push(lines[i] || '');
      i++;
    }

    let sepCount = 0;
    const filtered = block.filter(line => {
      if (isSeparator(line)) {
        sepCount++;
        return sepCount === 1;
      }
      return true;
    });
    out.push(...filtered);
  }

  return out.join('\n');
}

export function normalizeTableSeparators(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  // 每个表格块只需要一条分隔符（紧跟表头之后）

  let inTable = false;
  let hasSeparator = false;

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i] ?? '';
    const curTrim = cur.trim();
    // GFM 允许表格行末尾可选 |，与 isTableRow 逻辑一致
    const curIsTableRow = curTrim.startsWith('|') && (curTrim.endsWith('|') || curTrim.includes('|'));
    const curIsSep = /^\|[\s\-:|]+\|?\s*$/.test(curTrim) && /-/.test(curTrim);

    if (curIsTableRow) {
      if (!inTable) {
        inTable = true;
        hasSeparator = false;
      }

      if (curIsSep) {
        if (!hasSeparator) {
          out.push(cur);
          hasSeparator = true;
        }
        // 跳过后续的分隔符行
      } else {
        out.push(cur);
      }
    } else {
      if (inTable) {
        inTable = false;
        hasSeparator = false;
      }
      out.push(cur);
    }
  }

  return out.join('\n');
}

/** 确保表格块前有空行，便于 remark-gfm 识别块级表格 */
export function ensureBlankLineBeforeTables(text: string): string {
  const lines = text.split('\n');
  const codeBlockRanges = getCodeBlockLineRanges(lines);
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (isLineInCodeBlock(i, codeBlockRanges)) {
      result.push(lines[i]!);
      continue;
    }
    // 当前行是表格行，且上一行非空
    if (isTableRow(lines[i]!)) {
      const prev = result[result.length - 1];
      if (prev !== undefined && prev.trim() !== '' && !isTableRow(prev)) {
        result.push('');
      }
    }
    result.push(lines[i]!);
  }
  return result.join('\n');
}

/**
 * 找到从 start 处 `{` 开始的匹配 `}` 的下标（考虑字符串与转义），找不到返回 -1。
 */
function matchClosingBrace(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 兜底：模型有时把 diagram 规范 JSON（含 "diagramType"）当成普通正文直接输出，
 * 没有包在代码围栏里，导致聊天区原样暴露一坨 JSON。这里把代码块之外、能成功
 * JSON.parse 且含 "diagramType" 的平衡 {...} 自动包成 ```json 围栏，
 * 交给下游 markdown 组件渲染成图卡片（带 Open 按钮）。
 */
export function fenceBareDiagramJson(text: string): string {
  if (!text || !text.includes('diagramType')) return text;

  // 收集已有围栏的字符区间，避免重复处理围栏内内容
  const fenceRanges: Array<[number, number]> = [];
  const fenceRe = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
  let fm: RegExpExecArray | null;
  while ((fm = fenceRe.exec(text))) fenceRanges.push([fm.index, fm.index + fm[0].length]);
  const inFence = (pos: number) => fenceRanges.some(([s, e]) => pos >= s && pos < e);

  let out = '';
  let cursor = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{' && !inFence(i)) {
      const end = matchClosingBrace(text, i);
      if (end > i) {
        const slice = text.slice(i, end + 1);
        if (/"diagramType"\s*:/.test(slice)) {
          let valid = false;
          try { JSON.parse(slice); valid = true; } catch { /* 非合法 JSON，跳过 */ }
          if (valid) {
            const before = text.slice(cursor, i);
            out += before;
            if (out && !out.endsWith('\n')) out += '\n';
            out += `\n\`\`\`json\n${slice}\n\`\`\`\n`;
            i = end + 1;
            cursor = i;
            continue;
          }
        }
        // 跳到该 {...} 之后，避免在内部反复扫描
        i = end + 1;
        continue;
      }
    }
    i++;
  }
  out += text.slice(cursor);
  return out;
}

/**
 * 兜底：模型把 `<svg>…</svg>` 直接写进正文时，chat 的 markdown 渲染会把它当文本转义、
 * 原样暴露源码。这里把代码块之外的完整 <svg> 自动包成 ```svg 围栏，
 * 交给下游 markdown 组件渲染成内联 SVG 预览卡片。
 */
export function fenceBareSvg(text: string): string {
  if (!text || !/<svg[\s>]/i.test(text)) return text;

  const fenceRanges: Array<[number, number]> = [];
  const fenceRe = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
  let fm: RegExpExecArray | null;
  while ((fm = fenceRe.exec(text))) fenceRanges.push([fm.index, fm.index + fm[0].length]);
  const inFence = (pos: number) => fenceRanges.some(([s, e]) => pos >= s && pos < e);

  const svgRe = /<svg[\s\S]*?<\/svg>/gi;
  const hits: Array<[number, number, string]> = [];
  let m: RegExpExecArray | null;
  while ((m = svgRe.exec(text))) {
    if (!inFence(m.index)) hits.push([m.index, m.index + m[0].length, m[0]]);
  }
  if (!hits.length) return text;

  let out = '';
  let cursor = 0;
  for (const [s, e, svg] of hits) {
    out += text.slice(cursor, s);
    if (out && !out.endsWith('\n')) out += '\n';
    out += `\n\`\`\`svg\n${svg}\n\`\`\`\n`;
    cursor = e;
  }
  out += text.slice(cursor);
  return out;
}

export function preprocessMarkdown(text: string): string {
  let processed = normalizeCustomEchartBlocks(text);
  processed = fenceBareDiagramJson(processed);
  processed = fenceBareSvg(processed);
  if (!shouldPreprocessMarkdownTables(processed)) return processed;
  // 确保表格前有空行，便于 GFM 解析
  processed = ensureBlankLineBeforeTables(processed);
  // 修复模型偶发输出的"表格分隔符行重复插入"问题：同一表格块内只保留表头后的第一条分隔符行
  processed = normalizeMarkdownTables(processed);
  processed = fillEmptyCellsInTables(processed);
  processed = escapeTableBrackets(processed);
  processed = normalizeTableSeparators(processed);
  return processed;
}

/**
 * Streaming Markdown is often syntactically incomplete while tokens are still
 * arriving. Keep the displayed DOM stable by closing a currently open fence
 * only for rendering; the underlying message text remains untouched.
 */
export function stabilizeStreamingMarkdown(text: string): string {
  let processed = normalizeCustomEchartBlocks(text || '');
  if (!processed) return processed;

  const lines = processed.split('\n');
  let openFence: '```' | '~~~' | null = null;

  for (const line of lines) {
    const match = line.match(/^\s*(```|~~~)/);
    if (!match) continue;

    const marker = match[1] as '```' | '~~~';
    if (!openFence) {
      openFence = marker;
    } else if (marker === openFence) {
      openFence = null;
    }
  }

  if (!openFence) return processed;
  const needsLeadingNewline = !processed.endsWith('\n');
  processed += `${needsLeadingNewline ? '\n' : ''}${openFence}`;
  return processed;
}

/**  finalized 消息的 Markdown 预处理结果缓存（仅 UI，不改消息结构） */
export const processedMarkdownCache = new Map<string, string>();
export const MAX_PROCESSED_MD_CACHE = 400;

export function markdownCacheKey(messageId: number, segmentKey: string | undefined, text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
  }
  const sig = (h >>> 0).toString(36);
  return `${messageId}\0${segmentKey ?? 'full'}\0${text.length}\0${sig}`;
}

export function clearProcessedMarkdownCache(): void {
  processedMarkdownCache.clear();
}

export function getCachedPreprocessedMarkdown(messageId: number, segmentKey: string | undefined, text: string): string {
  const key = markdownCacheKey(messageId, segmentKey, text);
  const hit = processedMarkdownCache.get(key);
  if (hit !== undefined) return hit;
  while (processedMarkdownCache.size >= MAX_PROCESSED_MD_CACHE) {
    const first = processedMarkdownCache.keys().next().value;
    if (first === undefined) break;
    processedMarkdownCache.delete(first);
  }
  const processed = preprocessMarkdown(text);
  processedMarkdownCache.set(key, processed);
  return processed;
}

export function normalizeCustomEchartBlocks(text: string): string {
  if (!text) return text;

  let result = text;

  // [echart]...[/echart] → ```echart``` 代码块
  // 必须行首匹配，避免 AI 正文中提及 [echart] 时误吞说明文字
  if (/\[echart\]/i.test(result)) {
    result = result.replace(/(?:^|\n)\s*\[echart\]\s*([\s\S]*?)\s*\[\/echart\]/gi, (_match, payload: string) => {
      const normalizedPayload = String(payload || '').trim();
      if (!normalizedPayload) return '';
      return `\n\`\`\`echart\n${normalizedPayload}\n\`\`\`\n`;
    });
  }

  // [canvas]...[/canvas] → 当 payload 看起来是 echart JSON 时转成 ```echart```
  // 兜底：部分模型不走工具调用，直接把 [canvas]...[/canvas] 输出到正文
  // 必须行首匹配，与 [echart] 规则一致
  if (/\[canvas\]/i.test(result)) {
    result = result.replace(/(?:^|\n)\s*\[canvas\]\s*([\s\S]*?)\s*\[\/canvas\]/gi, (_match, payload: string) => {
      const normalizedPayload = String(payload || '').trim();
      if (!normalizedPayload) return '';

      // 尝试解析 JSON，处理完整 canvas 调用结构：
      // {"action":"create","artifactType":"echart","content":{"title":"...","option":{...}}}
      // → 提取 content 字段作为实际 echart payload
      let echartPayload = normalizedPayload;
      try {
        const parsed = JSON.parse(normalizedPayload);
        if (parsed && typeof parsed === 'object') {
          // 完整 canvas 调用 JSON：提取 content 字段
          if (parsed.artifactType === 'echart' && parsed.content && typeof parsed.content === 'object') {
            echartPayload = JSON.stringify(parsed.content);
          } else if (parsed.content && typeof parsed.content === 'object'
            && (parsed.content.option || parsed.content.series)) {
            echartPayload = JSON.stringify(parsed.content);
          }
        }
      } catch { /* 解析失败则原样使用 */ }

      const looksLikeEchart = /"option"\s*:/.test(echartPayload) || /"series"\s*:/.test(echartPayload);
      if (looksLikeEchart) {
        return `\n\`\`\`echart\n${echartPayload}\n\`\`\`\n`;
      }
      return _match;
    });
  }

  return result;
}
