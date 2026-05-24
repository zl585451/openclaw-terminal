function isScriptAdapterRequest(msg) {
  return msg?.type === 'req' && String(msg?.method || '').startsWith('scriptAdapter.');
}

function createLazyScriptAdapterRuntime({ loadRuntime, logger } = {}) {
  if (typeof loadRuntime !== 'function') {
    throw new TypeError('loadRuntime must be a function');
  }

  let runtime = null;

  function getRuntime() {
    if (!runtime) {
      runtime = loadRuntime();
      logger?.info?.('Script adapter runtime loaded lazily');
    }
    return runtime;
  }

  getRuntime.isLoaded = () => Boolean(runtime);
  return getRuntime;
}

function createLazyScriptAdapterMessageHandler({ getRuntime, logger } = {}) {
  if (typeof getRuntime !== 'function') {
    throw new TypeError('getRuntime must be a function');
  }

  return async function handleLazyScriptAdapterMessage(msg, connection) {
    if (!isScriptAdapterRequest(msg)) {
      return false;
    }

    try {
      const runtime = getRuntime();
      return runtime.handleMessage(msg, connection);
    } catch (error) {
      logger?.error?.('Script adapter runtime failed to load', {
        error: error?.message || String(error),
      });
      connection?.send?.({
        type: 'res',
        id: msg.id,
        ok: false,
        method: msg.method,
        payload: undefined,
        error: { message: 'script adapter runtime failed to load' },
      });
      return true;
    }
  };
}

module.exports = {
  createLazyScriptAdapterMessageHandler,
  createLazyScriptAdapterRuntime,
  _internals: {
    isScriptAdapterRequest,
  },
};
