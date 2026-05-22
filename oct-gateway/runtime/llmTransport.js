const { ProxyAgent } = require('undici');

const noop = () => {};
const defaultLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};
const googleProxyAgentCache = new Map();

function resolveLogger(logger) {
  return logger && typeof logger === 'object'
    ? {
        debug: typeof logger.debug === 'function' ? logger.debug.bind(logger) : noop,
        info: typeof logger.info === 'function' ? logger.info.bind(logger) : noop,
        warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : noop,
        error: typeof logger.error === 'function' ? logger.error.bind(logger) : noop,
      }
    : defaultLogger;
}

function maskGatewayUrl(url) {
  return String(url || '').replace(/\/v1.*/, '/v1/...');
}

function createGoogleScopedDispatcher(url, { googleHttpsProxy, logger } = {}) {
  const log = resolveLogger(logger);
  try {
    const proxyUrl = String(googleHttpsProxy || '').trim();
    if (!proxyUrl) return null;
    const host = String(new URL(url).hostname || '').toLowerCase();
    const isGoogleHost = host.includes('aiplatform.googleapis.com') || host.includes('generativelanguage.googleapis.com');
    if (!isGoogleHost) return null;
    if (!googleProxyAgentCache.has(proxyUrl)) {
      googleProxyAgentCache.set(proxyUrl, new ProxyAgent(proxyUrl));
      log.info('google scoped proxy enabled', {
        proxy: proxyUrl.includes('@') ? proxyUrl.replace(/:\/\/[^@]+@/, '://*****@') : proxyUrl,
      });
    }
    return googleProxyAgentCache.get(proxyUrl);
  } catch {
    return null;
  }
}

async function fetchWithRetry(url, options, { maxRetries = 2, logger, googleHttpsProxy } = {}) {
  const log = resolveLogger(logger);
  const isMiniMax = url.includes('minimaxi.com');
  const timeoutMs = isMiniMax ? 180000 : 120000;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      log.info(`第 ${attempt} 次重试请求...`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        log.warn(`请求超时（${timeoutMs / 1000}秒），触发 abort`);
      }, timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        dispatcher: options?.dispatcher || createGoogleScopedDispatcher(url, { googleHttpsProxy, logger: log }) || undefined,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        const error = new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
        error.status = response.status;
        error.responseText = errorText;
        throw error;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (Number(error?.status) >= 400 && Number(error?.status) < 500) {
        log.warn('客户端/配额类错误不重试', {
          status: error.status,
          url: maskGatewayUrl(url),
        });
        break;
      }
      if (error.name === 'AbortError') {
        log.error('请求被中止（超时）', { url: maskGatewayUrl(url) });
        break;
      }
      if (attempt < maxRetries) {
        log.warn(`请求失败，将重试: ${error.message}`, {
          url: maskGatewayUrl(url),
          errorName: error.name,
          errorCode: error.code,
        });
      }
    }
  }

  throw lastError;
}

function buildChatHeaders(baseUrl, apiKey) {
  const target = String(baseUrl || '');
  if (target.includes('aiplatform.googleapis.com')) {
    return {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

function classifyProbeFailure(message) {
  const m = String(message || '').toLowerCase();
  const hints = [
    'tool',
    'function calling',
    'function_call',
    'tool_calls',
    'tool_choice',
    'unrecognized request argument',
    'unknown field',
    'does not support',
    'not supported',
    'invalid parameter',
  ];
  return hints.some((token) => m.includes(token)) ? 'unsupported' : 'unknown';
}

module.exports = {
  createGoogleScopedDispatcher,
  fetchWithRetry,
  buildChatHeaders,
  classifyProbeFailure,
};
