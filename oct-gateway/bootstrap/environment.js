'use strict';

function ensureWebFileShim({
  globalRef = globalThis,
  loadBuffer = () => require('node:buffer'),
} = {}) {
  if (typeof globalRef.File === 'function') return false;

  try {
    const bufferModule = loadBuffer();
    if (typeof bufferModule.File === 'function') {
      globalRef.File = bufferModule.File;
      return true;
    }
  } catch {}

  if (typeof globalRef.Blob !== 'function') return false;

  class FileShim extends globalRef.Blob {
    constructor(bits = [], name = '', options = {}) {
      super(bits, options);
      this.name = String(name);
      this.lastModified = Number.isFinite(options.lastModified) ? options.lastModified : Date.now();
      this.webkitRelativePath = '';
    }

    get [Symbol.toStringTag]() {
      return 'File';
    }
  }

  globalRef.File = FileShim;
  return true;
}

function readProxyUrl(env = process.env) {
  return String(
    env.HTTPS_PROXY
    || env.https_proxy
    || env.HTTP_PROXY
    || env.http_proxy
    || ''
  ).trim();
}

function maskProxyUrl(raw) {
  return raw.includes('@') ? raw.replace(/:\/\/[^@]+@/, '://*****@') : raw;
}

// 每个请求独立判断是否需要走代理，不再用 setGlobalDispatcher 全局一刀切
let _proxyAgent = null;

function setupFetchProxyFromEnv({
  env = process.env,
  requireUndici = () => require('undici'),
  consoleRef = console,
} = {}) {
  try {
    const raw = readProxyUrl(env);
    if (!raw) return false;

    // 与 undici ProxyAgent 叠用时，部分 Node 的 NODE_USE_ENV_PROXY 会让出站请求携带重复鉴权，
    // generativelanguage 返回 400「Multiple authentication credentials」。
    delete env.NODE_USE_ENV_PROXY;
    delete env.node_use_env_proxy;

    const { ProxyAgent } = requireUndici();
    _proxyAgent = new ProxyAgent(raw);
    consoleRef.log?.('[OCT] [gateway] undici fetch proxy ready:', maskProxyUrl(raw));
    return true;
  } catch (e) {
    consoleRef.warn?.('[OCT] [gateway] undici fetch proxy skipped:', String(e && e.message ? e.message : e));
    return false;
  }
}

/**
 * 检查目标 URL 是否应该绕过代理（NO_PROXY 列表命中）。
 */
function shouldBypassProxy(url) {
  if (!url) return false;
  try {
    const hostname = new URL(String(url)).hostname;
    if (!hostname) return false;
    const noProxyList = String(process.env.NO_PROXY || process.env.no_proxy || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return noProxyList.some((entry) => {
      if (hostname === entry) return true;
      if (entry.startsWith('.') && hostname.endsWith(entry)) return true;
      if (!entry.startsWith('.') && hostname.endsWith('.' + entry)) return true;
      return false;
    });
  } catch {
    return false;
  }
}

/**
 * 返回 fetch 请求应该使用的 dispatcher。
 * - 目标在 NO_PROXY 中 → undefined（直连）
 * - 代理未配置 → undefined（直连）
 * - 其他 → ProxyAgent
 */
function getFetchDispatcher(url) {
  if (!_proxyAgent) return undefined;
  if (shouldBypassProxy(url)) return undefined;
  return _proxyAgent;
}

/**
 * 带代理回退的 fetch 封装：
 * 1. 先走 getFetchDispatcher(url) 决定是否用代理
 * 2. 如果请求失败且用了代理，自动摘代理重试一次
 */
async function fetchWithProxyFallback(url, options = {}) {
  const dispatcher = getFetchDispatcher(url);
  const fetchOptions = { ...options };
  if (dispatcher) {
    fetchOptions.dispatcher = dispatcher;
  }

  try {
    return await fetch(url, fetchOptions);
  } catch (firstError) {
    // 只对网络层错误做回退；HTTP 错误（如 4xx/5xx）不重试
    const msg = String(firstError?.message || firstError);
    const isNetworkError =
      msg.includes('fetch failed') ||
      msg.includes('network error') ||
      firstError?.code === 'ENOTFOUND' ||
      firstError?.code === 'ECONNREFUSED' ||
      firstError?.code === 'ECONNRESET' ||
      firstError?.code === 'ETIMEDOUT' ||
      firstError?.cause?.code === 'ENOTFOUND' ||
      firstError?.cause?.code === 'ECONNREFUSED' ||
      firstError?.cause?.code === 'ECONNRESET' ||
      firstError?.cause?.code === 'ETIMEDOUT';

    if (dispatcher && isNetworkError) {
      console.warn('[OCT] [gateway] proxy fetch failed, retrying direct:', String(firstError?.message).slice(0, 120));
      return fetch(url, { ...options }); // 去掉 dispatcher，直连重试
    }

    throw firstError;
  }
}

module.exports = {
  ensureWebFileShim,
  maskProxyUrl,
  readProxyUrl,
  setupFetchProxyFromEnv,
  shouldBypassProxy,
  getFetchDispatcher,
  fetchWithProxyFallback,
};
