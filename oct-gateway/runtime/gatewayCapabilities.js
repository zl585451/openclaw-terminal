'use strict';

function createGatewayCapabilitiesProvider({
  config,
  providerRouter,
  mcpManager,
  logger,
}) {
  return function getGatewayCapabilities(modelId = config.DASHSCOPE_MODEL) {
    let caps = {
      supportsTools: false,
      supportsStreamOptions: false,
    };
    try {
      caps = providerRouter.resolve(modelId).caps || caps;
    } catch (e) {
      logger?.warn?.('resolve model caps failed, using defaults', { modelId, error: e?.message || String(e) });
    }

    let mcpStatus = {};
    try {
      mcpStatus = mcpManager.getStatus() || {};
    } catch (e) {
      logger?.warn?.('read mcp status failed, using empty status', { error: e?.message || String(e) });
    }
    const mcpServers = Object.keys(mcpStatus).length;
    const mcpConnectedServers = Object.values(mcpStatus).filter((item) => item?.status === 'connected').length;

    return {
      model: modelId,
      toolsSupport: caps.toolsSupport || (caps.supportsTools ? 'supported' : 'unknown'),
      capabilitySource: caps.capabilitySource || 'unknown',
      supportsTools: !!caps.supportsTools,
      supportsStreamOptions: !!caps.supportsStreamOptions,
      mcpReady: mcpConnectedServers > 0,
      mcpServers,
      mcpConnectedServers,
    };
  };
}

module.exports = {
  createGatewayCapabilitiesProvider,
};
