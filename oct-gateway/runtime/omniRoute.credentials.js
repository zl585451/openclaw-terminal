'use strict';

/**
 * OmniRoute 凭证解析与只读可用性检测模块 (Phase 4)
 */

const config = require('../config');
const omniConfig = require('./omniRoute.config');

/**
 * 解析具体候选物理通道配置
 * @param {object} candidate - `{ provider, model }`
 * @param {object} options - 选项，如 `{ originalResolve: Function }`
 * @returns {object} 返回具有 `{ ok, provider, model, baseUrl, apiKey, source, reason }` 的解析结果
 */
function resolveCandidate(candidate, options = {}) {
  const providerId = candidate.provider;
  const modelId = candidate.model;

  if (providerId === 'current' && modelId === 'current') {
    if (typeof options.originalResolve === 'function') {
      const orig = options.originalResolve();
      if (orig && orig.baseUrl && orig.apiKey) {
        return {
          ok: true,
          provider: orig.id || orig.providerId || 'current',
          model: orig.model,
          baseUrl: orig.baseUrl.replace(/\/$/, ''),
          apiKey: orig.apiKey,
          source: orig.source || 'original_resolve',
          reason: null,
        };
      }
    }
    return {
      ok: false,
      provider: 'current',
      model: 'current',
      baseUrl: null,
      apiKey: '',
      source: 'original_resolve',
      reason: 'Original resolution returned empty or failed',
    };
  }

  const customCred = omniConfig.getCredential(providerId);
  const hasPreset = !!(config && config.PROVIDERS && config.PROVIDERS[providerId]);
  const preset = hasPreset ? config.PROVIDERS[providerId] : {};

  if (!customCred && !hasPreset) {
    return {
      ok: false,
      provider: providerId,
      model: modelId,
      baseUrl: null,
      apiKey: '',
      source: `omniroute_candidate_${providerId}`,
      reason: `Provider preset "${providerId}" not found in PROVIDERS and no credential found in vault`,
    };
  }

  const getEnvVal = (key) => {
    if (config && typeof config.getEnvOrConfig === 'function') {
      return config.getEnvOrConfig(key);
    }
    return process.env[key] || '';
  };

  // 1. 尝试解析 Base URL
  let baseUrl = '';
  if (customCred && customCred.baseUrl) {
    baseUrl = customCred.baseUrl;
  } else {
    baseUrl = preset.baseUrl || '';
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
    } else if (providerId !== 'current') {
      const envVar = `${providerId.toUpperCase().replace('-', '_')}_BASE_URL`;
      baseUrl = getEnvVal(envVar) || baseUrl;
    }
  }

  // 2. 尝试解析 API Key
  let apiKey = '';
  if (customCred && customCred.apiKey) {
    apiKey = customCred.apiKey;
  } else {
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
  }

  // 3. 确定具体 Model
  const model = modelId || preset.defaultModel || '';

  const isFromVault = !!(customCred && customCred.apiKey);
  const sourceName = isFromVault ? `omniroute_vault_${providerId}` : `omniroute_candidate_${providerId}`;

  if (!baseUrl) {
    return {
      ok: false,
      provider: providerId,
      model,
      baseUrl: null,
      apiKey: '',
      source: sourceName,
      reason: 'Base URL is empty',
    };
  }

  if (!apiKey) {
    return {
      ok: false,
      provider: providerId,
      model,
      baseUrl: baseUrl.replace(/\/$/, ''),
      apiKey: '',
      source: sourceName,
      reason: 'API Key is empty',
    };
  }

  if (!model) {
    return {
      ok: false,
      provider: providerId,
      model: '',
      baseUrl: baseUrl.replace(/\/$/, ''),
      apiKey: '',
      source: sourceName,
      reason: 'Model is empty',
    };
  }

  return {
    ok: true,
    provider: providerId,
    model,
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
    source: sourceName,
    reason: null,
  };
}

/**
 * 安全诊断单个候选通道，不泄漏 API Key
 * @param {object} candidate - `{ provider, model }`
 * @param {object} options - 选项，如 `{ originalResolve: Function }`
 * @returns {object} 返回 `{ ok, provider, model, baseUrl, hasApiKey, reason }`
 */
function inspectCandidate(candidate, options = {}) {
  const resolved = resolveCandidate(candidate, options);
  return {
    ok: resolved.ok,
    provider: resolved.provider,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
    hasApiKey: !!resolved.apiKey,
    reason: resolved.reason,
  };
}

/**
 * 罗列系统内所有预置服务商凭证就绪状态列表
 * @param {object} options - 选项
 * @returns {Array<object>}
 */
function listProviderCredentialStatus(options = {}) {
  if (!config || !config.PROVIDERS) return [];
  return Object.keys(config.PROVIDERS).map((providerId) => {
    const preset = config.PROVIDERS[providerId];
    return inspectCandidate({ provider: providerId, model: preset.defaultModel }, options);
  });
}

module.exports = {
  resolveCandidate,
  inspectCandidate,
  listProviderCredentialStatus,
};
