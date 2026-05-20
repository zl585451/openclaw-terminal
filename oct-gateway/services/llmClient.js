'use strict';

const config = require('../config');

class LlmClientTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LlmClientTimeoutError';
  }
}

class LlmClientHttpError extends Error {
  constructor(status, body) {
    super(`LLM_HTTP_${status}: ${String(body || '').slice(0, 400)}`);
    this.name = 'LlmClientHttpError';
    this.status = status;
  }
}

/**
 * 非流式 chat completion 调用，OpenAI 兼容协议。
 * @param {object} options
 * @param {{ baseUrl: string, apiKey: string, model: string }} options.provider
 * @param {Array<{role: string, content: string}>} options.messages
 * @param {number} [options.maxTokens=1024]
 * @param {number} [options.temperature=0.3]
 * @param {boolean} [options.responseJson=false]   true 时尝试要求 JSON 格式
 * @param {number} [options.timeoutMs=30000]
 * @returns {Promise<{ content: string, usage?: object, model: string, latencyMs: number }>}
 */
async function chatCompletion({
  provider,
  messages,
  maxTokens = 1024,
  temperature = 0.3,
  responseJson = false,
  timeoutMs = 30000,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  const url = `${String(provider.baseUrl).replace(/\/$/, '')}/chat/completions`;
  const headers = buildHeaders(provider.baseUrl, provider.apiKey);

  const body = {
    model: provider.model,
    messages,
    stream: false,
    temperature,
    max_tokens: maxTokens,
  };
  if (responseJson) body.response_format = { type: 'json_object' };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new LlmClientHttpError(response.status, errBody);
    }
    const data = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '').trim();
    return {
      content,
      usage: data?.usage,
      model: provider.model,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new LlmClientTimeoutError(`LLM 请求超时:${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildHeaders(baseUrl, apiKey) {
  const target = String(baseUrl || '').toLowerCase();
  if (target.includes('generativelanguage.googleapis.com') || target.includes('aiplatform.googleapis.com')) {
    return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
  }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
}

/**
 * 解析 script_adapter 等场景的 provider 配置。
 * script_adapter：SCRIPT_ADAPTER_* → SUMMARIZER_*（含 memory.summarizer.api）→ 当前 Gateway provider。
 */
function resolveProviderFor(purpose = 'general', capability = null) {
  if (capability) {
    let resolveCapability;
    try {
      const omniRoute = require('../runtime/omniRoute');
      resolveCapability = omniRoute.resolveCapability;
    } catch (err) {
      // ignore
    }

    if (typeof resolveCapability === 'function') {
      const originalResolve = () => {
        if (purpose === 'script_adapter') {
          const scriptAdapterProvider = resolveScriptAdapterProvider();
          if (scriptAdapterProvider) return scriptAdapterProvider;
          const currentProvider = resolveCurrentProvider();
          if (currentProvider) return currentProvider;
          const summarizerProvider = resolveSummarizerProvider();
          if (summarizerProvider) return summarizerProvider;
          return null;
        } else {
          const prefixes = ['SUMMARIZER'];
          const getEnvVal = (key) => {
            if (config && typeof config.getEnvOrConfig === 'function') {
              return config.getEnvOrConfig(key);
            }
            return process.env[key] || '';
          };
          for (const prefix of prefixes) {
            const baseUrl = String(
              getEnvVal('SUMMARIZER_BASE_URL') ||
              config.memory?.summarizer?.api?.baseUrl || ''
            ).trim();
            const apiKey = String(
              getEnvVal('SUMMARIZER_API_KEY') ||
              config.memory?.summarizer?.api?.apiKey || ''
            ).trim();
            const model = String(
              getEnvVal('SUMMARIZER_MODEL') ||
              config.memory?.summarizer?.api?.model || ''
            ).trim();
            if (baseUrl && apiKey && model) {
              return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, model };
            }
          }
          const currentProvider = resolveCurrentProvider();
          if (currentProvider) return currentProvider;
          return null;
        }
      };

      const resolved = resolveCapability(capability, { originalResolve });
      if (resolved) {
        return {
          baseUrl: resolved.baseUrl,
          apiKey: resolved.apiKey,
          model: resolved.model,
          source: resolved.source,
          providerId: resolved.providerId,
          capability: resolved.capability,
        };
      }
    }
  }

  if (purpose === 'script_adapter') {
    const scriptAdapterProvider = resolveScriptAdapterProvider();
    if (scriptAdapterProvider) return scriptAdapterProvider;
    const currentProvider = resolveCurrentProvider();
    if (currentProvider) return currentProvider;
    const summarizerProvider = resolveSummarizerProvider();
    if (summarizerProvider) return summarizerProvider;
    throw new Error('LLM_NOT_CONFIGURED: 当前 provider 不完整,请先在设置面板配置 baseUrl/apiKey/model');
  }

  const prefixes = ['SUMMARIZER'];
  for (const prefix of prefixes) {
    let baseUrl;
    let apiKey;
    let model;
    if (prefix === 'SUMMARIZER') {
      baseUrl = String(
        config.getEnvOrConfig?.('SUMMARIZER_BASE_URL') || config.memory?.summarizer?.api?.baseUrl || '',
      ).trim();
      apiKey = String(
        config.getEnvOrConfig?.('SUMMARIZER_API_KEY') || config.memory?.summarizer?.api?.apiKey || '',
      ).trim();
      model = String(
        config.getEnvOrConfig?.('SUMMARIZER_MODEL') || config.memory?.summarizer?.api?.model || '',
      ).trim();
    } else if (prefix === 'SCRIPT_ADAPTER') {
      const sa = config.scriptAdapter && typeof config.scriptAdapter === 'object' ? config.scriptAdapter : {};
      baseUrl = String(sa.baseUrl || config.getEnvOrConfig?.('SCRIPT_ADAPTER_BASE_URL') || '').trim();
      apiKey = String(sa.apiKey || config.getEnvOrConfig?.('SCRIPT_ADAPTER_API_KEY') || '').trim();
      model = String(sa.model || config.getEnvOrConfig?.('SCRIPT_ADAPTER_MODEL') || '').trim();
    } else {
      baseUrl = String(config.getEnvOrConfig?.(`${prefix}_BASE_URL`) || '').trim();
      apiKey = String(config.getEnvOrConfig?.(`${prefix}_API_KEY`) || '').trim();
      model = String(config.getEnvOrConfig?.(`${prefix}_MODEL`) || '').trim();
    }
    if (baseUrl && apiKey && model) {
      return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, model };
    }
  }
  const currentProvider = resolveCurrentProvider();
  if (currentProvider) return currentProvider;
  throw new Error('LLM_NOT_CONFIGURED: 当前 provider 不完整,请先在设置面板配置 baseUrl/apiKey/model');
}

function resolveScriptAdapterProvider() {
  const sa = config.scriptAdapter && typeof config.scriptAdapter === 'object' ? config.scriptAdapter : {};
  const baseUrl = String(sa.baseUrl || config.getEnvOrConfig?.('SCRIPT_ADAPTER_BASE_URL') || '').trim();
  const apiKey = String(sa.apiKey || config.getEnvOrConfig?.('SCRIPT_ADAPTER_API_KEY') || '').trim();
  const model = String(sa.model || config.getEnvOrConfig?.('SCRIPT_ADAPTER_MODEL') || '').trim();
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, model, source: 'script_adapter' };
}

function resolveSummarizerProvider() {
  const baseUrl = String(
    config.getEnvOrConfig?.('SUMMARIZER_BASE_URL') || config.memory?.summarizer?.api?.baseUrl || '',
  ).trim();
  const apiKey = String(
    config.getEnvOrConfig?.('SUMMARIZER_API_KEY') || config.memory?.summarizer?.api?.apiKey || '',
  ).trim();
  const model = String(
    config.getEnvOrConfig?.('SUMMARIZER_MODEL') || config.memory?.summarizer?.api?.model || '',
  ).trim();
  if (!baseUrl || !apiKey || !model) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, model, source: 'summarizer' };
}

function resolveCurrentProvider() {
  const providerConfig = config.getProviderConfig?.() || {};
  const baseUrl = String(providerConfig.baseUrl || '').trim().replace(/\/$/, '');
  const apiKey = String(providerConfig.apiKey || '').trim();
  const model = String(providerConfig.model || config.DASHSCOPE_MODEL || '').trim();
  if (!baseUrl || !apiKey || !model) {
    return null;
  }
  return { baseUrl, apiKey, model, source: 'current_provider' };
}

module.exports = {
  chatCompletion,
  resolveProviderFor,
  LlmClientTimeoutError,
  LlmClientHttpError,
};
