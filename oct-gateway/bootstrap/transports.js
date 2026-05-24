'use strict';

const DefaultWsTransport = require('../transport/ws');
const DefaultHttpTransport = require('../transport/http');

function startGatewayTransports({
  port,
  logger,
  modelProvider,
  capabilityProvider,
  authTokenProvider,
  onAuthenticatedMessage,
  onAuthenticatedConnection,
  onConnectionClose,
  onHttpRequest,
  WsTransport = DefaultWsTransport,
  HttpTransport = DefaultHttpTransport,
}) {
  const httpPort = Number(port) + 1;

  const wsTransport = new WsTransport({
    port,
    logger,
    modelProvider,
    capabilityProvider,
    authTokenProvider,
    onAuthenticatedMessage,
    onAuthenticatedConnection,
    onConnectionClose,
  }).start();

  const httpTransport = new HttpTransport({
    port: httpPort,
    logger,
    onRequest: onHttpRequest,
  }).start();

  return {
    wsTransport,
    httpTransport,
    httpPort,
    close(callback) {
      httpTransport?.close();
      wsTransport?.close(callback);
    },
  };
}

module.exports = {
  startGatewayTransports,
};
