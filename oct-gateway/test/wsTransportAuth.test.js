'use strict';

const assert = require('node:assert');
const EventEmitter = require('node:events');
const WsTransport = require('../transport/ws');

class FakeWebSocket extends EventEmitter {
  constructor() {
    super();
    this.OPEN = 1;
    this.readyState = 1;
    this.sent = [];
    this.pings = 0;
  }

  send(message) {
    this.sent.push(JSON.parse(message));
  }

  ping() {
    this.pings += 1;
  }

  close(code, reason) {
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = 3;
    this.emit('close');
  }
}

async function flushAsyncHandlers() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function main() {
  const received = [];
  const authenticatedConnections = [];
  const closedConnections = [];
  const ws = new FakeWebSocket();
  const transport = new WsTransport({
    port: 18789,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    modelProvider: () => 'test-model',
    capabilityProvider: () => ({ toolsSupport: 'supported' }),
    authTokenProvider: () => 'expected-token',
    onAuthenticatedConnection: (connection) => authenticatedConnections.push(connection),
    onAuthenticatedMessage: async (message, connection) => {
      received.push(message);
      connection.send({ type: 'res', id: message.id, ok: true, payload: { echoed: message.method } });
    },
    onConnectionClose: (connection) => closedConnections.push(connection),
  });

  transport._handleConnection(ws);
  assert.equal(ws.sent[0].type, 'event');
  assert.equal(ws.sent[0].event, 'connect.challenge');
  assert.ok(ws.sent[0].payload.nonce);

  ws.emit('message', Buffer.from(JSON.stringify({
    type: 'req',
    id: 'pre-auth',
    method: 'chat.send',
    params: { message: 'hello' },
  })));
  await flushAsyncHandlers();
  assert.equal(ws.sent.at(-1).ok, false);
  assert.equal(ws.sent.at(-1).error.message, 'Not authenticated');

  ws.emit('message', Buffer.from(JSON.stringify({
    type: 'req',
    id: 'bad-connect',
    method: 'connect',
    params: { token: 'wrong-token' },
  })));
  await flushAsyncHandlers();
  assert.equal(ws.sent.at(-1).ok, false);
  assert.equal(ws.sent.at(-1).error.message, 'Invalid token');

  ws.emit('message', Buffer.from(JSON.stringify({
    type: 'req',
    id: 'connect-1',
    method: 'connect',
    params: { token: 'expected-token', sessionKey: 'main' },
  })));
  await flushAsyncHandlers();
  assert.equal(ws.sent.at(-1).ok, true);
  assert.equal(ws.sent.at(-1).payload.model, 'test-model');
  assert.deepEqual(ws.sent.at(-1).payload.capabilities, { toolsSupport: 'supported' });
  assert.equal(authenticatedConnections.length, 1);

  ws.emit('message', Buffer.from(JSON.stringify({
    type: 'req',
    id: 'chat-1',
    method: 'chat.send',
    params: { message: 'hello' },
  })));
  await flushAsyncHandlers();
  assert.equal(received.length, 1);
  assert.equal(received[0].method, 'chat.send');
  assert.equal(ws.sent.at(-1).payload.echoed, 'chat.send');

  ws.close(1000, 'done');
  assert.equal(closedConnections.length, 1);

  console.log('PASS WsTransport auth and authenticated dispatch regressions are covered');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
