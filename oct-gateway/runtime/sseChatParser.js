// @ts-check
'use strict';

/**
 * OpenAI 兼容 /chat/completions 流式（SSE）解析的纯函数。
 *
 * 行为保持地抽离自 ai.js streamChatRaw 的逐行解析内联逻辑（P0）。
 * 这些函数无任何副作用：不写闭包状态、不调用回调、不发心跳。调用方（流循环）
 * 负责把解析结果应用到可变状态并触发 I/O。
 */

/**
 * 解析单行 SSE 文本为结构化事件。
 *
 * 对齐原内联顺序：空行 / `data: [DONE]` / 非 `data: ` 前缀 / JSON 解析失败
 * 在原循环中都是 `continue`，这里分别返回 empty/done/non-data/json-error，
 * 仅 'data' 携带 parsed。
 *
 * @param {string} line
 * @returns {{ kind: 'empty'|'done'|'non-data'|'json-error'|'data', parsed?: any }}
 */
function parseSseLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed) return { kind: 'empty' };
  if (trimmed === 'data: [DONE]') return { kind: 'done' };
  if (!trimmed.startsWith('data: ')) return { kind: 'non-data' };
  try {
    return { kind: 'data', parsed: JSON.parse(trimmed.slice(6)) };
  } catch {
    return { kind: 'json-error' };
  }
}

/**
 * 从一个已解析的流式 chunk 提取归一化增量。
 *
 * 重要顺序约定（与原内联一致）：`usage`/`model` 不依赖 delta 是否存在，
 * 由调用方先行应用；reasoning/content/toolCalls/finishReason 仅在 `hasDelta`
 * 为真时由调用方处理（原代码 `if (!delta) continue;`）。
 *
 * @param {any} parsed
 * @returns {{
 *   usage: any,
 *   model: any,
 *   hasDelta: boolean,
 *   reasoningContent: any,
 *   content: any,
 *   toolCalls: any,
 *   finishReason: any,
 * }}
 */
function extractStreamUpdate(parsed) {
  const delta = parsed?.choices?.[0]?.delta;
  return {
    usage: parsed?.usage || null,
    model: parsed?.model || null,
    hasDelta: !!delta,
    reasoningContent: delta?.reasoning_content || '',
    content: delta?.content || '',
    toolCalls: delta?.tool_calls || null,
    finishReason: parsed?.choices?.[0]?.finish_reason || null,
  };
}

module.exports = {
  parseSseLine,
  extractStreamUpdate,
};
