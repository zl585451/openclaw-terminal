/**
 * 从 assistant 原始文本中分离「思维链」与「对用户可见正文」。
 *
 * 支持的标记格式：
 * - OCT 约定：[cot]…[/cot]
 * - MiniMax / DeepSeek：<think>… thinking>（大小写不敏感，XML 风格）
 * - MiniMax M2.7+：<redacted_thinking>…</redacted_thinking>
 *
 * 若多种标记同时出现，取在字符串中最靠前的一种。
 */

const BRACKET_OPEN = '[cot]';
const BRACKET_CLOSE = '[/cot]';

/** MiniMax / DeepSeek 的 XML 风格思考标签 */
const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

/** MiniMax M2.7+ 实际返回的思考标签 */
const REDACTED_THINK_OPEN = '<redacted_thinking>';
const REDACTED_THINK_CLOSE = '</redacted_thinking>';

export type CotExtractResult = {
  cotContent: string | null;
  cotDone: boolean;
  /** 是否已检测到 CoT 起始标记；用于首 token 即显示思维块 */
  cotStarted: boolean;
  /** 去掉思维链内文后的正文（供 Markdown / 打字机） */
  mainContent: string;
};

type TagSpec = {
  open: string;
  close: string;
};

const TAG_SPECS: TagSpec[] = [
  { open: BRACKET_OPEN, close: BRACKET_CLOSE },
  { open: THINK_OPEN, close: THINK_CLOSE },
  { open: REDACTED_THINK_OPEN, close: REDACTED_THINK_CLOSE },
];

/**
 * 剥离文本中的工具调用注释，例如：
 * [To="canvas"] { ...json... }
 * [To='memory.write'] { ... }
 */
/**
 * 剥离模型泄漏到正文里的「伪工具调用」片段（如 Kimi：`<|…tool_calls_section_begin|>…end|>`）。
 * 流式未闭合时：截断到 section_begin 之前，避免半段标签刷屏。
 */
export function stripLeakedToolCallSections(input: string): string {
  const text = String(input || '');
  if (!text) return '';

  const beginRe = /<\|[^|]*tool_calls_section_begin[^|]*\|>/gi;
  const endRe = /<\|[^|]*tool_calls_section_end[^|]*\|>/gi;

  let out = text.replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/gi, ' ');
  out = out.replace(/\[[a-zA-Z0-9_.-]+\]\s*<tool_code>\s*[\s\S]*?\s*<\/tool_code>/gi, ' ');
  let guard = 0;
  while (guard++ < 80) {
    beginRe.lastIndex = 0;
    const bm = beginRe.exec(out);
    if (!bm) break;
    const start = bm.index;
    const headLen = bm[0].length;
    const tail = out.slice(start + headLen);
    endRe.lastIndex = 0;
    const em = endRe.exec(tail);
    if (!em) {
      out = out.slice(0, start).replace(/\s+$/u, '');
      break;
    }
    const cut = em.index + em[0].length;
    out = out.slice(0, start) + tail.slice(cut);
  }
  return out.replace(/\n{3,}/g, '\n\n').replace(/\s+$/u, '');
}

/** 流式/打字机用：与 finalize 阶段可见正文一致的处理顺序 */
export function getAssistantVisibleMain(raw: string): string {
  const pre = stripLeakedToolCallSections(String(raw || ''));
  const base = stripTextToolAnnotations(pre);
  return hasAssistantCotMarkers(base) ? extractAssistantCotAndMain(base).mainContent : base;
}

export function stripTextToolAnnotations(input: string): string {
  const text = String(input || '');
  if (!text) return '';

  const headerRe = /\[To=(?:"[^"]+"|'[^']+')\]\s*\{/g;
  let out = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = headerRe.exec(text)) !== null) {
    const start = match.index;
    const openBracePos = text.indexOf('{', start);
    if (openBracePos < 0) break;

    out += text.slice(cursor, start);

    let depth = 0;
    let inString = false;
    let escaped = false;
    let quoteChar = '"';
    let i = openBracePos;
    let foundEnd = false;

    for (; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === quoteChar) {
          inString = false;
        }
        continue;
      }

      if (ch === '"' || ch === "'") {
        inString = true;
        quoteChar = ch;
        continue;
      }
      if (ch === '{') {
        depth += 1;
        continue;
      }
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          foundEnd = true;
          i += 1;
          break;
        }
      }
    }

    if (!foundEnd) {
      cursor = start;
      break;
    }

    cursor = i;
    headerRe.lastIndex = i;
  }

  out += text.slice(cursor);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function findNextTag(full: string, fromIndex: number): { spec: TagSpec; index: number } | null {
  let best: { spec: TagSpec; index: number } | null = null;
  for (const spec of TAG_SPECS) {
    const idx = full.indexOf(spec.open, fromIndex);
    if (idx === -1) continue;
    if (!best || idx < best.index) {
      best = { spec, index: idx };
    }
  }
  return best;
}

function stripStrayCotTags(text: string): string {
  return text
    .split(BRACKET_OPEN).join('')
    .split(BRACKET_CLOSE).join('')
    .split(THINK_OPEN).join('')
    .split(THINK_CLOSE).join('')
    .split(REDACTED_THINK_OPEN).join('')
    .split(REDACTED_THINK_CLOSE).join('');
}

function sanitizeCotContent(text: string): string {
  if (!text) return text;

  const withoutTags = stripStrayCotTags(text)
    .replace(/\[pills\][\s\S]*?\[\/pills\]/gi, '')
    .replace(/\n{3,}/g, '\n\n');

  const filteredLines = withoutTags
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^[a-z_][a-z0-9_]*\([^)]*\)\s*$/i.test(trimmed)) return false;
      if (/^(输出|output)\s*[:：]?$/i.test(trimmed)) return false;
      if (/^[+>]*\s*\{".*$/i.test(trimmed)) return false;
      return true;
    })
    .join('\n');

  return filteredLines
    .replace(/("api_key"\s*:\s*")[^"]+(")/gi, '$1[REDACTED]$2')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
    .trim();
}

export function extractAssistantCotAndMain(fullContent: string): CotExtractResult {
  if (!fullContent) {
    return { cotContent: null, cotDone: true, cotStarted: false, mainContent: fullContent };
  }

  const normalizedContent = stripTextToolAnnotations(stripLeakedToolCallSections(fullContent));
  const cotParts: string[] = [];
  const mainParts: string[] = [];
  let cursor = 0;
  let cotDone = true;
  let cotStarted = false;

  while (cursor < normalizedContent.length) {
    const next = findNextTag(normalizedContent, cursor);
    if (!next) {
      mainParts.push(normalizedContent.slice(cursor));
      break;
    }

    if (next.index > cursor) {
      mainParts.push(normalizedContent.slice(cursor, next.index));
    }

    cotStarted = true;
    const afterOpen = next.index + next.spec.open.length;
    const closeIdx = normalizedContent.indexOf(next.spec.close, afterOpen);
    if (closeIdx === -1) {
      cotParts.push(normalizedContent.slice(afterOpen).trim());
      cotDone = false;
      cursor = normalizedContent.length;
      break;
    }

    cotParts.push(normalizedContent.slice(afterOpen, closeIdx).trim());
    cursor = closeIdx + next.spec.close.length;
  }

  const cotContent = cotParts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n---\n\n');

  const mainContent = stripStrayCotTags(mainParts.join(''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cotContent: sanitizeCotContent(cotContent) || null, cotDone, cotStarted, mainContent };
}

/** 用于 UI：是否应走「行内 CoT」分支（避免双指示器） */
export function hasAssistantCotMarkers(text: string): boolean {
  if (!text) return false;
  return (
    text.includes(BRACKET_OPEN) ||
    text.includes(BRACKET_CLOSE) ||
    text.includes(THINK_OPEN) ||
    text.includes(THINK_CLOSE) ||
    text.includes(REDACTED_THINK_OPEN) ||
    text.includes(REDACTED_THINK_CLOSE)
  );
}
