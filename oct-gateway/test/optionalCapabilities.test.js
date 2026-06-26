'use strict';

const assert = require('node:assert');
const { createOptionalCapabilitiesSnapshot, _internals } = require('../runtime/optionalCapabilities');

function main() {
  assert.equal(_internals.readEnabled({ enabled: false }), false);
  assert.equal(_internals.readEnabled({}), true);
  assert.equal(_internals.readEnabled(false), false);

  const getSnapshot = createOptionalCapabilitiesSnapshot({
    config: {
      scriptAdapter: { enabled: false },
      image_analysis: { enabled: true },
      memory: { enabled: true },
    },
    toolLoader: {
      getDefinitions: () => [{ name: 'read_file' }, { name: 'web_search' }],
    },
    mcpManager: {
      getStatus: () => ({
        files: { status: 'connected' },
        browser: { status: 'error' },
      }),
    },
  });

  const snapshot = getSnapshot();
  assert.equal(snapshot.version, '2026-05-24');
  assert.equal(snapshot.packages.tools.status, 'available');
  assert.equal(snapshot.packages.tools.loadedCount, 2);
  assert.equal(snapshot.packages.mcp_tools.status, 'available');
  assert.equal(snapshot.packages.mcp_tools.serverCount, 2);
  assert.equal(snapshot.packages.mcp_tools.loadedCount, 1);
  assert.equal(snapshot.packages.script_adapter.status, 'disabled');
  assert.equal(snapshot.packages.image_analysis.status, 'enabled');
  assert.equal(snapshot.packages.memory.status, 'enabled');
  assert.equal(snapshot.packages.script_adapter.lazyLoadCandidate, true);

  const empty = createOptionalCapabilitiesSnapshot({
    toolLoader: { getDefinitions: () => [] },
    mcpManager: { getStatus: () => ({}) },
  })();
  assert.equal(empty.packages.tools.status, 'unavailable');
  assert.equal(empty.packages.mcp_tools.status, 'disabled');

  console.log('PASS optional gateway capabilities are packaged');
}

main();

