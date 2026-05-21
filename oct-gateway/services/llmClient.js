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

function sameResolvedRoute(a, b) {
  if (!a || !b) return false;
  return String(a.providerId || '') === String(b.providerId || '')
    && String(a.baseUrl || '').replace(/\/$/, '') === String(b.baseUrl || '').replace(/\/$/, '')
    && String(a.model || '') === String(b.model || '')
    && String(a.apiKey || '') === String(b.apiKey || '');
}

function prependExternalCandidate(activeCandidates, extResolved) {
  if (!extResolved) {
    return Array.isArray(activeCandidates) ? activeCandidates : [];
  }
  const list = Array.isArray(activeCandidates) ? activeCandidates : [];
  const deduped = list.filter((candidate) => !sameResolvedRoute(candidate, extResolved));
  return [extResolved, ...deduped];
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
async function chatCompletion(options) {
  const provider = options.provider || {};
  if (!provider.capability) {
    return chatCompletionRaw(options);
  }

  const omniRoute = require('../runtime/omniRoute');
  const externalOmniRoute = require('../runtime/externalOmniRoute');
  const context = {
    originalResolve: () => {
      return provider;
    }
  };

  const extResolved = externalOmniRoute.resolveCapabilityTarget(provider.capability);
  let activeCandidates = omniRoute.resolveAllCandidates(provider.capability, context);
  activeCandidates = prependExternalCandidate(activeCandidates, extResolved);

  if (activeCandidates.length <= 1 && (!activeCandidates[0] || activeCandidates[0].providerId !== 'external_omniroute')) {
    return chatCompletionRaw(options);
  }

  let lastError = null;
  for (let i = 0; i < activeCandidates.length; i++) {
    const candidate = activeCandidates[i];
    try {
      return await chatCompletionRaw({
        ...options,
        provider: {
          baseUrl: candidate.baseUrl,
          apiKey: candidate.apiKey,
          model: candidate.model,
          source: candidate.source,
          providerId: candidate.providerId,
          capability: candidate.capability,
        }
      });
    } catch (err) {
      if (omniRoute.isRetryableError(err)) {
        lastError = err;
        console.warn(`[OmniRoute Fallback] Candidate failed: ${candidate.providerId} (${err.message}). Trying next...`);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error(`OmniRoute error: All candidates for ${provider.capability} failed`);
}

async function chatCompletionRaw({
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

  let status = 200;
  let errorType = null;
  let usage = null;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      status = response.status;
      errorType = 'LlmClientHttpError';
      const errBody = await response.text().catch(() => '');
      throw new LlmClientHttpError(response.status, errBody);
    }
    const data = await response.json();
    const content = String(data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '').trim();
    usage = data?.usage;
    return {
      content,
      usage: data?.usage,
      model: provider.model,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    status = error.status || 500;
    if (error?.name === 'AbortError') {
      errorType = 'LlmClientTimeoutError';
      throw new LlmClientTimeoutError(`LLM 请求超时:${timeoutMs}ms`);
    }
    errorType = error.name || 'Error';
    throw error;
  } finally {
    clearTimeout(timer);
    const latencyMs = Date.now() - startedAt;
    try {
      const metrics = require('../runtime/omniRoute.metrics');
      metrics.recordRequest({
        capability: provider.capability || null,
        providerId: provider.providerId || null,
        model: provider.model || null,
        latencyMs,
        status,
        errorType,
        usage,
      });
    } catch (_) {
      // ignore
    }
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
    try {
      const externalOmniRoute = require('../runtime/externalOmniRoute');
      const extResolved = externalOmniRoute.resolveCapabilityTarget(capability);
      if (extResolved) {
        return {
          baseUrl: extResolved.baseUrl,
          apiKey: extResolved.apiKey,
          model: extResolved.model,
          source: extResolved.source,
          providerId: extResolved.providerId,
          capability: extResolved.capability,
        };
      }
    } catch (err) {
      // ignore
    }

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
