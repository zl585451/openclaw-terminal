'use strict';

const { formatSegmentId } = require('./lineProtocolParser');

/**
 * 合并分类结果与改写文本，输出 AdaptedScriptPayload 格式。
 * @param {object} params
 * @param {Array} params.classifications - 校验后的分类结果
 * @param {Map<string, string>} params.rewrittenTexts - paraId → 改写后旁白文本
 * @param {Array} params.originalParagraphs - 原始段落列表
 * @param {string} [params.chapterTitle='未命名片段']
 * @returns {{ payload: object, warnings: Array }}
 */
function mergeClassifiedSegments({ classifications, rewrittenTexts, originalParagraphs, chapterTitle = '未命名片段' }) {
  const warnings = [];
  const segments = [];

  for (const cls of classifications) {
    if (!cls || !cls.text) continue;

    let text = cls.text;

    // narration 使用对应片段的改写版；没有则使用分类切出的原文片段。
    // 注意：同一自然段可能拆出多条旁白，不能用 paraId 回退到整段原文。
    if (cls.type === 'narration') {
      const rewriteKey = cls.rewriteId || cls.segmentKey || cls.paraId;
      const rewritten = rewrittenTexts?.get(rewriteKey);
      text = rewritten || cls.text;
    }

    text = String(text || '').trim();
    if (!text) continue;

    const segment = {
      segmentId: formatSegmentId(segments.length + 1),
      type: cls.type,
      text,
    };
    if (cls.speaker) segment.speaker = cls.speaker;

    segments.push(segment);
  }

  if (segments.length === 0) {
    throw new Error('MERGER_NO_SEGMENTS: 分类有效结果为空，无法生成台本');
  }

  return {
    payload: {
      chapterTitle: String(chapterTitle || '未命名片段').trim() || '未命名片段',
      totalCharCount: segments.reduce((sum, seg) => sum + String(seg.text || '').length, 0),
      segments,
    },
    warnings,
  };
}

module.exports = {
  mergeClassifiedSegments,
};
