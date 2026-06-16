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
          reply: [
            '```render_blocks',
            '{"version":"3.0","blocks":[{"type":"markdown","content":"final reply"},{"type":"pills","items":[{"label":"继续","value":"继续"},{"label":"停止","value":"停止"}]}]}',
            '```',
          ].join('\n'),
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
    text: '```render_blocks\n{"version":"3.0","blocks":[{"type":"markdown","content":"final reply"},{"type":"pills","items":[{"label":"继续","value":"继续"},{"label":"停止","value":"停止"}]}]}\n```',
    state: 'done',
    done: true,
    turnId: 'done-turn',
    renderBlocks: [
      { type: 'markdown', content: 'final reply' },
      {
        type: 'pills',
        items: [
          { label: '继续' },
          { label: '停止' },
        ],
      },
    ],
    renderProtocol: {
      version: '3.0',
      source: 'render_blocks',
      errors: [],
    },
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
          status: 'completed',
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

async function testAgentClarifyPause() {
  const connection = createConnection();
  let contextBuildCalled = false;
  let chatExecuteCalled = false;
  const messages = [];
  const handler = createChatRequestHandler({
    orchestrator: {
      dispatch: async (_message, _sessionKey, sendToolEvent) => {
        // Agent 发出 clarify_open 事件
        sendToolEvent({
          type: 'clarify_open',
          payload: {
            spec: {
              title: '开始写作前',
              fields: [{ id: 'genre', label: '想写什么类型？', type: 'single', options: ['小说', '专栏'] }],
            },
          },
        });
        return {
          agent: 'Writer',
          agentResult: {
            status: 'waiting_user_reply',
            result: '',
            turnsUsed: 1,
            tokensUsed: 5,
          },
        };
      },
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
    session: { addMessage: (...args) => messages.push(args) },
    normalizeAssistantText: (raw) => String(raw).trim(),
    sendCanvasTransportEvent: () => {},
    logger: createLogger(),
  });

  await handler({ id: 'clarify-turn', params: { sessionKey: 's1', message: '帮我写一篇文案' } }, connection);

  // 不得落入 AMY
  assert.equal(contextBuildCalled, false, 'contextBuilder should NOT be called on clarify pause');
  assert.equal(chatExecuteCalled, false, 'chatEngine should NOT be called on clarify pause');

  // clarify 事件已推送
  const clarifyEvent = connection.sent.find((item) => item.event === 'clarify');
  assert.ok(clarifyEvent, 'clarify event must be sent');

  // agent-phase idle 已推送
  assert.ok(connection.sent.some((item) => item.event === 'agent-phase' && item.phase === 'idle'),
    'agent-phase idle must be sent');

  // chat done 已推送（text 为空，供前端 shouldSuppress 生效）
  const chatDone = connection.sent.find((item) => item.event === 'chat' && item.payload?.done === true);
  assert.ok(chatDone, 'chat done must be sent');
  assert.equal(chatDone.payload.text, '', 'chat done text must be empty so frontend can suppress');

  // session 仅存用户消息，不存 assistant
  assert.deepEqual(messages, [['s1', 'user', '帮我写一篇文案']]);
}

async function testClarifyEventForwarding() {
  const connection = createConnection();
  const handler = createChatRequestHandler({
    orchestrator: {
      dispatch: async () => ({ canvasIntent: { shouldUseCanvas: false } }),
    },
    contextBuilder: {
      build: async () => ({
        messages: [{ role: 'user', content: 'hello' }],
        history: [],
      }),
    },
    chatEngine: {
      execute: async (_request, handlers) => {
        handlers.onStart({ cancel() {} });
        handlers.onToolEvent({
          type: 'clarify_open',
          payload: {
            spec: {
              title: '开始写作前',
              fields: [
                { id: 'genre', label: '想写什么类型？', type: 'single', options: ['小说', '专栏'] },
              ],
            },
          },
        });
        handlers.onBeforeDone();
        handlers.onDone({
          reply: '',
          usage: { total_tokens: 3 },
          model: 'test-model',
          turnId: 'clarify-turn',
        });
      },
    },
    systemPromptReady: Promise.resolve('system prompt'),
    session: { addMessage() {} },
    normalizeAssistantText: (raw) => String(raw).trim(),
    sendCanvasTransportEvent: () => {},
    logger: createLogger(),
  });

  await handler({ id: 'turn-clarify', params: { sessionKey: 's1', message: 'hello' } }, connection);

  const clarifyEvent = connection.sent.find((item) => item.event === 'clarify');
  assert.deepEqual(clarifyEvent, {
    type: 'event',
    event: 'clarify',
    payload: {
      spec: {
        title: '开始写作前',
        fields: [
          { id: 'genre', label: '想写什么类型？', type: 'single', options: ['小说', '专栏'] },
        ],
      },
    },
  });
}

async function main() {
  await testNormalChatLifecycle();
  await testAgentShortcut();
  await testAgentClarifyPause();
  await testClarifyEventForwarding();
  console.log('PASS chat request handler lifecycle is isolated');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
