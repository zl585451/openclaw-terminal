'use strict';

const assert = require('node:assert');
const {
  ensureWebFileShim,
  maskProxyUrl,
  readProxyUrl,
  setupFetchProxyFromEnv,
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
      setGlobalDispatcher(agent) {
        events.push(['dispatcher', agent.url]);
      },
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
    ['dispatcher', 'http://user:pass@127.0.0.1:7890'],
    ['log', '[OCT] [gateway] undici fetch proxy enabled:', 'http://*****@127.0.0.1:7890'],
  ]);
}

function testProxyHelpers() {
  assert.equal(readProxyUrl({ http_proxy: ' http://127.0.0.1:7890 ' }), 'http://127.0.0.1:7890');
  assert.equal(maskProxyUrl('http://user:pass@example.test'), 'http://*****@example.test');
  assert.equal(setupFetchProxyFromEnv({ env: {}, consoleRef: {} }), false);
}

testEnsureFileFromBufferModule();
testEnsureFileFallbackShim();
testProxySetup();
testProxyHelpers();

console.log('PASS gateway environment bootstrap is isolated');
