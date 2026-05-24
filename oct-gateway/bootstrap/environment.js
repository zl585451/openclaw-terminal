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

    const { setGlobalDispatcher, ProxyAgent } = requireUndici();
    setGlobalDispatcher(new ProxyAgent(raw));
    consoleRef.log?.('[OCT] [gateway] undici fetch proxy enabled:', maskProxyUrl(raw));
    return true;
  } catch (e) {
    consoleRef.warn?.('[OCT] [gateway] undici fetch proxy skipped:', String(e && e.message ? e.message : e));
    return false;
  }
}

module.exports = {
  ensureWebFileShim,
  maskProxyUrl,
  readProxyUrl,
  setupFetchProxyFromEnv,
};
