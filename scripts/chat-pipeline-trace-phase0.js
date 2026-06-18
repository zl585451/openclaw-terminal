'use strict';

const fs = require('fs');
const { createChatRequestHandler } = require('../oct-gateway/runtime/chatRequestHandler');
const ChatEngine = require('../oct-gateway/runtime/chatEngine');
const StreamController = require('../oct-gateway/runtime/streamController');
const { createStreamSmoother } = require('../oct-gateway/runtime/streamUtils');
const ToolLoop = require('../oct-gateway/runtime/toolLoop');
const agentRunner = require('../oct-gateway/agents/agent_runner');
const toolLoader = require('../oct-gateway/tool_loader');
const config = require('../oct-gateway/config');

function createRecorder(name) {
  const trace = {
    name,
    hits: new Set(),
    events: [],
    logs: [],
    result: null,
  };
  const hit = (label) => trace.hits.add(label);
  const recordEvent = (label, payload) => {
    trace.events.push({ label, payload });
  };
  const logger = {};
  for (const level of ['debug', 'info', 'warn', 'error']) {
    logger[level] = (message, meta) => {
      trace.logs.push({ level, message: String(message), meta: meta || null });
      if (/tool_calls/.test(String(message))) hit('toolLoop.log.tool_calls');
      if (/request done/.test(String(message))) hit('ai.log.request_done');
      if (/stream done/.test(String(message))) hit('chatEngine.log.stream_done');
    };
  }
  return { trace, hit, recordEvent, logger };
}

function createConnection(recorder) {
  const sent = [];
  return {
    sent,
    isOpen: () => true,
    send(payload) {
      sent.push(payload);
      classifyGatewayEvent(payload, recorder);
    },
    startThinkingPulse() {
      recorder.hit('connection.startThinkingPulse');
    },
    stopThinkingPulse() {
      recorder.hit('connection.stopThinkingPulse');
    },
    abortCurrent() {
      recorder.hit('connection.abortCurrent');
    },
    setAbort(handler) {
      recorder.hit(handler ? 'connection.setAbort' : 'connection.clearAbort');
      this.abortHandler = handler || null;
    },
  };
}

function classifyGatewayEvent(payload, recorder) {
  const event = payload?.event || payload?.type || 'unknown';
  const p = payload?.payload || {};
  if (event === 'chat' && p.seg) {
    recorder.hit('gateway.chat.seg');
    recorder.hit(`gateway.chat.seg.${p.seg.op}`);
    if (p.seg.type) recorder.hit(`gateway.chat.seg.type.${p.seg.type}`);
    recorder.recordEvent('chat.seg', p);
    return;
  }
  if (event === 'chat' && p.reset) {
    recorder.hit('gateway.chat.reset');
    recorder.recordEvent('chat.reset', p);
    return;
  }
  if (event === 'chat' && p.delta !== undefined) {
    recorder.hit('gateway.chat.delta');
    recorder.recordEvent('chat.delta', p);
    return;
  }
  if (event === 'chat' && p.done) {
    recorder.hit('gateway.chat.done');
    recorder.recordEvent('chat.done', p);
    return;
  }
  if (event === 'tool') {
    recorder.hit('gateway.tool');
    if (p.type) recorder.hit(`gateway.tool.${p.type}`);
    if (p.tool) recorder.hit(`gateway.tool.name.${p.tool}`);
    recorder.recordEvent('tool', p);
    return;
  }
  if (event === 'agent-phase') {
    recorder.hit('gateway.agentPhase');
    recorder.recordEvent('agent-phase', payload);
  }
}

function createEngine(streamChat, recorder) {
  return new ChatEngine({
    streamChat,
    session: { addMessage: () => recorder.hit('session.addMessage') },
    postProcessor: { process: () => recorder.hit('postProcessor.process') },
    sanitizeAssistantReply: (text) => String(text || '').trim(),
    normalizeAssistantMarkdown: (text) => text,
    streamControllerFactory: (emitter, pacingMs) => new StreamController({
      emitter,
      smootherFactory: createStreamSmoother,
      pacingMs: pacingMs ?? 1,
    }),
    logger: recorder.logger,
  });
}

function createHandler({ orchestratorResult, streamChat, recorder }) {
  const chatEngine = createEngine(streamChat, recorder);
  return createChatRequestHandler({
    orchestrator: {
      dispatch: async (message, sessionKey, sendToolEvent, sendAgentSegment, turnId) => {
        recorder.hit('orchestrator.dispatch');
        recorder.recordEvent('orchestrator.dispatch', { message, sessionKey, turnId });
        if (typeof orchestratorResult === 'function') {
          return orchestratorResult({ message, sessionKey, sendToolEvent, sendAgentSegment, turnId });
        }
        return orchestratorResult || {};
      },
    },
    contextBuilder: {
      build: async (args) => {
        recorder.hit('contextBuilder.build');
        recorder.recordEvent('contextBuilder.build', {
          userMessage: args.userMessage,
          hasSystemPrompt: !!args.systemPrompt,
        });
        return {
          messages: [
            { role: 'system', content: args.systemPrompt },
            { role: 'user', content: args.userMessage },
          ],
          history: [],
        };
      },
    },
    chatEngine,
    systemPromptReady: Promise.resolve('TRACE_SYSTEM_PROMPT'),
    session: { addMessage: () => recorder.hit('handler.session.addMessage') },
    normalizeAssistantText: (raw) => String(raw || '').trim(),
    sendCanvasTransportEvent: () => recorder.hit('sendCanvasTransportEvent'),
    logger: recorder.logger,
  });
}

async function runPureChat() {
  const recorder = createRecorder('pure chat');
  const streamChat = async (options) => {
    recorder.hit('ai.streamChat');
    options.onDelta('I am OCT. I can help with local tasks. Ask me for a concrete next step.');
    options.onDone('I am OCT. I can help with local tasks. Ask me for a concrete next step.', { total_tokens: 21 }, 'trace-model');
  };
  const handler = createHandler({ orchestratorResult: {}, streamChat, recorder });
  const connection = createConnection(recorder);
  await handler({ id: 'trace-pure', params: { sessionKey: 'trace', message: 'Describe yourself in three sentences.', pacingMs: 1 } }, connection);
  recorder.trace.result = summarizeTrace(recorder.trace);
  return recorder.trace;
}

async function runMainToolChat() {
  const recorder = createRecorder('main chat with search tool');
  const toolCall = {
    id: 'call_trace_search',
    type: 'function',
    function: {
      name: 'web_search',
      arguments: JSON.stringify({ query: 'AI news today June 18 2026' }),
    },
  };
  const toolLoop = new ToolLoop({
    toolLoader: {
      getDefinitions: () => [{
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Mock web search.',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      }],
      getToolMeta: () => ({ timeoutMs: 1000 }),
      executeTool: async (toolName, args) => {
        recorder.hit('toolLoader.executeTool');
        recorder.recordEvent('tool.execute', { toolName, args });
        return {
          success: true,
          searchQuality: { level: 'rich', resultCount: 2 },
          data: {
            results: [
              { title: 'AI policy update', url: 'https://example.test/policy', snippet: 'Policy news on June 18.' },
              { title: 'AI product launch', url: 'https://example.test/product', snippet: 'Product news on June 18.' },
            ],
          },
        };
      },
    },
    log: recorder.logger,
    streamChat: async (options) => {
      recorder.hit('ai.streamChat.continuation');
      options.onDelta('Final AI news brief: policy updates and product launches are the two strongest signals today.');
      options.onDone('Final AI news brief: policy updates and product launches are the two strongest signals today.', { total_tokens: 64 }, 'trace-model');
    },
    buildToolSignature: (calls) => calls.map((call) => `${call.function?.name}:${call.function?.arguments}`).join('|'),
    maxToolRounds: 4,
    maxIdenticalToolSignatures: 2,
  });

  const streamChat = async (options) => {
    recorder.hit('ai.streamChat.initial');
    const preamble = 'I will search current AI news first.';
    options.onDelta(preamble);
    await sleep(8);
    await toolLoop.handleToolCalls({
      toolCalls: [toolCall],
      toolRound: 0,
      toolSignatures: [],
      fullText: preamble,
      totalUsage: { total_tokens: 32 },
      responseModel: 'trace-model',
      assistantResponseMessage: { role: 'assistant', content: preamble, tool_calls: [toolCall] },
      truncatedMessages: options.messages,
      onDelta: options.onDelta,
      onDone: options.onDone,
      onError: options.onError,
      onToolEvent: options.onToolEvent,
      onRoundReset: options.onRoundReset,
      flushThinkAtEnd: () => recorder.hit('toolLoop.flushThinkAtEnd'),
      turnId: options.turnId,
      _omniRouteResolved: { provider: { id: 'trace' } },
      _disableExternalOmniRoute: true,
    });
  };

  const handler = createHandler({ orchestratorResult: {}, streamChat, recorder });
  const connection = createConnection(recorder);
  await handler({ id: 'trace-main-tool', params: { sessionKey: 'trace', message: 'Search today AI news and summarize it.', pacingMs: 1 } }, connection);
  recorder.trace.result = summarizeTrace(recorder.trace);
  return recorder.trace;
}

async function runBackgroundAgent() {
  const recorder = createRecorder('background researcher agent');
  const originalExecuteTool = toolLoader.executeTool;
  const originalGetDefinitions = toolLoader.getDefinitions;
  const originalFetch = globalThis.fetch;
  const originalGetProviderConfig = config.getProviderConfig;
  let fetchCount = 0;

  toolLoader.getDefinitions = () => [{
    type: 'function',
    function: {
      name: 'parallel_web_research',
      description: 'Mock parallel web research.',
      parameters: { type: 'object', properties: { queries: { type: 'array', items: { type: 'string' } } } },
    },
  }];
  toolLoader.executeTool = async (toolName, args, context) => {
    recorder.hit('agent.toolLoader.executeTool');
    recorder.recordEvent('agent.tool.execute', { toolName, args });
    context?.onToolEvent?.({ type: 'tool_note', tool: toolName, state: 'mocked' });
    return {
      success: true,
      findings: [
        { title: 'Research result A', date: '2026-06-18' },
        { title: 'Research result B', date: '2026-06-18' },
      ],
    };
  };
  config.getProviderConfig = () => ({
    id: 'trace',
    baseUrl: 'https://trace-provider.test/v1',
    apiKey: 'trace-key',
    model: 'trace-model',
  });
  globalThis.fetch = async () => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return jsonResponse({
        choices: [{
          message: {
            role: 'assistant',
            content: 'I will research several angles first.',
            tool_calls: [{
              id: 'agent_call_research',
              type: 'function',
              function: {
                name: 'parallel_web_research',
                arguments: JSON.stringify({ queries: ['AI news June 18', 'AI policy June 18'] }),
              },
            }],
          },
          finish_reason: 'tool_calls',
        }],
        usage: { total_tokens: 20 },
      });
    }
    if (fetchCount === 2) {
      return jsonResponse({
        choices: [{
          message: { role: 'assistant', content: 'I should check a few more angles before concluding.' },
          finish_reason: 'stop',
        }],
        usage: { total_tokens: 12 },
      });
    }
    return jsonResponse({
      choices: [{
        message: {
          role: 'assistant',
          content: [
            'Final research report.',
            '',
            '1. The trace has usable current-date evidence from mocked research results.',
            '2. The agent short-answer guard forced this report instead of accepting a transition sentence.',
            '3. The final segment is emitted after the tool_use segment, so the frontend can render inline tool activity before the final answer.',
            '4. This paragraph is intentionally long enough to pass the existing agent final-answer guard.',
          ].join('\n'),
        },
        finish_reason: 'stop',
      }],
      usage: { total_tokens: 90 },
    });
  };

  try {
    const result = await agentRunner.runAgent({
      agent: {
        name: 'Researcher',
        model: 'trace-model',
        systemPrompt: 'You are a trace researcher.',
        allowedTools: ['parallel_web_research'],
        maxTurns: 4,
        timeoutMs: 5000,
        buildExtraContext: async () => '',
        formatUserMessage: () => 'Research today AI news and summarize it.',
      },
      task: {
        taskId: 'trace-agent-task',
        instruction: 'Research today AI news and summarize it.',
      },
      turnId: 'trace-agent',
      onAgentEvent: (event) => {
        recorder.hit('agentRunner.onAgentEvent');
        if (event?.type) recorder.hit(`agentRunner.event.${event.type}`);
        recorder.recordEvent('agent.event', event);
      },
      onSegment: (seg) => {
        recorder.hit('agentRunner.onSegment');
        recorder.hit(`agentRunner.seg.${seg.op}`);
        if (seg.type) recorder.hit(`agentRunner.seg.type.${seg.type}`);
        recorder.recordEvent('agent.seg', seg);
      },
    });
    recorder.trace.result = {
      ...summarizeTrace(recorder.trace),
      fetchCount,
      resultStatus: result.status,
      resultLength: result.result.length,
      turnsUsed: result.turnsUsed,
    };
  } finally {
    toolLoader.executeTool = originalExecuteTool;
    toolLoader.getDefinitions = originalGetDefinitions;
    globalThis.fetch = originalFetch;
    config.getProviderConfig = originalGetProviderConfig;
  }

  return recorder.trace;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function summarizeTrace(trace) {
  const eventCounts = trace.events.reduce((acc, event) => {
    acc[event.label] = (acc[event.label] || 0) + 1;
    return acc;
  }, {});
  return {
    hits: Array.from(trace.hits).sort(),
    eventCounts,
    logCount: trace.logs.length,
  };
}

async function main() {
  const originalAppendFileSync = fs.appendFileSync;
  fs.appendFileSync = (file, ...args) => {
    if (String(file).endsWith('tool_results.jsonl')) return;
    return originalAppendFileSync.call(fs, file, ...args);
  };
  try {
    const traces = [
      await runPureChat(),
      await runMainToolChat(),
      await runBackgroundAgent(),
    ];
    const output = traces.map((trace) => ({
      name: trace.name,
      result: trace.result,
      keyEvents: trace.events.slice(0, 12),
      logs: trace.logs.slice(0, 12),
    }));
    console.log(JSON.stringify(output, null, 2));
  } finally {
    fs.appendFileSync = originalAppendFileSync;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
