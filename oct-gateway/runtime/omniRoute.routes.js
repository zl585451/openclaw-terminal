'use strict';

/**
 * OmniRoute 静态逻辑能力与候选通道路由定义模块 (Phase 4)
 */

const omniConfig = require('./omniRoute.config');

const OMNI_ROUTE_CAPABILITIES = {
  'oct-chat': {
    description: 'Low-latency conversational chat and instant response.',
    tools: false,
    candidates: [
      { provider: 'current', model: 'current' },
      { provider: 'deepseek', model: 'deepseek-v4-flash' },
      { provider: 'bailian', model: 'qwen-turbo' },
      { provider: 'google', model: 'google/gemini-2.0-flash-lite' },
    ],
  },
  'oct-plan': {
    description: 'Structured planning, summarization, and heavy extraction.',
    tools: false,
    candidates: [
      { provider: 'current', model: 'current' },
      { provider: 'bailian-coding', model: 'qwen3.5-plus' },
      { provider: 'newapi', model: 'qwen3.6-plus-2026-04-02' },
      { provider: 'deepseek', model: 'deepseek-v4-pro' },
    ],
  },
  'oct-tool-safe': {
    description: 'Strict, verified function calling and tool loop execution.',
    tools: true,
    candidates: [
      { provider: 'bailian-coding', model: 'qwen3.5-plus' },
      { provider: 'openai', model: 'gpt-4o' },
      { provider: 'moonshot', model: 'kimi-k2.6' },
      { provider: 'minimax', model: 'MiniMax-M2.7' },
    ],
  },
};

/**
 * 根据别名获取其只读复制定义
 * @param {string} capability - 别名
 * @returns {object|null}
 */
function getCapabilityDefinition(capability) {
  const definition = OMNI_ROUTE_CAPABILITIES[capability];
  if (!definition) return null;

  const customCandidates = omniConfig.getRouteCandidates(capability);
  const candidates = customCandidates || definition.candidates;

  return {
    description: definition.description,
    tools: definition.tools,
    candidates: candidates.map((c) => ({ ...c })),
  };
}

/**
 * 列出所有支持能力的完整复制列表
 * @returns {Array<object>}
 */
function listCapabilityDefinitions() {
  return Object.keys(OMNI_ROUTE_CAPABILITIES).map((capability) => {
    return {
      capability,
      ...getCapabilityDefinition(capability),
    };
  });
}

module.exports = {
  OMNI_ROUTE_CAPABILITIES,
  getCapabilityDefinition,
  listCapabilityDefinitions,
};
