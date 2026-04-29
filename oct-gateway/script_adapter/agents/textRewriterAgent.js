'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');
const { chunkByChars } = require('../../services/chunker');
const config = require('../../config');
const { parseLineProtocol } = require('../lineProtocolParser');

const SYSTEM_PROMPT = `你是有声书台本改编师。把用户给的小说原文改写成更适合多人演播的台本片段。

核心规则:
1. 保留剧情、人物关系、关键事件,不改变信息顺序
2. 长句拆短,加自然的停顿;旁白与对白分开
3. 内心独白(inner_monologue)单独标记,不混在对白里
4. 对白要标 speaker(角色名),无法判断 speaker 时归 narration
5. 不提前解释悬疑,不补充原文没有的信息,不写营销语
6. 每段 rewriteNote 一句话说明为什么这么改

输出严格 JSON,不要任何额外解释。结构:
{
  "chapterTitle": "string,从原文推断或者写'未命名片段'",
  "totalCharCount": 数字,所有 segments 的 text 字数之和,
  "segments": [
    {
      "segmentId": "seg-001 / seg-002 ...",
      "type": "narration | dialogue | inner_monologue",
      "speaker": "string,dialogue 必填,inner_monologue 选填,narration 不填",
      "text": "改编后的台本文本",
      "rewriteNote": "一句话说明改写理由"
    }
  ]
}`;

const SOFT_LIMIT = 4000;
const HARD_LIMIT = 12000;
const CHUNK_TARGET = 3500;
const CHUNK_MAX = 4000;
const ANCHOR_SIZE = 200;
const TEXT_REWRITER_TIMEOUT_MS = readPositiveInt(
  config.scriptAdapter?.textRewriterTimeoutMs || config.getEnvOrConfig?.('SCRIPT_ADAPTER_TEXT_REWRITER_TIMEOUT_MS'),
  120000,
  30000,
  300000,
);

/**
 * 真实文本改编 Agent。
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

  if (sourceText.length <= SOFT_LIMIT) {
    return runSinglePass(sourceText);
  }

  return runChunkedPass(sourceText);
}

async function runSinglePass(sourceText) {
  const provider = resolveProviderFor('script_adapter');
  const result = await chatCompletion({
    provider,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `请把下列原文改编成多人演播台本。原文:\n\n${sourceText}` },
    ],
    maxTokens: 2000,
    temperature: 0.6,
    responseJson: false,
    timeoutMs: TEXT_REWRITER_TIMEOUT_MS,
  });

  return {
    payload: normalizePayload(parseTextRewriterOutput(result.content)),
    latencyMs: result.latencyMs,
    model: result.model,
  };
}

async function runChunkedPass(sourceText) {
  const startedAt = Date.now();
  const provider = resolveProviderFor('script_adapter');
  const chunks = chunkByChars(sourceText, {
    targetSize: CHUNK_TARGET,
    maxSize: CHUNK_MAX,
    overlap: 0,
  });

  const mergedSegments = [];
  let succeededChunks = 0;
  let chapterTitle = '';
  let lastAnchor = '';
  let model = provider.model;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const result = await rewriteChunk({
      provider,
      chunkText: chunk.content,
      chunkIndex: index,
      totalChunks: chunks.length,
      previousAnchor: lastAnchor,
    });

    if (result.ok) {
      succeededChunks += 1;
      const payload = normalizePayload(result.payload);
      if (!chapterTitle && payload.chapterTitle) chapterTitle = payload.chapterTitle;
      model = result.model || model;
      for (const segment of payload.segments) {
        mergedSegments.push({
          ...segment,
          segmentId: formatSegmentId(mergedSegments.length + 1),
        });
      }
    } else {
      mergedSegments.push({
        segmentId: formatSegmentId(mergedSegments.length + 1),
        type: 'narration',
        text: `[第 ${index + 1} 段改编失败：${String(result.error || '未知错误').slice(0, 80)}]`,
        rewriteNote: 'chunked fallback',
      });
    }

    lastAnchor = chunk.content.slice(-ANCHOR_SIZE);
  }

  if (succeededChunks === 0) {
    throw new Error(`TEXT_REWRITER_CHUNK_FAILED: ${succeededChunks}/${chunks.length} chunks succeeded`);
  }

  return {
    payload: {
      chapterTitle: chapterTitle || '未命名片段',
      totalCharCount: mergedSegments.reduce((sum, item) => sum + String(item.text || '').length, 0),
      segments: mergedSegments,
    },
    latencyMs: Date.now() - startedAt,
    model: `${model} (chunked × ${chunks.length})`,
  };
}

async function rewriteChunk({ provider, chunkText, chunkIndex, totalChunks, previousAnchor }) {
  const anchorText = previousAnchor ? `上一段末尾参考（仅用于保持语气与衔接，不要重复改写）：\n${previousAnchor}\n\n` : '';
  const stageText = chunkIndex === 0
    ? `请把下列原文改编成多人演播台本。全文会分 ${totalChunks} 段处理，这是第 1 段。`
    : `请继续改编同一章小说，保持人物语气、信息顺序和悬疑节奏一致。这是第 ${chunkIndex + 1}/${totalChunks} 段。`;

  try {
    const result = await chatCompletion({
      provider,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${stageText}\n\n${anchorText}原文：\n\n${chunkText}` },
      ],
      maxTokens: 2000,
      temperature: 0.6,
      responseJson: false,
      timeoutMs: TEXT_REWRITER_TIMEOUT_MS,
    });

    return {
      ok: true,
      payload: parseTextRewriterOutput(result.content),
      model: result.model,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizePayload(payload) {
  const normalizedSegments = Array.isArray(payload?.segments) ? payload.segments.map((segment, index) => ({
    segmentId: typeof segment?.segmentId === 'string' && segment.segmentId ? segment.segmentId : formatSegmentId(index + 1),
    type: normalizeSegmentType(segment?.type),
    speaker: segment?.speaker ? String(segment.speaker) : undefined,
    text: String(segment?.text || '').trim(),
    rewriteNote: segment?.rewriteNote ? String(segment.rewriteNote).trim() : undefined,
  })).filter((segment) => segment.text) : [];

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

function formatSegmentId(index) {
  return `seg-${String(index).padStart(3, '0')}`;
}

function readPositiveInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.max(min, parsed));
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
