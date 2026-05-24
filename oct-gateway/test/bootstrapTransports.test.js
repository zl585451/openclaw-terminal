'use strict';

const assert = require('node:assert');
const { startGatewayTransports } = require('../bootstrap/transports');

class FakeWsTransport {
  constructor(options) {
    this.options = options;
    this.closed = false;
  }

  start() {
    this.started = true;
    FakeWsTransport.last = this;
    return this;
  }

  close(callback) {
    this.closed = true;
    if (callback) callback();
  }
}

class FakeHttpTransport {
  constructor(options) {
    this.options = options;
    this.closed = false;
  }

  start() {
    this.started = true;
    FakeHttpTransport.last = this;
    return this;
  }

  close() {
    this.closed = true;
  }
}

function main() {
  let closed = false;
  const logger = { info: () => {}, warn: () => {}, error: () => {} };
  const modelProvider = () => 'model';
  const capabilityProvider = () => ({ supportsTools: true });
  const authTokenProvider = () => 'token';
  const onAuthenticatedMessage = () => {};
  const onAuthenticatedConnection = () => {};
  const onConnectionClose = () => {};
  const onHttpRequest = () => {};

  const transports = startGatewayTransports({
    port: 30000,
    logger,
    modelProvider,
    capabilityProvider,
    authTokenProvider,
    onAuthenticatedMessage,
    onAuthenticatedConnection,
    onConnectionClose,
    onHttpRequest,
    WsTransport: FakeWsTransport,
    HttpTransport: FakeHttpTransport,
  });

  assert.equal(transports.httpPort, 30001);
  assert.equal(FakeWsTransport.last.started, true);
  assert.equal(FakeWsTransport.last.options.port, 30000);
  assert.equal(FakeWsTransport.last.options.logger, logger);
  assert.equal(FakeWsTransport.last.options.modelProvider, modelProvider);
  assert.equal(FakeWsTransport.last.options.capabilityProvider, capabilityProvider);
  assert.equal(FakeWsTransport.last.options.authTokenProvider, authTokenProvider);
  assert.equal(FakeWsTransport.last.options.onAuthenticatedMessage, onAuthenticatedMessage);
  assert.equal(FakeWsTransport.last.options.onAuthenticatedConnection, onAuthenticatedConnection);
  assert.equal(FakeWsTransport.last.options.onConnectionClose, onConnectionClose);

  assert.equal(FakeHttpTransport.last.started, true);
  assert.equal(FakeHttpTransport.last.options.port, 30001);
  assert.equal(FakeHttpTransport.last.options.logger, logger);
  assert.equal(FakeHttpTransport.last.options.onRequest, onHttpRequest);

  transports.close(() => { closed = true; });
  assert.equal(FakeHttpTransport.last.closed, true);
  assert.equal(FakeWsTransport.last.closed, true);
  assert.equal(closed, true);

  console.log('PASS bootstrap transport startup is isolated');
}

main();
