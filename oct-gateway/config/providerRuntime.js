'use strict';

function validKey(value) {
  return value && typeof value === 'string' && !value.includes('_here') && !value.includes('your_') && value.length > 10;
}

function pickKey(...sources) {
  for (const value of sources) {
    if (validKey(value)) return value;
  }
  return '';
}

function normalizeHttpBaseUrl(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  return text.replace(/\s+/g, '');
}

function normalizeProviderBaseUrl(baseUrl, providerId) {
  const normalized = normalizeHttpBaseUrl(baseUrl);
  if (!normalized) return '';
  if (providerId !== 'newapi') return normalized;
  try {
    const parsed = new URL(normalized);
    if (parsed.pathname === '/' || parsed.pathname === '') {
      parsed.pathname = '/v1';
      return parsed.toString().replace(/\/$/, '');
    }
  } catch {}
  return normalized;
}

function inferProviderFromBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') return 'bailian-coding';
  const target = baseUrl.toLowerCase();
  if (target.includes('coding.dashscope')) return 'bailian-coding';
  if (target.includes('dashscope')) return 'bailian';
  if (target.includes('deepseek')) return 'deepseek';
  if (target.includes('siliconflow')) return 'siliconflow';
  if (target.includes('moonshot')) return 'moonshot';
  if (target.includes('groq')) return 'groq';
  if (target.includes('api.openai.com')) return 'openai';
  if (target.includes('localhost:11434') || target.includes('127.0.0.1:11434')) return 'ollama';
  if (target.includes('generativelanguage.googleapis.com')) return 'google';
  if (target && target.length > 10) return 'custom';
  return 'bailian-coding';
}

function createConfigValueReaders({ fileConfig, env, legacyConfig }) {
  function getEnvOrConfig(key) {
    if (Object.prototype.hasOwnProperty.call(fileConfig, key)) return fileConfig[key];
    if (Object.prototype.hasOwnProperty.call(env, key)) return env[key];
    if (Object.prototype.hasOwnProperty.call(legacyConfig, key)) return legacyConfig[key];
    return '';
  }

  function readBoolConfig(key, fallback = false) {
    const raw = getEnvOrConfig(key);
    if (raw === '' || raw === null || raw === undefined) return fallback;
    return /^(1|true|yes|on)$/i.test(String(raw).trim());
  }

  function readPositiveIntConfig(key, fallback) {
    const parsed = Number(getEnvOrConfig(key));
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
  }

  function readOptionalBoolConfig(key) {
    const raw = getEnvOrConfig(key);
    if (raw === '' || raw === null || raw === undefined) return null;
    const value = String(raw).trim().toLowerCase();
    if (!value || value === 'auto' || value === 'default') return null;
    if (/^(1|true|yes|on)$/i.test(value)) return true;
    if (/^(0|false|no|off)$/i.test(value)) return false;
    return null;
  }

  return {
    getEnvOrConfig,
    readBoolConfig,
    readPositiveIntConfig,
    readOptionalBoolConfig,
  };
}

function createProviderConfigResolver({
  providers,
  fileConfig,
  env,
  legacyConfig,
  getCurrentProvider,
  getCurrentModel,
  getModelCaps,
  loadAvailableModels,
  sanitizeGoogleOpenAiBaseUrl,
  createLogger,
  readers,
}) {
  const {
    getEnvOrConfig,
    readOptionalBoolConfig,
  } = readers;

  return function getProviderConfig() {
    const preset = providers[getCurrentProvider()] || providers['bailian-coding'];
    const isBailian = preset.id === 'bailian' || preset.id === 'bailian-coding';
    const isDeepseek = preset.id === 'deepseek';
    const isMinimax = preset.id === 'minimax';
    const isMoonshot = preset.id === 'moonshot';
    const isGoogle = preset.id === 'google';
    const isCustom = preset.id === 'custom';
    const isNewApi = preset.id === 'newapi';

    let apiKey = '';
    if (preset.fixedApiKey) {
      apiKey = preset.fixedApiKey;
    } else if (preset.id === 'siliconflow') {
      const siliconFlowKey = pickKey(
        fileConfig.SILICONFLOW_API_KEY,
        env.SILICONFLOW_API_KEY,
      );
      const dashscopeKey = pickKey(
        fileConfig.DASHSCOPE_API_KEY,
        env.DASHSCOPE_API_KEY,
        legacyConfig.DASHSCOPE_API_KEY,
      );
      const dashLooksCodingPlan = dashscopeKey && String(dashscopeKey).trim().toLowerCase().startsWith('sk-sp-');
      if (siliconFlowKey) {
        apiKey = siliconFlowKey;
      } else if (dashscopeKey && !dashLooksCodingPlan) {
        apiKey = dashscopeKey;
      } else {
        apiKey = '';
        if (dashLooksCodingPlan) {
          try {
            createLogger('config').warn(
              'OCT_PROVIDER=siliconflow：DASHSCOPE_API_KEY 为百炼 Coding(sk-sp-)，不能用于硅基。请填写硅基 API Key（设置保存会写入 SILICONFLOW_API_KEY），或编辑 config.json。',
            );
          } catch (_) {
            console.warn('[config] siliconflow: sk-sp- in DASHSCOPE is not valid for api.siliconflow.cn');
          }
        }
      }
    } else if (preset.keyEnvVars && preset.keyEnvVars.length > 0) {
      const sources = preset.keyEnvVars.flatMap((key) => [
        fileConfig[key],
        env[key],
        isBailian ? legacyConfig.DASHSCOPE_API_KEY : null,
        isDeepseek ? legacyConfig.DEEPSEEK_API_KEY : null,
        isMinimax ? legacyConfig.MINIMAX_API_KEY : null,
      ].filter(Boolean));
      apiKey = pickKey(...sources);
      if (isMoonshot && apiKey && String(apiKey).trim().toLowerCase().startsWith('sk-sp-')) {
        apiKey = '';
        try {
          createLogger('config').warn(
            'OCT_PROVIDER=moonshot：检测到阿里云百炼 Coding(sk-sp-) Key，不能用于 Kimi 官方直连接口。请填写 MOONSHOT_API_KEY。',
          );
        } catch (_) {
          console.warn('[config] moonshot: sk-sp- key is not valid for api.moonshot.cn');
        }
      }
    }

    let baseUrl = preset.baseUrl || '';
    if (isBailian) {
      baseUrl = getEnvOrConfig('DASHSCOPE_BASE_URL') || preset.baseUrl;
    } else if (isDeepseek) {
      baseUrl = getEnvOrConfig('DEEPSEEK_BASE_URL') || preset.baseUrl;
    } else if (isMinimax) {
      baseUrl = getEnvOrConfig('MINIMAX_BASE_URL') || preset.baseUrl;
    } else if (isMoonshot) {
      baseUrl = getEnvOrConfig('MOONSHOT_BASE_URL') || preset.baseUrl;
    } else if (isGoogle) {
      baseUrl = sanitizeGoogleOpenAiBaseUrl(getEnvOrConfig('GOOGLE_AI_BASE_URL') || preset.baseUrl);
    } else if (isNewApi) {
      baseUrl = getEnvOrConfig('NEWAPI_BASE_URL') || preset.baseUrl;
    } else if (isCustom) {
      baseUrl = fileConfig.CUSTOM_BASE_URL || env.CUSTOM_BASE_URL || '';
      apiKey = fileConfig.CUSTOM_API_KEY || env.CUSTOM_API_KEY || '';
    }

    let effectiveModel = getCurrentModel();
    if (isCustom && fileConfig.CUSTOM_MODEL) {
      effectiveModel = fileConfig.CUSTOM_MODEL;
    }
    if (isGoogle && getCurrentModel() === '__custom__' && fileConfig.CUSTOM_MODEL) {
      effectiveModel = String(fileConfig.CUSTOM_MODEL).trim();
    }
    if (isNewApi && getCurrentModel() === '__custom__' && fileConfig.CUSTOM_MODEL) {
      effectiveModel = String(fileConfig.CUSTOM_MODEL).trim();
    }
    const customModelSupportsTools = readOptionalBoolConfig('CUSTOM_MODEL_SUPPORTS_TOOLS');

    let models = preset.models || [];
    if ((isCustom || isNewApi) && effectiveModel && effectiveModel !== '__custom__') {
      const customModelToolMode = customModelSupportsTools === true
        ? 'enabled'
        : customModelSupportsTools === false
          ? 'disabled'
          : 'auto_probe';
      const customModelEntry = {
        id: effectiveModel,
        label: `${effectiveModel} (自定义，工具${customModelToolMode === 'auto_probe' ? '自动探测' : customModelToolMode === 'enabled' ? '开启' : '关闭'})`,
        thinking: false,
      };
      if (customModelToolMode === 'enabled') {
        customModelEntry.tools = true;
        customModelEntry.toolReliability = 'loose';
      } else if (customModelToolMode === 'disabled') {
        customModelEntry.tools = false;
        customModelEntry.toolReliability = 'none';
      }
      models = [
        customModelEntry,
        ...models.filter((model) => model.id !== effectiveModel),
      ];
    }
    if (isGoogle && effectiveModel && effectiveModel !== '__custom__' && !models.some((model) => model.id === effectiveModel)) {
      models = [
        { id: effectiveModel, label: `${effectiveModel} (自定义)`, tools: false, thinking: false },
        ...models,
      ];
    }
    if (models.length === 0 && preset.defaultModel) {
      const defaultCaps = getModelCaps(preset.defaultModel);
      models = [{
        id: preset.defaultModel,
        label: preset.defaultModel,
        tools: !!defaultCaps.supportsTools,
        thinking: !!defaultCaps.supportsThinking,
      }];
    }
    if (models.length === 0) {
      models = loadAvailableModels().map((model) => {
        const caps = getModelCaps(model.id);
        return {
          id: model.id,
          label: caps.label,
          tools: caps.supportsTools,
          toolReliability: caps.toolReliability,
          thinking: caps.supportsThinking,
        };
      });
    }

    baseUrl = normalizeProviderBaseUrl(baseUrl, preset.id);

    return {
      ...preset,
      apiKey,
      baseUrl,
      models,
      customModel: (isCustom || isNewApi) ? effectiveModel : undefined,
      customModelSupportsTools: (isCustom || isNewApi) ? customModelSupportsTools : undefined,
    };
  };
}

module.exports = {
  createConfigValueReaders,
  createProviderConfigResolver,
  inferProviderFromBaseUrl,
  pickKey,
  normalizeProviderBaseUrl,
};
