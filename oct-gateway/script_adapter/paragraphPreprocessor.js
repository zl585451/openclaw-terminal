'use strict';

/**
 * 段落预处理器：将原文拆分为带 hint 的段落列表。
 *
 * @param {string} sourceText
 * @returns {{ paragraphs: Array<{id: string, text: string, hint: string}>, totalCharCount: number }}
 */
function preprocessParagraphs(sourceText) {
  const text = String(sourceText || '').replace(/\r\n/g, '\n').trim();
  if (!text) return { paragraphs: [], totalCharCount: 0 };

  const rawParagraphs = text.split(/(?:\n\s*){2,}|\n(?=\S)/).filter((p) => p.trim());
  const paragraphs = rawParagraphs.map((p, i) => {
    const id = `P${i + 1}`;
    const trimmed = p.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    return { id, text: trimmed, hint: detectHint(trimmed) };
  });

  return {
    paragraphs,
    totalCharCount: text.length,
  };
}

/**
 * 根据段落内容推测声音类型 hint，仅作为模型辅助，不作为最终分类。
 * @param {string} text
 * @returns {'dialogue'|'inner_candidate'|'unknown'}
 */
function detectHint(text) {
  if (hasQuotedDialogue(text)) return 'dialogue';
  if (hasInnerMonologueMarkers(text)) return 'inner_candidate';
  return 'unknown';
}

function hasQuotedDialogue(text) {
  return /[「」""''『』]/u.test(text);
}

const INNER_MONOLOGUE_MARKERS = [
  '心想', '脑子里', '忽然觉得', '意识到', '想起', '隐约觉得',
  '感觉', '心里', '回想起', '回忆起', '记得', '明白', '懂得',
  '以为', '仿佛', '似乎',
];

function hasInnerMonologueMarkers(text) {
  return INNER_MONOLOGUE_MARKERS.some((m) => text.includes(m));
}

module.exports = {
  preprocessParagraphs,
  detectHint,
  hasQuotedDialogue,
  hasInnerMonologueMarkers,
};