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
    return { cotContent: null, cotDone: true, mainContent: fullContent };
  }

  const cotParts: string[] = [];
  const mainParts: string[] = [];
  let cursor = 0;
  let cotDone = true;

  while (cursor < fullContent.length) {
    const next = findNextTag(fullContent, cursor);
    if (!next) {
      mainParts.push(fullContent.slice(cursor));
      break;
    }

    if (next.index > cursor) {
      mainParts.push(fullContent.slice(cursor, next.index));
    }

    const afterOpen = next.index + next.spec.open.length;
    const closeIdx = fullContent.indexOf(next.spec.close, afterOpen);
    if (closeIdx === -1) {
      cotParts.push(fullContent.slice(afterOpen).trim());
      cotDone = false;
      cursor = fullContent.length;
      break;
    }

    cotParts.push(fullContent.slice(afterOpen, closeIdx).trim());
    cursor = closeIdx + next.spec.close.length;
  }

  const cotContent = cotParts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n---\n\n');

  const mainContent = stripStrayCotTags(mainParts.join(''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { cotContent: sanitizeCotContent(cotContent) || null, cotDone, mainContent };
}

/** 用于 UI：是否应走「行内 CoT」分支（避免双指示器） */
export function hasAssistantCotMarkers(text: string): boolean {
  if (!text) return false;
  return text.includes(BRACKET_OPEN) || text.includes(THINK_OPEN) || text.includes(REDACTED_THINK_OPEN);
}
