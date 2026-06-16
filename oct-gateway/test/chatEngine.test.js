'use strict';

const { describe, it, expect } = globalThis;
const ChatEngine = require('../runtime/chatEngine');

describe('ChatEngine capability parameter passthrough', () => {
  const mockStreamController = {
    createSmoother: () => ({ feed: () => {} }),
    isCancelled: () => false,
    flush: () => {},
    getFullReply: () => 'mocked reply',
  };

  const streamControllerFactory = () => mockStreamController;
  const mockPostProcessor = { process: () => {} };
  const mockSession = { addMessage: () => {} };

  it('1. passes request.capability to streamChat when present', async () => {
    let passedOptions = null;
    const streamChat = async (options) => {
      passedOptions = options;
      options.onDone('reply', {}, 'model');
    };

    const engine = new ChatEngine({
      streamChat,
      session: mockSession,
      postProcessor: mockPostProcessor,
      sanitizeAssistantReply: (text) => text,
      streamControllerFactory,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    const request = {
      messages: [{ role: 'user', content: 'hello' }],
      turnId: 'turn-123',
      capability: 'oct-chat',
      sessionKey: 'sess-123',
    };

    const emitter = {
      onStart: () => {},
      onBeforeDone: () => {},
      onDone: () => {},
    };

    await engine.execute(request, emitter);

    expect(passedOptions).toBeDefined();
    expect(passedOptions.capability).toBe('oct-chat');
    expect(passedOptions.turnId).toBe('turn-123');
    expect(passedOptions.toolChoice).toBe('auto');
  });

  it('3. onRoundReset resets fullReply and notifies emitter.onAnswerReset', async () => {
    const resetCalls = [];
    const resettableController = {
      createSmoother: () => ({ feed: () => {} }),
      isCancelled: () => false,
      flush: () => {},
      getFullReply: () => 'final round only',
      resetReply: () => { resetCalls.push('controller'); },
    };

    let answerResetCount = 0;
    const streamChat = async (options) => {
      // 模拟工具续轮：在最终 onDone 之前触发一次 onRoundReset
      options.onRoundReset();
      options.onDone('reply', {}, 'model');
    };

    const engine = new ChatEngine({
      streamChat,
      session: mockSession,
      postProcessor: mockPostProcessor,
      sanitizeAssistantReply: (text) => text,
      streamControllerFactory: () => resettableController,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    const emitter = {
      onStart: () => {},
      onBeforeDone: () => {},
      onDone: () => {},
      onAnswerReset: () => { answerResetCount += 1; },
    };

    await engine.execute({
      messages: [{ role: 'user', content: 'hi' }],
      turnId: 'turn-reset',
      sessionKey: 'sess-reset',
    }, emitter);

    expect(resetCalls).toContain('controller');
    expect(answerResetCount).toBe(1);
  });

  it('2. leaves capability as undefined/unset when not present in request', async () => {
    let passedOptions = null;
    const streamChat = async (options) => {
      passedOptions = options;
      options.onDone('reply', {}, 'model');
    };

    const engine = new ChatEngine({
      streamChat,
      session: mockSession,
      postProcessor: mockPostProcessor,
      sanitizeAssistantReply: (text) => text,
      streamControllerFactory,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    const request = {
      messages: [{ role: 'user', content: 'hello' }],
      turnId: 'turn-123',
      sessionKey: 'sess-123',
    };

    const emitter = {
      onStart: () => {},
      onBeforeDone: () => {},
      onDone: () => {},
    };

    await engine.execute(request, emitter);

    expect(passedOptions).toBeDefined();
    expect(passedOptions.capability).toBeUndefined();
  });
});
