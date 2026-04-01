/**
 * 从 assistant 原始文本中分离「思维链」与「对用户可见正文」。
 *
 * 支持的标记格式：
 * - OCT 约定：[cot]…[/cot]
 * - MiniMax / DeepSeek：<think>…</think>（大小写不敏感，XML 风格）
 *
 * 若多种标记同时出现，取在字符串中最靠前的一种。
 */

const BRACKET_OPEN = '[cot]';
const BRACKET_CLOSE = '[/cot]';

/** MiniMax / DeepSeek 的 XML 风格思考标签 */
const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

export type CotExtractResult = {
  cotContent: string | null;
  cotDone: boolean;
  /** 去掉思维链内文后的正文（供 Markdown / 打字机） */
  mainContent: string;
};

function extractBracket(full: string): CotExtractResult | null {
  const openIdx = full.indexOf(BRACKET_OPEN);
  if (openIdx === -1) return null;
  const before = full.slice(0, openIdx);
  const afterOpen = full.slice(openIdx + BRACKET_OPEN.length);
  const closeIdx = afterOpen.indexOf(BRACKET_CLOSE);
  if (closeIdx !== -1) {
    return {
      cotContent: afterOpen.slice(0, closeIdx).trim(),
      cotDone: true,
      mainContent: `${before}\n${afterOpen.slice(closeIdx + BRACKET_CLOSE.length)}`.trim(),
    };
  }
  return {
    cotContent: afterOpen.trim(),
    cotDone: false,
    mainContent: before.trim(),
  };
}

function extractThinkTags(full: string): CotExtractResult | null {
  const openIdx = full.indexOf(THINK_OPEN);
  if (openIdx === -1) return null;
  const before = full.slice(0, openIdx);
  const afterOpen = full.slice(openIdx + THINK_OPEN.length);
  const closeIdx = afterOpen.indexOf(THINK_CLOSE);
  if (closeIdx !== -1) {
    return {
      cotContent: afterOpen.slice(0, closeIdx).trim(),
      cotDone: true,
      mainContent: `${before}\n${afterOpen.slice(closeIdx + THINK_CLOSE.length)}`.trim(),
    };
  }
  return {
    cotContent: afterOpen.trim(),
    cotDone: false,
    mainContent: before.trim(),
  };
}

export function extractAssistantCotAndMain(fullContent: string): CotExtractResult {
  if (!fullContent) {
    return { cotContent: null, cotDone: true, mainContent: fullContent };
  }

  const bi = fullContent.indexOf(BRACKET_OPEN);
  const ti = fullContent.indexOf(THINK_OPEN);

  // 取最靠前的标记
  if (bi !== -1 && (ti === -1 || bi < ti)) {
    return extractBracket(fullContent)!;
  }
  if (ti !== -1) {
    return extractThinkTags(fullContent)!;
  }

  return { cotContent: null, cotDone: true, mainContent: fullContent };
}

/** 用于 UI：是否应走「行内 CoT」分支（避免双指示器） */
export function hasAssistantCotMarkers(text: string): boolean {
  if (!text) return false;
  return text.includes(BRACKET_OPEN) || text.includes(THINK_OPEN);
}
