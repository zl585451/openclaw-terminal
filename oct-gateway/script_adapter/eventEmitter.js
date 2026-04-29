const connectionRegistry = require('./connectionRegistry');

function createScriptAdapterEmitter(connection, taskId) {
  return (event, payload = {}) => {
    if (!connection?.isOpen?.()) return;
    connection.send({
      type: 'event',
      event: 'script-adapter',
      payload: {
        event,
        taskId,
        ...payload,
      },
    });
  };
}

function createBatchScriptAdapterEmitter(batchId) {
  return (event, payload = {}) => {
    connectionRegistry.broadcast(batchId, {
      type: 'event',
      event: 'script-adapter',
      payload: {
        event,
        batchId,
        ...payload,
      },
    });
  };
}

module.exports = {
  createScriptAdapterEmitter,
  createBatchScriptAdapterEmitter,
};
