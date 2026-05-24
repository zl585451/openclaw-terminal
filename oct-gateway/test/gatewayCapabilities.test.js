'use strict';

const assert = require('node:assert');
const { createGatewayCapabilitiesProvider } = require('../runtime/gatewayCapabilities');

function main() {
  const warnings = [];
  const logger = { warn: (...args) => warnings.push(args) };

  const getGatewayCapabilities = createGatewayCapabilitiesProvider({
    config: { DASHSCOPE_MODEL: 'default-model' },
    providerRouter: {
      resolve: (modelId) => ({
        caps: {
          toolsSupport: modelId === 'default-model' ? 'supported' : 'unknown',
          supportsTools: modelId === 'default-model',
          supportsStreamOptions: true,
          capabilitySource: 'test_caps',
        },
      }),
    },
    mcpManager: {
      getStatus: () => ({
        a: { status: 'connected' },
        b: { status: 'disconnected' },
      }),
    },
    logger,
  });

  assert.deepEqual(getGatewayCapabilities(), {
    model: 'default-model',
    toolsSupport: 'supported',
    capabilitySource: 'test_caps',
    supportsTools: true,
    supportsStreamOptions: true,
    mcpReady: true,
    mcpServers: 2,
    mcpConnectedServers: 1,
  });

  const fallback = createGatewayCapabilitiesProvider({
    config: { DASHSCOPE_MODEL: 'fallback-model' },
    providerRouter: {
      resolve: () => {
        throw new Error('resolve failed');
      },
    },
    mcpManager: {
      getStatus: () => {
        throw new Error('mcp failed');
      },
    },
    logger,
  })();

  assert.deepEqual(fallback, {
    model: 'fallback-model',
    toolsSupport: 'unknown',
    capabilitySource: 'unknown',
    supportsTools: false,
    supportsStreamOptions: false,
    mcpReady: false,
    mcpServers: 0,
    mcpConnectedServers: 0,
  });
  assert.equal(warnings.length, 2);

  console.log('PASS gateway capability provider is isolated');
}

main();
