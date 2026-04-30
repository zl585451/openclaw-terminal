'use strict';

const { resolveProviderFor } = require('../../services/llmClient');
const config = require('../../config');
const { createAdaptiveSlices } = require('../adaptiveSlicer');
const { parseLineProtocol } = require('../lineProtocolParser');
const { runClassificationSplitterAgent } = require('./classificationSplitterAgent');
const { validateClassifications } = require('../classificationParser');
const { runLightNarrationRewriterAgent } = require('./lightNarrationRewriterAgent');
const { mergeClassifiedSegments } = require('../classifiedMerger');

const HARD_LIMIT = 12000;
const ANCHOR_SIZE = 200;

const TEXT_REWRITER_TIMEOUT_MS = (() => {
  const val = config.scriptAdapter?.textRewriterTimeoutMs || config.getEnvOrConfig?.('SCRIPT_ADAPTER_TEXT_REWRITER_TIMEOUT_MS');
  const parsed = Number.parseInt(String(val ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 120000;
  return Math.min(300000, Math.max(30000, parsed));
})();

/**
 * 文本改编 Agent（分类切分优先架构）。
 * @param {{ sourceText: string, agent: object }} ctx
 * @param {object} [_options]
 * @returns {Promise<{ payload: object, latencyMs: number, model: string }>}
 */
async function runTextRewriterAgent(ctx, _options = {}) {
  const sourceText = String(ctx?.sourceText || '').trim();
  if (!sourceText) throw new Error('TEXT_REWRITER_NO_INPUT: 没有提供原文');
  if (sourceText.length > HARD_LIMIT) {
    throw new Error(`TEXT_REWRITER_TOO_LONG: ${sourceText.length} > ${HARD_LIMIT}`);
  }

  const slices = createAdaptiveSlices(sourceText, { anchorSize: ANCHOR_SIZE });
  if (slices.length <= 1) {
    return runClassifyFirstPass(sourceText);
  }

  return runSlicedClassifyFirstPass(sourceText, slices);
}

async function runClassifyFirstPass(sourceText) {
  const startedAt = Date.now();

  const splitResult = await runClassificationSplitterAgent({ sourceText });

  const { validated, warnings } = validateClassifications(splitResult.classifications);

  if (validated.length === 0) {
    throw new Error('CLASSIFICATION_NO_VALID_RESULT: 分类有效结果为空，拒绝错误交付');
  }

  const keyedClassifications = attachRewriteIds(validated);

  const narrationItems = keyedClassifications
    .filter((item) => item.type === 'narration')
    .map((item) => ({ paraId: item.rewriteId, text: item.text }));

  const rewriteResult = await runLightNarrationRewriterAgent({ narrationItems });

  const allWarnings = [
    ...(splitResult.warnings || []),
    ...warnings,
    ...(rewriteResult.warnings || []),
  ];

  const mergeResult = mergeClassifiedSegments({
    classifications: keyedClassifications,
    rewrittenTexts: rewriteResult.rewritten,
    originalParagraphs: [],
    chapterTitle: '未命名片段',
  });

  return {
    payload: normalizePayload({ ...mergeResult.payload, _warnings: allWarnings }),
    latencyMs: Date.now() - startedAt,
    model: `${splitResult.model} + light narration rewrite`,
  };
}

async function runSlicedClassifyFirstPass(sourceText, slices) {
  const startedAt = Date.now();
  const results = [];
  let succeededSlices = 0;

  for (const slice of slices) {
    const sliceResult = await rewriteSliceClassifyFirst({ slice });
    if (sliceResult.ok) {
      succeededSlices += 1;
    }
    results.push(sliceResult);
  }

  if (succeededSlices === 0) {
    throw new Error(`TEXT_REWRITER_SLICE_FAILED: 0/${slices.length} slices succeeded`);
  }

  return {
    payload: mergeSlicePayloadsClassifyFirst(results),
    latencyMs: Date.now() - startedAt,
    model: `classify-first (sliced × ${slices.length})`,
  };
}

async function rewriteSliceClassifyFirst({ slice }) {
  try {
    const splitResult = await runClassificationSplitterAgent({ sourceText: slice.coreText });
    const { validated, warnings } = validateClassifications(splitResult.classifications);

    if (validated.length === 0) {
      return { ok: false, sliceIndex: slice.index + 1, error: 'classification_no_valid_result' };
    }

    const keyedClassifications = attachRewriteIds(validated, `slice${slice.index + 1}`);

    const narrationItems = keyedClassifications
      .filter((item) => item.type === 'narration')
      .map((item) => ({ paraId: item.rewriteId, text: item.text }));

    const rewriteResult = await runLightNarrationRewriterAgent({ narrationItems });

    const mergeResult = mergeClassifiedSegments({
      classifications: keyedClassifications,
      rewrittenTexts: rewriteResult.rewritten,
      originalParagraphs: [],
      chapterTitle: '未命名片段',
    });

    return {
      ok: true,
      payload: normalizePayload(mergeResult.payload),
      model: splitResult.model,
      warnings: [...(splitResult.warnings || []), ...warnings, ...(rewriteResult.warnings || [])],
    };
  } catch (error) {
    return {
      ok: false,
      sliceIndex: slice.index + 1,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function attachRewriteIds(classifications, prefix = 'seg') {
  return classifications.map((item, index) => {
    if (item?.type !== 'narration') return item;
    return {
      ...item,
      rewriteId: `${prefix}-${item.paraId || 'P'}-${index + 1}`,
    };
  });
}

function mergeSlicePayloadsClassifyFirst(results) {
  const fmt = (index) => `seg-${String(index).padStart(3, '0')}`;
  const segments = [];
  let degradedCount = 0;

  for (const result of results) {
    if (result?.ok && Array.isArray(result.payload?.segments)) {
      for (const segment of result.payload.segments) {
        segments.push({ ...segment, segmentId: fmt(segments.length + 1) });
      }
      continue;
    }
    degradedCount += 1;
    segments.push({
      segmentId: fmt(segments.length + 1),
      type: 'narration',
      text: `[第 ${Number(result?.sliceIndex ?? degradedCount)} 片分类改编失败：${String(result?.error || '未知错误').slice(0, 80)}]`,
    });
  }

  if (segments.length === 0) {
    throw new Error('TEXT_REWRITER_NO_SEGMENTS');
  }

  return {
    chapterTitle: '未命名片段',
    totalCharCount: segments.reduce((sum, item) => sum + String(item.text || '').length, 0),
    segments,
  };
}

function normalizePayload(payload) {
  const normalizedSegments = Array.isArray(payload?.segments)
    ? payload.segments
        .map((segment, index) => ({
          segmentId:
            typeof segment?.segmentId === 'string' && segment.segmentId
              ? segment.segmentId
              : `seg-${String(index + 1).padStart(3, '0')}`,
          type: normalizeSegmentType(segment?.type),
          speaker: segment?.speaker ? String(segment.speaker) : undefined,
          text: String(segment?.text || '').trim(),
        }))
        .filter((segment) => segment.text)
    : [];

  if (normalizedSegments.length === 0) {
    throw new Error('TEXT_REWRITER_NO_SEGMENTS');
  }

  return {
    chapterTitle: String(payload?.chapterTitle || '未命名片段').trim() || '未命名片段',
    totalCharCount: normalizedSegments.reduce((sum, item) => sum + item.text.length, 0),
    segments: normalizedSegments,
  };
}

function normalizeSegmentType(type) {
  return ['narration', 'dialogue', 'inner_monologue'].includes(type) ? type : 'narration';
}

function parseTextRewriterOutput(raw) {
  if (!raw) throw new Error('TEXT_REWRITER_EMPTY_OUTPUT');
  const parsed = parseLineProtocol(raw);
  if (!parsed || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
    throw new Error('TEXT_REWRITER_NO_SEGMENTS');
  }
  return parsed;
}

function extractJsonObject(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) return '';
  return cleaned.slice(start, end + 1);
}

module.exports = {
  runTextRewriterAgent,
  parseTextRewriterOutput,
  extractJsonObject,
};
