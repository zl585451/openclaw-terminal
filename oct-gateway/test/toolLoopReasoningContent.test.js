'use strict';

const assert = require('node:assert');
const ToolLoop = require('../runtime/toolLoop');
const { _internals } = require('../ai');

async function main() {
  let continuedMessages = null;
  let continuedOptions = null;
  const loop = new ToolLoop({
    toolLoader: {
      getToolMeta: () => ({ timeoutMs: 1000 }),
      executeTool: async () => 'tool result',
    },
    log: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    streamChat: async (options) => {
      continuedOptions = options;
      continuedMessages = options.messages;
    },
    buildToolSignature: () => 'search:{}',
    maxToolRounds: 8,
    maxIdenticalToolSignatures: 2,
  });

  const toolCall = {
    id: 'call_1',
    type: 'function',
    extra_content: {
      google: {
        thought_signature: 'gemini-signature-a',
      },
    },
    function: {
      name: 'web_search',
      arguments: '{"query":"Gemini latest model"}',
    },
  };

  await loop.handleToolCalls({
    toolCalls: [toolCall],
    toolRound: 0,
    toolSignatures: [],
    fullText: '',
    totalUsage: null,
    responseModel: 'google/gemini-3.1-pro-preview',
    assistantResponseMessage: {
      role: 'assistant',
      content: '',
      reasoning_content: 'model private thinking transcript',
      tool_calls: [toolCall],
    },
    truncatedMessages: [{ role: 'user', content: 'search Gemini latest model' }],
    onDelta: () => {},
    onDone: () => {},
    onError: () => {},
    onToolEvent: () => {},
    flushThinkAtEnd: () => {},
    turnId: 'test-turn',
    _omniRouteResolved: {
      provider: { id: 'external_omniroute', name: 'OmniRoute' },
      baseUrl: 'https://omni.example/v1',
      apiKey: 'sk-test',
      model: 'kimi-k2.6',
      caps: { toolsSupport: 'supported', supportsTools: true },
      fallback: { canFallbackToDeepseek: false, canFallbackToBailian: false },
    },
    _disableExternalOmniRoute: false,
  });

  assert.equal(continuedOptions._omniRouteResolved.model, 'kimi-k2.6');
  assert.equal(continuedOptions._disableExternalOmniRoute, false);
  assert.ok(Array.isArray(continuedMessages), 'continued messages should be passed to streamChat');
  const assistantToolMessage = continuedMessages.find((message) => message.role === 'assistant');
  assert.equal(assistantToolMessage.reasoning_content, 'model private thinking transcript');
  assert.deepEqual(assistantToolMessage.tool_calls, [toolCall]);
  assert.equal(
    assistantToolMessage.tool_calls[0].extra_content.google.thought_signature,
    'gemini-signature-a',
  );

  const mergedToolCall = _internals.applyToolCallDelta(undefined, {
    index: 0,
    id: 'call_google_1',
    type: 'function',
    extra_content: { google: { thought_signature: 'sig-stream-1' } },
    function: { name: 'web_', arguments: '{"query":"' },
  });
  _internals.applyToolCallDelta(mergedToolCall, {
    index: 0,
    function: { name: 'search', arguments: 'Gemini"}' },
  });
  assert.equal(mergedToolCall.function.name, 'web_search');
  assert.equal(mergedToolCall.function.arguments, '{"query":"Gemini"}');
  assert.equal(mergedToolCall.extra_content.google.thought_signature, 'sig-stream-1');
  assert.equal(_internals.isProtocolOrRateLimitError({ status: 429 }), true);
  assert.equal(
    _internals.isProtocolOrRateLimitError(new Error('Function call `x` is missing a `thought_signature`')),
    true,
  );
  assert.equal(_internals.shouldForceFinalFromToolResults('google', true, 1), true);
  assert.equal(_internals.shouldForceFinalFromToolResults('google', true, 0), false);
  assert.equal(_internals.shouldForceFinalFromToolResults('deepseek', true, 2), false);

  const fallbackReply = _internals.buildToolResultFallbackReply([
    { role: 'user', content: '帮我搜索 Gemini 最新模型' },
    { role: 'tool', content: '{"title":"Gemini 3.1 Pro Preview","url":"https://example.test"}' },
  ], { status: 429, message: 'HTTP 429: Resource exhausted' });
  assert.match(fallbackReply, /Gemini 已完成工具检索/);
  assert.match(fallbackReply, /Gemini 3\.1 Pro Preview/);

  console.log('PASS toolLoop preserves reasoning_content and Gemini thought_signature on tool continuation');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
