'use strict';

const assert = require('node:assert');
const MessageRouter = require('../gateway/router');
const { safeParseMessage, serializeMessage } = require('../transport/protocol');

function createConnection() {
  const sent = [];
  return {
    sent,
    abortCalls: 0,
    stopThinkingCalls: 0,
    abortCurrent() {
      this.abortCalls += 1;
    },
    setAbort(value) {
      this.abortValue = value;
    },
    stopThinkingPulse() {
      this.stopThinkingCalls += 1;
    },
    send(payload) {
      sent.push(payload);
    },
  };
}

async function main() {
  let slashCommand = null;
  let chatRequest = null;
  const router = new MessageRouter({
    slashHandler: {
      handle: async (command, request, connection) => {
        slashCommand = command;
        connection.send({ type: 'event', event: 'chat', payload: { text: 'help text', done: true } });
      },
    },
    sessionManager: {
      listSessions: () => ['main', 'research'],
    },
    chatHandler: async (request, connection) => {
      chatRequest = request;
      connection.send({ type: 'event', event: 'chat', payload: { text: 'assistant text', done: true } });
    },
  });

  {
    const connection = createConnection();
    const handled = await router.handleRequest({
      type: 'req',
      id: 'slash-1',
      method: 'chat.send',
      params: { message: '/help   ', sessionKey: 'main' },
    }, connection);

    assert.equal(handled, true);
    assert.equal(slashCommand, '/help');
    assert.equal(connection.abortCalls, 1);
    assert.equal(connection.abortValue, null);
    assert.equal(connection.stopThinkingCalls, 1);
    assert.deepEqual(connection.sent[0], { type: 'event', event: 'agent-phase', phase: 'idle' });
    assert.equal(connection.sent[1].event, 'chat');
  }

  {
    const connection = createConnection();
    const request = {
      type: 'req',
      id: 'chat-1',
      method: 'chat.send',
      params: { message: 'hello', sessionKey: 'main' },
    };
    const handled = await router.handleRequest(request, connection);

    assert.equal(handled, true);
    assert.equal(chatRequest, request);
    assert.equal(connection.sent.length, 1);
    assert.equal(connection.sent[0].payload.text, 'assistant text');
  }

  {
    const connection = createConnection();
    const handled = await router.handleRequest({
      type: 'req',
      id: 'cancel-1',
      method: 'chat.cancel',
      params: { reason: 'user_stop' },
    }, connection);

    assert.equal(handled, true);
    assert.equal(connection.abortCalls, 1);
    assert.equal(connection.abortValue, null);
    assert.equal(connection.stopThinkingCalls, 1);
    assert.deepEqual(connection.sent[0], { type: 'event', event: 'agent-phase', phase: 'idle' });
    assert.deepEqual(connection.sent[1], {
      type: 'res',
      id: 'cancel-1',
      ok: true,
      payload: { cancelled: true },
    });
  }

  {
    const connection = createConnection();
    const handled = await router.handleRequest({
      type: 'req',
      id: 'sessions-1',
      method: 'sessions.list',
      params: {},
    }, connection);

    assert.equal(handled, true);
    assert.deepEqual(connection.sent[0], {
      type: 'res',
      id: 'sessions-1',
      ok: true,
      payload: { sessions: ['main', 'research'] },
    });
  }

  {
    const connection = createConnection();
    const handled = await router.handleRequest({
      type: 'req',
      id: 'unknown-1',
      method: 'legacy.method',
      params: {},
    }, connection);

    assert.equal(handled, true);
    assert.equal(connection.sent[0].ok, false);
    assert.match(connection.sent[0].error.message, /Unknown method: legacy\.method/);
  }

  assert.equal(await router.handleRequest({ type: 'event', event: 'chat' }, createConnection()), false);

  const toolPayload = {
    type: 'event',
    event: 'tool',
    payload: { type: 'tool_result', tool: 'read_file', callId: 'call-1', state: 'done' },
  };
  assert.deepEqual(safeParseMessage(Buffer.from(serializeMessage(toolPayload))), toolPayload);
  assert.equal(safeParseMessage(Buffer.from('{not-json')), null);

  console.log('PASS MessageRouter and transport protocol regressions are covered');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
