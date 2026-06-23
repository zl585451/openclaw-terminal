'use strict';

/**
 * streamChatRaw 端到端冒烟测试（不打真实 API）。
 *
 * 目的：用假的 SSE 流驱动真实 streamChatRaw，守住三条主路径的回归：
 *   1. 正常文本回复 —— 不丢字、不重复、onDone 收口
 *   2. 工具调用流   —— finish_reason=tool_calls 正确路由到工具分发（事件收口）
 *   3. 流中断/abort —— 已输出内容时优雅截断，不报错刷屏、不吞回复
 *
 * 注入手法（不引入新依赖、不改产线代码）：
 *   - 在 require('../ai') 之前先 require('../runtime/llmTransport') 并把
 *     fetchWithRetry 替换为可变间接层 currentFetchImpl —— ai.js 在加载时解构到的
 *     正是这个间接层，故每个用例可独立设置假响应。
 *   - ToolLoop.prototype.handleToolCalls 换成 spy，避免真实工具执行与续轮。
 *   - 通过 streamChat 的 _omniRouteResolved 入参传入完整假候选，绕过 provider 解析。
 */
const { describe, it, expect, beforeEach } = globalThis;

// ── 先打补丁，再加载 ai.js（顺序关键）────────────────────────────────
const llmTransport = require('../runtime/llmTransport');
let currentFetchImpl = async () => {
  throw new Error('currentFetchImpl 未设置');
};
llmTransport.fetchWithRetry = (...args) => currentFetchImpl(...args);
llmTransport.buildChatHeaders = () => ({});

const ToolLoop = require('../runtime/toolLoop');
let handleToolCallsSpy = null;
ToolLoop.prototype.handleToolCalls = async (arg) => {
  if (handleToolCallsSpy) return handleToolCallsSpy(arg);
};

const toolLoader = require('../tool_loader');
toolLoader.getDefinitions = () => [];

const ai = require('../ai');
// ────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

/** 构造一个 ok 的假流式响应；chunks 为若干 SSE 文本块。 */
function sseResponse(chunks) {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield enc.encode(c);
      },
    },
  };
}

/** 先吐若干块、再抛错的假响应（模拟网络中断）。 */
function sseResponseThenThrow(chunks, err) {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    body: {
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) yield enc.encode(c);
        throw err;
      },
    },
  };
}

function makeResolved(capsOverrides = {}) {
  return {
    provider: {
      id: 'test',
      name: 'TestProvider',
      supportsStreamOptions: false,
      supportsToolChoiceFunction: false,
    },
    apiKey: 'sk-test',
    baseUrl: 'http://local.test/v1',
    model: 'test-model',
    caps: {
      toolsSupport: 'unsupported',
      supportsTools: false,
      toolReliability: 'none',
      thinkingFormat: 'none',
      maxTokens: 1024,
      capabilitySource: 'test',
      supportsStreamOptions: false,
      ...capsOverrides,
    },
    fallback: { canFallbackToDeepseek: false, canFallbackToBailian: false },
  };
}

function makeSink() {
  const deltas = [];
  const toolEvents = [];
  let doneText = null;
  let doneCalled = 0;
  let errorCalled = 0;
  let lastError = null;
  return {
    deltas,
    toolEvents,
    get doneText() { return doneText; },
    get doneCalled() { return doneCalled; },
    get errorCalled() { return errorCalled; },
    get lastError() { return lastError; },
    handlers: {
      onDelta: (t) => { deltas.push(t); },
      onDone: (text) => { doneText = text; doneCalled += 1; },
      onError: (e) => { errorCalled += 1; lastError = e; },
      onToolEvent: (e) => { toolEvents.push(e); },
    },
  };
}

describe('streamChatRaw 端到端冒烟（假 SSE 流）', () => {
  beforeEach(() => {
    handleToolCallsSpy = null;
    currentFetchImpl = async () => { throw new Error('currentFetchImpl 未设置'); };
  });

  it('1. 正常文本回复：按序拼接、onDone 收口、不报错', async () => {
    currentFetchImpl = async () => sseResponse([
      'data: {"model":"test-model","choices":[{"delta":{"content":"你好"}}]}\n',
      'data: {"choices":[{"delta":{"content":"，世界"}}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
      'data: [DONE]\n',
    ]);

    const sink = makeSink();
    await ai.streamChat({
      messages: [{ role: 'user', content: 'hi' }],
      _omniRouteResolved: makeResolved(),
      _disableExternalOmniRoute: true,
      ...sink.handlers,
    });

    expect(sink.errorCalled).toBe(0);
    expect(sink.doneCalled).toBe(1);
    expect(sink.deltas.join('')).toBe('你好，世界');
    expect(sink.doneText).toBe('你好，世界');
  });

  it('2. 工具调用流：finish_reason=tool_calls 路由到工具分发并收口', async () => {
    let dispatched = null;
    handleToolCallsSpy = async (arg) => { dispatched = arg; };

    currentFetchImpl = async () => sseResponse([
      'data: {"model":"test-model","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"web_search","arguments":"{}"}}]}}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n',
    ]);

    const sink = makeSink();
    await ai.streamChat({
      messages: [{ role: 'user', content: '搜一下' }],
      _omniRouteResolved: makeResolved({ toolsSupport: 'supported', supportsTools: true, toolReliability: 'loose' }),
      _disableExternalOmniRoute: true,
      ...sink.handlers,
    });

    expect(sink.errorCalled).toBe(0);
    expect(dispatched).not.toBe(null);
    const names = (dispatched.toolCalls || []).filter(Boolean).map((c) => c.function?.name);
    expect(names).toContain('web_search');
  });

  it('3. 流中断（已输出内容）：优雅截断、不报错、保留已输出正文', async () => {
    currentFetchImpl = async () => sseResponseThenThrow(
      ['data: {"choices":[{"delta":{"content":"这是一段已经开始输出的较长正文内容"}}]}\n'],
      new Error('socket hang up'),
    );

    const sink = makeSink();
    await ai.streamChat({
      messages: [{ role: 'user', content: 'hi' }],
      _omniRouteResolved: makeResolved(),
      _disableExternalOmniRoute: true,
      ...sink.handlers,
    });

    // 流中断不应走 onError（否则前端会报错刷屏），应优雅截断收口
    expect(sink.errorCalled).toBe(0);
    expect(sink.doneCalled).toBe(1);
    expect(sink.doneText).toContain('这是一段已经开始输出的较长正文内容');
    expect(sink.doneText).toContain('继续'); // 截断提示
  });
});
