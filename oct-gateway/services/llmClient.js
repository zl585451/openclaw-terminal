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
 * 非流式 chat completion 调用，OpenAI 兼容协议。(Phase 5: 唯一出口为外部 OmniRoute)
 */
async function chatCompletion(options) {
  const provider = options.provider || {};
  if (!provider.capability) {
    return chatCompletionRaw(options);
  }

  const externalOmniRoute = require('../runtime/externalOmniRoute');
  const extResolved = externalOmniRoute.resolveCapabilityTarget(provider.capability);

  if (!extResolved) {
    throw new Error('LLM_NOT_CONFIGURED: 外部 OmniRoute 未配置或配置不完整。请在设置面板中配置 Base URL 和 API Key。');
  }

  return await chatCompletionRaw({
    ...options,
    provider: {
      baseUrl: extResolved.baseUrl,
      apiKey: extResolved.apiKey,
      model: extResolved.model,
      source: extResolved.source,
      providerId: extResolved.providerId,
      capability: extResolved.capability,
    }
  });
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
 * 解析 script_adapter 等场景的 provider 配置。(Phase 5: 优先外部 OmniRoute，支持开发者环境变量回退)
 */
function resolveProviderFor(purpose = 'general', capability = null) {
  const activeCapability = capability || (purpose === 'script_adapter' ? 'oct-plan' : 'oct-chat');
  try {
    const externalOmniRoute = require('../runtime/externalOmniRoute');
    const extResolved = externalOmniRoute.resolveCapabilityTarget(activeCapability);
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

  // 开发者 / 兼容性备用回退路径
  if (purpose === 'script_adapter') {
    const scriptAdapterProvider = resolveScriptAdapterProvider();
    if (scriptAdapterProvider) return scriptAdapterProvider;
    const currentProvider = resolveCurrentProvider();
    if (currentProvider) return currentProvider;
    const summarizerProvider = resolveSummarizerProvider();
    if (summarizerProvider) return summarizerProvider;
  } else {
    const summarizerProvider = resolveSummarizerProvider();
    if (summarizerProvider) return summarizerProvider;
    const currentProvider = resolveCurrentProvider();
    if (currentProvider) return currentProvider;
  }

  throw new Error('LLM_NOT_CONFIGURED: 外部 OmniRoute 未配置或配置不完整。请先在设置面板配置 Base URL 和 API Key。');
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
