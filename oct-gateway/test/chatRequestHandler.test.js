'use strict';

const assert = require('node:assert');
const { createChatRequestHandler } = require('../runtime/chatRequestHandler');

function createConnection() {
  const sent = [];
  return {
    sent,
    startPulseMs: null,
    abortCalls: 0,
    stopPulseCalls: 0,
    abortHandler: undefined,
    isOpen: () => true,
    send(payload) {
      sent.push(payload);
    },
    startThinkingPulse(ms) {
      this.startPulseMs = ms;
    },
    stopThinkingPulse() {
      this.stopPulseCalls += 1;
    },
    abortCurrent() {
      this.abortCalls += 1;
    },
    setAbort(handler) {
      this.abortHandler = handler;
    },
  };
}

function createLogger() {
  return {
    info() {},
    error() {},
    warn() {},
  };
}

async function testNormalChatLifecycle() {
  const connection = createConnection();
  const canvasEvents = [];
  let dispatchArgs = null;
  let buildArgs = null;
  let executeArgs = null;
  const handler = createChatRequestHandler({
    orchestrator: {
      dispatch: async (message, sessionKey, sendToolEvent) => {
        dispatchArgs = { message, sessionKey, sendToolEvent };
        return { canvasIntent: { shouldUseCanvas: true } };
      },
    },
    contextBuilder: {
      build: async (args) => {
        buildArgs = args;
        return {
          messages: [{ role: 'user', content: 'hello' }],
          history: [{ role: 'assistant', content: 'previous reply' }],
        };
      },
    },
    chatEngine: {
      execute: async (request, handlers) => {
        executeArgs = request;
        handlers.onStart({ cancel() {} });
        handlers.onDelta('hi');
        handlers.onToolEvent({ type: 'tool_call', tool: 'read_file' });
        handlers.onToolEvent({ type: 'tool_result', tool: 'read_file' });
        handlers.onToolEvent({ type: 'workbench', action: 'open', payload: { id: 'canvas-1' } });
        handlers.onBeforeDone();
        handlers.onDone({
          reply: '  final reply  ',
          usage: { total_tokens: 7 },
          model: 'test-model',
          turnId: 'done-turn',
        });
      },
    },
    systemPromptReady: Promise.resolve('system prompt'),
    session: { addMessage() {} },
    normalizeAssistantText: (raw) => String(raw).trim(),
    sendCanvasTransportEvent: (conn, action, payload, target) => {
      canvasEvents.push({ conn, action, payload, target });
    },
    logger: createLogger(),
  });

  await handler({
    id: 'turn-1',
    params: {
      sessionKey: 'main',
      message: 'hello',
      attachments: [{ name: 'a.png' }],
      pacingMs: 9,
      projectContext: { root: 'repo' },
    },
  }, connection);

  assert.deepEqual(dispatchArgs, {
    message: 'hello',
    sessionKey: 'main',
    sendToolEvent: dispatchArgs.sendToolEvent,
  });
  assert.equal(buildArgs.systemPrompt, 'system prompt');
  assert.equal(buildArgs.orchestratorResult.canvasIntent.shouldUseCanvas, true);
  assert.deepEqual(buildArgs.attachments, [{ name: 'a.png' }]);
  assert.deepEqual(buildArgs.projectContext, { root: 'repo' });
  assert.equal(executeArgs.turnId, 'turn-1');
  assert.equal(executeArgs.prevAssistantReply, 'previous reply');
  assert.deepEqual(executeArgs.toolChoice, { type: 'function', function: { name: 'canvas' } });
  assert.deepEqual(executeArgs.options, { pacingMs: 9 });
  assert.equal(connection.startPulseMs, 8000);
  assert.equal(connection.abortCalls, 1);
  assert.equal(connection.stopPulseCalls, 1);
  assert.equal(connection.sent[0].event, 'agent-phase');
  assert.deepEqual(connection.sent.find((item) => item.event === 'chat' && item.payload.delta === 'hi').payload, {
    delta: 'hi',
    state: 'delta',
    done: false,
    turnId: 'turn-1',
  });
  assert(connection.sent.some((item) => item.event === 'tool' && item.payload.type === 'tool_call'));
  assert(connection.sent.some((item) => item.event === 'agent-phase' && item.phase === 'tool_executing'));
  assert(connection.sent.some((item) => item.event === 'agent-phase' && item.phase === 'thinking'));
  assert.deepEqual(canvasEvents[0], {
    conn: connection,
    action: 'open',
    payload: { id: 'canvas-1' },
    target: 'workbench',
  });
  const done = connection.sent.find((item) => item.event === 'chat' && item.payload.done === true);
  assert.deepEqual(done.payload, {
    text: 'final reply',
    state: 'done',
    done: true,
    turnId: 'done-turn',
    usage: { total_tokens: 7 },
    model: 'test-model',
  });
  assert(connection.sent.some((item) => item.event === 'agent-phase' && item.phase === 'idle'));
}

async function testAgentShortcut() {
  const connection = createConnection();
  const messages = [];
  let contextBuildCalled = false;
  let chatExecuteCalled = false;
  const handler = createChatRequestHandler({
    orchestrator: {
      dispatch: async () => ({
        agent: 'Researcher',
        agentResult: {
          result: '  agent answer  ',
          turnsUsed: 2,
          tokensUsed: 42,
        },
      }),
    },
    contextBuilder: {
      build: async () => {
        contextBuildCalled = true;
        return { messages: [], history: [] };
      },
    },
    chatEngine: {
      execute: async () => {
        chatExecuteCalled = true;
      },
    },
    systemPromptReady: Promise.resolve('system prompt'),
    session: {
      addMessage: (...args) => messages.push(args),
    },
    normalizeAssistantText: (raw) => String(raw).trim(),
    sendCanvasTransportEvent: () => {},
    logger: createLogger(),
  });

  await handler({ id: 'agent-turn', params: { sessionKey: 's1', message: 'run agent' } }, connection);

  assert.equal(contextBuildCalled, false);
  assert.equal(chatExecuteCalled, false);
  assert.deepEqual(messages, [
    ['s1', 'user', 'run agent'],
    ['s1', 'assistant', 'agent answer'],
  ]);
  assert.deepEqual(connection.sent[0], { type: 'event', event: 'agent-phase', phase: 'idle' });
  assert.deepEqual(connection.sent[1], {
    type: 'event',
    event: 'tool',
    payload: { type: 'agent_status', agent: 'Researcher', status: 'done', taskId: 'orch_agent-turn' },
  });
  assert.deepEqual(connection.sent[2], {
    type: 'event',
    event: 'chat',
    payload: {
      text: 'agent answer',
      state: 'done',
      done: true,
      turnId: 'agent-turn',
      agentName: 'Researcher',
      tokensUsed: 42,
    },
  });
}

async function main() {
  await testNormalChatLifecycle();
  await testAgentShortcut();
  console.log('PASS chat request handler lifecycle is isolated');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
