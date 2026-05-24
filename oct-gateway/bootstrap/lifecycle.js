function registerTaskBoardBroadcast({ tools, transports }) {
  if (!tools?.setOnTaskBoardUpdate || !transports?.wsTransport?.broadcast) {
    return false;
  }

  tools.setOnTaskBoardUpdate(() => {
    transports.wsTransport.broadcast({ type: 'event', event: 'task-board-update' });
  });
  return true;
}

function registerGatewayShutdown({ processRef = process, logger, stopScheduler, transports }) {
  const shutdown = () => {
    logger?.info?.('shutting down');
    stopScheduler?.();
    if (transports?.close) {
      transports.close(() => processRef.exit(0));
      return;
    }
    processRef.exit(0);
  };

  processRef.on('SIGINT', shutdown);
  processRef.on('SIGTERM', shutdown);

  return () => {
    processRef.off?.('SIGINT', shutdown);
    processRef.off?.('SIGTERM', shutdown);
  };
}

module.exports = {
  registerTaskBoardBroadcast,
  registerGatewayShutdown,
};
