'use strict';

/**
 * OmniRoute 静态逻辑能力映射草案 (Phase 1)
 * 
 * 限制与规范：
 * - 仅作为静态声明和只读辅助函数，不引入任何业务运行时状态。
 * - 严禁 require 核心 config.js / providers.js / ai.js。
 * - 严禁读取 process.env 环境变量。
 * - 严禁在此处实现 Credentials、Vault、Adapter 或 Fallback 重试逻辑。
 * - 该文件不应被现存主流程中的任何文件所引用。
 */

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
 * 获取逻辑能力定义的只读复制
 * @param {string} capability - 逻辑能力别名
 * @returns {object|null} 能力定义或 null
 */
function getCapabilityDefinition(capability) {
  const definition = OMNI_ROUTE_CAPABILITIES[capability];
  if (!definition) return null;
  return {
    description: definition.description,
    tools: definition.tools,
    candidates: definition.candidates.map((c) => ({ ...c })),
  };
}

/**
 * 获取特定逻辑能力下的候选提供商/模型列表
 * @param {string} capability - 逻辑能力别名
 * @returns {Array<object>} 候选列表
 */
function getCandidatesFor(capability) {
  const definition = OMNI_ROUTE_CAPABILITIES[capability];
  if (!definition) return [];
  return definition.candidates.map((c) => ({ ...c }));
}

module.exports = {
  OMNI_ROUTE_CAPABILITIES,
  getCapabilityDefinition,
  getCandidatesFor,
};
