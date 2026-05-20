'use strict';

/**
 * OmniRoute 核心解析与路由模块 (Phase 3)
 */

const config = require('../config');

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
 * 判断是否为有效的逻辑能力别名
 * @param {string} name - 别名
 * @returns {boolean}
 */
function isCapabilityAlias(name) {
  return Object.prototype.hasOwnProperty.call(OMNI_ROUTE_CAPABILITIES, name);
}

/**
 * 获取所有支持的逻辑能力列表
 * @returns {Array<string>}
 */
function listCapabilities() {
  return Object.keys(OMNI_ROUTE_CAPABILITIES);
}

/**
 * 内部辅助方法：尝试解析一个候选提供商
 */
function resolveCandidateProvider(providerId, modelId) {
  if (!config || !config.PROVIDERS || !config.PROVIDERS[providerId]) {
    return null;
  }
  const preset = config.PROVIDERS[providerId];
  const getEnvVal = (key) => {
    if (config && typeof config.getEnvOrConfig === 'function') {
      return config.getEnvOrConfig(key);
    }
    return process.env[key] || '';
  };

  // 1. Resolve Base URL
  let baseUrl = preset.baseUrl || '';
  if (providerId === 'bailian' || providerId === 'bailian-coding') {
    baseUrl = getEnvVal('DASHSCOPE_BASE_URL') || baseUrl;
  } else if (providerId === 'deepseek') {
    baseUrl = getEnvVal('DEEPSEEK_BASE_URL') || baseUrl;
  } else if (providerId === 'minimax') {
    baseUrl = getEnvVal('MINIMAX_BASE_URL') || baseUrl;
  } else if (providerId === 'moonshot') {
    baseUrl = getEnvVal('MOONSHOT_BASE_URL') || baseUrl;
  } else if (providerId === 'google') {
    baseUrl = getEnvVal('GOOGLE_AI_BASE_URL') || baseUrl;
  } else if (providerId === 'newapi') {
    baseUrl = getEnvVal('NEWAPI_BASE_URL') || baseUrl;
  } else if (providerId === 'custom') {
    baseUrl = getEnvVal('CUSTOM_BASE_URL') || baseUrl;
  } else {
    const envVar = `${providerId.toUpperCase().replace('-', '_')}_BASE_URL`;
    baseUrl = getEnvVal(envVar) || baseUrl;
  }

  // 2. Resolve API Key
  let apiKey = '';
  if (preset.fixedApiKey) {
    apiKey = preset.fixedApiKey;
  } else if (providerId === 'siliconflow') {
    const sfKey = getEnvVal('SILICONFLOW_API_KEY');
    const dashKey = getEnvVal('DASHSCOPE_API_KEY');
    const dashLooksCodingPlan = dashKey && String(dashKey).trim().toLowerCase().startsWith('sk-sp-');
    if (sfKey) {
      apiKey = sfKey;
    } else if (dashKey && !dashLooksCodingPlan) {
      apiKey = dashKey;
    }
  } else {
    const envVars = preset.keyEnvVars || [];
    for (const keyVar of envVars) {
      const val = getEnvVal(keyVar);
      if (val) {
        if (providerId === 'moonshot' && String(val).trim().toLowerCase().startsWith('sk-sp-')) {
          continue;
        }
        apiKey = val;
        break;
      }
    }
  }

  // 3. Resolve Model
  const model = modelId || preset.defaultModel || '';

  if (!baseUrl || !apiKey || !model) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
    model,
    providerId,
    source: `omniroute_candidate_${providerId}`,
  };
}

/**
 * 解析具体逻辑能力的提供商配置
 * @param {string} capability - 逻辑能力别名 (如 oct-chat, oct-plan, oct-tool-safe)
 * @param {object} context - 包含 originalResolve 回调的上下文
 * @returns {object|null} 解析成功则返回 `{ providerId, baseUrl, apiKey, model, source, capability }`
 */
function resolveCapability(capability, context = {}) {
  if (!isCapabilityAlias(capability)) {
    return null;
  }
  const def = OMNI_ROUTE_CAPABILITIES[capability];
  const candidates = def.candidates;

  for (const candidate of candidates) {
    if (candidate.provider === 'current' && candidate.model === 'current') {
      if (typeof context.originalResolve === 'function') {
        const orig = context.originalResolve();
        if (orig) {
          return {
            providerId: orig.id || orig.providerId || 'current',
            baseUrl: orig.baseUrl,
            apiKey: orig.apiKey,
            model: orig.model,
            source: orig.source || 'original_resolve',
            capability,
          };
        }
      }
    } else {
      const resolved = resolveCandidateProvider(candidate.provider, candidate.model);
      if (resolved) {
        return {
          providerId: resolved.providerId,
          baseUrl: resolved.baseUrl,
          apiKey: resolved.apiKey,
          model: resolved.model,
          source: resolved.source,
          capability,
        };
      }
    }
  }

  return null;
}

module.exports = {
  OMNI_ROUTE_CAPABILITIES,
  isCapabilityAlias,
  listCapabilities,
  resolveCapability,
};
