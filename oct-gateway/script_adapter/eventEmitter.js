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

module.exports = {
  createScriptAdapterEmitter,
};
