function createConnectionAdapter({
  clientId,
  ws,
  serializeMessage,
  setAbort,
  abortCurrent,
  startThinkingPulse,
  stopThinkingPulse,
}) {
  return {
    clientId,
    ws,
    isOpen: () => ws.readyState === ws.OPEN,
    send: (payload) => {
      if (ws.readyState !== ws.OPEN) return;
      ws.send(serializeMessage(payload));
    },
    setAbort,
    abortCurrent,
    startThinkingPulse,
    stopThinkingPulse,
  };
}

module.exports = {
  createConnectionAdapter,
};
