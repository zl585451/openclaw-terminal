// @ts-check
'use strict';

/**
 * 构建发往 OpenAI 兼容 /chat/completions 的请求体（纯函数，无副作用）。
 *
 * 行为保持地抽离自 ai.js streamChatRaw 的内联请求体组装。日志不在此发出，
 * 而是以 logs 数组返回，由调用方按原样 log[level](msg, meta)，保证日志行为一致。
 *
 * 工具注入的时机由调用方决定：仅当 shouldInjectTools 为真时才传入 toolDefinitions，
 * 与原逻辑「只有要注入时才调用 toolLoader.getDefinitions()」一致。
 *
 * @param {object} input
 * @param {string} input.model
 * @param {any[]} input.messages
 * @param {{ maxTokens?: number }} input.caps
 * @param {{ id?: string, supportsStreamOptions?: boolean, supportsToolChoiceFunction?: boolean }} input.provider
 * @param {number|null} input.requestTemperature
 * @param {boolean} input.shouldInjectTools
 * @param {any[]|null} [input.toolDefinitions]
 * @param {boolean} input.forceFinalFromToolResults
 * @param {any} input.toolChoice
 * @param {string|null} [input.turnId]
 * @param {number} [input.toolRound]
 * @returns {{ requestBody: any, logs: Array<{ level: 'info'|'warn', msg: string, meta: any }> }}
 */
function buildChatRequestBody({
  model,
  messages,
  caps,
  provider,
  requestTemperature,
  shouldInjectTools,
  toolDefinitions = null,
  forceFinalFromToolResults,
  toolChoice,
  turnId = null,
  toolRound = 0,
}) {
  /** @type {any} */
  const requestBody = {
    model,
    messages,
    stream: true,
    max_tokens: caps.maxTokens || 4096,
  };
  /** @type {Array<{ level: 'info'|'warn', msg: string, meta: any }>} */
  const logs = [];

  if (requestTemperature !== null) {
    requestBody.temperature = requestTemperature;
  }
  if (provider.supportsStreamOptions) {
    requestBody.stream_options = { include_usage: true };
  }

  if (shouldInjectTools) {
    requestBody.tools = toolDefinitions || [];
    // 部分 OpenAI 兼容服务商（如硅基流动）不支持 tool_choice 指定具体函数名，
    // 只允许 'auto' / 'none'。仅在 provider 明确声明支持时才发对象形式。
    const isObjectToolChoice = toolChoice && typeof toolChoice === 'object';
    requestBody.tool_choice = forceFinalFromToolResults
      ? 'none'
      : ((isObjectToolChoice && !provider.supportsToolChoiceFunction) ? 'auto' : toolChoice);
    if (forceFinalFromToolResults) {
      logs.push({
        level: 'info',
        msg: 'Google 工具续轮强制收束为最终回答',
        meta: { turnId: turnId || null, toolRound },
      });
    }
    if (!forceFinalFromToolResults && isObjectToolChoice && !provider.supportsToolChoiceFunction) {
      logs.push({
        level: 'warn',
        msg: 'tool_choice 对象形式降级为 auto（provider 不支持指定函数）',
        meta: { provider: provider.id, requested: JSON.stringify(toolChoice) },
      });
    }
  }

  return { requestBody, logs };
}

module.exports = { buildChatRequestBody };
