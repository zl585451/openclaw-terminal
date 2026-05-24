'use strict';

function readEnabled(value, defaultEnabled = true) {
  if (value === false) return false;
  if (value && typeof value === 'object' && value.enabled === false) return false;
  return defaultEnabled;
}

function safeCount(getter) {
  try {
    const value = getter();
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}

function createOptionalCapabilitiesSnapshot({
  config = {},
  toolLoader,
  mcpManager,
} = {}) {
  return function getOptionalCapabilities() {
    const toolCount = safeCount(() => toolLoader?.getDefinitions?.());
    const mcpStatus = (() => {
      try { return mcpManager?.getStatus?.() || {}; } catch { return {}; }
    })();
    const mcpServers = Object.keys(mcpStatus).length;
    const mcpConnectedServers = Object.values(mcpStatus).filter((item) => item?.status === 'connected').length;

    return {
      version: '2026-05-24',
      packages: {
        tools: {
          status: toolCount > 0 ? 'available' : 'unavailable',
          loadedCount: toolCount,
          lazyLoadCandidate: true,
          entrypoints: ['oct-gateway/tool_loader.js', 'oct-gateway/runtime/toolLoop.js'],
        },
        mcp_tools: {
          status: mcpConnectedServers > 0 ? 'available' : (mcpServers > 0 ? 'unavailable' : 'disabled'),
          loadedCount: mcpConnectedServers,
          serverCount: mcpServers,
          lazyLoadCandidate: true,
          entrypoints: ['oct-gateway/mcp/manager.js'],
        },
        script_adapter: {
          status: readEnabled(config.scriptAdapter, true) ? 'enabled' : 'disabled',
          lazyLoadCandidate: true,
          entrypoints: ['oct-gateway/script_adapter/messageHandler.js', 'src/modules/script-adapter'],
        },
        image_analysis: {
          status: readEnabled(config.image_analysis, true) ? 'enabled' : 'disabled',
          lazyLoadCandidate: true,
          entrypoints: ['oct-gateway/services/imageService.js', 'oct-gateway/image_analyzer.js'],
        },
        memory: {
          status: readEnabled(config.memory, true) ? 'enabled' : 'disabled',
          lazyLoadCandidate: false,
          entrypoints: ['oct-gateway/memory.js', 'oct-gateway/bootstrap/memoryJobs.js'],
        },
        ai_library: {
          status: readEnabled(config.ai_library, true) ? 'enabled' : 'disabled',
          lazyLoadCandidate: true,
          entrypoints: ['oct-gateway/tools/ai_library.js'],
        },
      },
    };
  };
}

module.exports = {
  createOptionalCapabilitiesSnapshot,
  _internals: {
    readEnabled,
    safeCount,
  },
};

