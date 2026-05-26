'use strict';

const assert = require('node:assert');
const {
  ensureWebFileShim,
  maskProxyUrl,
  readProxyUrl,
  setupFetchProxyFromEnv,
  shouldBypassProxy,
  getFetchDispatcher,
} = require('../bootstrap/environment');

function testEnsureFileFromBufferModule() {
  function BufferFile() {}
  const globalRef = {};
  const changed = ensureWebFileShim({
    globalRef,
    loadBuffer: () => ({ File: BufferFile }),
  });

  assert.equal(changed, true);
  assert.equal(globalRef.File, BufferFile);
}

function testEnsureFileFallbackShim() {
  const globalRef = { Blob };
  const changed = ensureWebFileShim({
    globalRef,
    loadBuffer: () => ({}),
  });
  const file = new globalRef.File(['hello'], 'a.txt', { type: 'text/plain', lastModified: 123 });

  assert.equal(changed, true);
  assert.equal(file.name, 'a.txt');
  assert.equal(file.lastModified, 123);
  assert.equal(file.webkitRelativePath, '');
  assert.equal(Object.prototype.toString.call(file), '[object File]');
}

function testProxySetup() {
  const events = [];
  class ProxyAgent {
    constructor(url) {
      this.url = url;
    }
  }
  const env = {
    HTTPS_PROXY: 'http://user:pass@127.0.0.1:7890',
    NODE_USE_ENV_PROXY: '1',
    node_use_env_proxy: '1',
  };

  const enabled = setupFetchProxyFromEnv({
    env,
    requireUndici: () => ({
      ProxyAgent,
    }),
    consoleRef: {
      log: (...args) => events.push(['log', ...args]),
      warn: (...args) => events.push(['warn', ...args]),
    },
  });

  assert.equal(enabled, true);
  assert.equal(env.NODE_USE_ENV_PROXY, undefined);
  assert.equal(env.node_use_env_proxy, undefined);
  assert.deepEqual(events, [
    ['log', '[OCT] [gateway] undici fetch proxy ready:', 'http://*****@127.0.0.1:7890'],
  ]);
}

function testProxyHelpers() {
  assert.equal(readProxyUrl({ http_proxy: ' http://127.0.0.1:7890 ' }), 'http://127.0.0.1:7890');
  assert.equal(maskProxyUrl('http://user:pass@example.test'), 'http://*****@example.test');
  assert.equal(setupFetchProxyFromEnv({ env: {}, consoleRef: {} }), false);
}

function testNoProxyBypass() {
  process.env.NO_PROXY = 'localhost,127.0.0.1,::1,dashscope.aliyuncs.com,api.deepseek.com';
  process.env.no_proxy = process.env.NO_PROXY;

  // 国内 AI 服务应绕过代理
  assert.equal(shouldBypassProxy('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'), true);
  assert.equal(shouldBypassProxy('https://api.deepseek.com/v1/chat/completions'), true);
  // 境外服务应走代理
  assert.equal(shouldBypassProxy('https://api.openai.com/v1/chat/completions'), false);
  assert.equal(shouldBypassProxy('https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent'), false);
  // 本地地址应绕过
  assert.equal(shouldBypassProxy('http://localhost:3000/api'), true);
  assert.equal(shouldBypassProxy('http://127.0.0.1:8080/health'), true);
  // 非法 URL 不报错
  assert.equal(shouldBypassProxy(''), false);
  assert.equal(shouldBypassProxy(null), false);

  delete process.env.NO_PROXY;
  delete process.env.no_proxy;
}

function testGetFetchDispatcher() {
  // 无代理时所有 URL 都返回 undefined
  const noProxySaved = process.env.NO_PROXY;
  const noProxyLowerSaved = process.env.no_proxy;
  process.env.NO_PROXY = 'dashscope.aliyuncs.com';
  process.env.no_proxy = process.env.NO_PROXY;

  // testProxySetup 已设置代理，dashscope 在 NO_PROXY → 直连
  assert.equal(getFetchDispatcher('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'), undefined);
  // api.openai.com 不在 NO_PROXY → 走代理
  const disp = getFetchDispatcher('https://api.openai.com/v1/chat/completions');
  assert.notEqual(disp, undefined);

  process.env.NO_PROXY = noProxySaved;
  process.env.no_proxy = noProxyLowerSaved;
}

testEnsureFileFromBufferModule();
testEnsureFileFallbackShim();
testProxySetup();
testProxyHelpers();
testNoProxyBypass();
testGetFetchDispatcher();

console.log('PASS gateway environment bootstrap is isolated');
