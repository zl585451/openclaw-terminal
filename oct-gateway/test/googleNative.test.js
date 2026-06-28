'use strict';

const assert = require('node:assert');
const {
  parseGoogleVertexFromBaseUrl,
  resolveGoogleProxyUrl,
  sanitizeGoogleModelId,
  convertMessagesToGoogleContents,
  normalizeGoogleFunctionCalls,
  _internals,
} = require('../services/googleNative');

async function main() {
  const parsed = parseGoogleVertexFromBaseUrl(
    'https://aiplatform.googleapis.com/v1beta1/projects/demo-project/locations/us-central1/endpoints/openapi',
  );
  assert.equal(parsed.project, 'demo-project');
  assert.equal(parsed.location, 'us-central1');

  const parsedGlobal = parseGoogleVertexFromBaseUrl(
    'https://aiplatform.googleapis.com/v1beta1/projects/demo-project/locations/global/endpoints/openapi',
  );
  assert.equal(parsedGlobal.project, 'demo-project');
  assert.equal(parsedGlobal.location, 'global');

  assert.equal(resolveGoogleProxyUrl({
    GOOGLE_HTTPS_PROXY: 'http://127.0.0.1:10808',
    HTTPS_PROXY: 'http://127.0.0.1:9999',
  }), 'http://127.0.0.1:10808');
  assert.equal(resolveGoogleProxyUrl({ HTTPS_PROXY: 'http://127.0.0.1:9999' }), 'http://127.0.0.1:9999');

  assert.equal(sanitizeGoogleModelId('google/gemini-2.5-flash'), 'gemini-2.5-flash');
  assert.equal(sanitizeGoogleModelId('gemini-2.5-flash-image-preview'), 'gemini-2.5-flash-image');
  assert.equal(sanitizeGoogleModelId('google/gemini-2.0-flash-001'), 'gemini-2.0-flash');
  assert.equal(sanitizeGoogleModelId('google/gemini-3.1-flash-lite-preview'), 'gemini-3.1-flash-lite');
  assert.equal(sanitizeGoogleModelId('gemini-3.1-pro-preview-customtools'), 'gemini-3.1-pro-preview-customtools');

  const converted = convertMessagesToGoogleContents([
    { role: 'system', content: 'you are helpful' },
    { role: 'user', content: 'hello' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_1',
          function: {
            name: 'web_search',
            arguments: '{"query":"Gemini"}',
          },
        },
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"title":"Gemini 2.5 Flash"}',
    },
  ]);

  assert.match(converted.systemInstruction, /you are helpful/);
  assert.equal(converted.contents[0].role, 'user');
  assert.equal(converted.contents[1].role, 'model');
  assert.equal(converted.contents[1].parts[0].functionCall.name, 'web_search');
  assert.equal('id' in converted.contents[1].parts[0].functionCall, false);
  assert.equal(converted.contents[2].role, 'user');
  assert.equal(converted.contents[2].parts[0].functionResponse.name, 'web_search');
  assert.equal('id' in converted.contents[2].parts[0].functionResponse, false);

  const convertedMultiTool = convertMessagesToGoogleContents([
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_a',
          function: {
            name: 'web_search',
            arguments: '{"query":"套餐 A"}',
          },
        },
        {
          id: 'call_b',
          function: {
            name: 'web_search',
            arguments: '{"query":"套餐 B"}',
          },
        },
      ],
      google_native_content: {
        role: 'model',
        parts: [
          { functionCall: { name: 'web_search', args: { query: '套餐 A' } } },
          { functionCall: { name: 'web_search', args: { query: '套餐 B' } } },
        ],
      },
    },
    {
      role: 'tool',
      tool_call_id: 'call_a',
      tool_name: 'web_search',
      content: '{"result":"A"}',
      google_native_content: {
        role: 'user',
        parts: [{
          functionResponse: {
            name: 'web_search',
            response: { output: '{"result":"A"}' },
          },
        }],
      },
    },
    {
      role: 'tool',
      tool_call_id: 'call_b',
      tool_name: 'web_search',
      content: '{"result":"B"}',
      google_native_content: {
        role: 'user',
        parts: [{
          functionResponse: {
            name: 'web_search',
            response: { output: '{"result":"B"}' },
          },
        }],
      },
    },
  ]);
  assert.equal(convertedMultiTool.contents.length, 2);
  assert.equal(convertedMultiTool.contents[0].parts.length, 2);
  assert.equal(convertedMultiTool.contents[1].role, 'user');
  assert.equal(convertedMultiTool.contents[1].parts.length, 2);
  assert.equal(convertedMultiTool.contents[1].parts[0].functionResponse.response.output, '{"result":"A"}');
  assert.equal(convertedMultiTool.contents[1].parts[1].functionResponse.response.output, '{"result":"B"}');

  const sanitized = _internals.sanitizeGoogleNativeContent({
    role: 'model',
    parts: [
      {
        thoughtSignature: 'sig-model-fc',
        functionCall: {
          id: 'legacy_call',
          name: 'web_search',
          args: { query: 'today ai news' },
        },
      },
      {
        functionResponse: {
          id: 'legacy_call',
          name: 'web_search',
          response: { output: 'ok' },
        },
      },
    ],
  });
  assert.equal('id' in sanitized.parts[0].functionCall, false);
  assert.equal(sanitized.parts[0].thoughtSignature, 'sig-model-fc');
  assert.equal('id' in sanitized.parts[1].functionResponse, false);

  const merged = _internals.mergeFunctionCalls([], [
    { id: 'fc_1', name: 'read_file', args: { path: 'a.txt' }, thoughtSignature: 'sig-a' },
  ]);
  const mergedAgain = _internals.mergeFunctionCalls(merged, [
    { id: 'fc_1', name: 'read_file', args: { encoding: 'utf8' } },
  ]);
  assert.deepEqual(mergedAgain[0].args, { path: 'a.txt', encoding: 'utf8' });
  assert.equal(mergedAgain[0].thoughtSignature, 'sig-a');

  const extracted = _internals.extractFunctionCallsFromChunk({
    candidates: [{
      content: {
        parts: [{
          thoughtSignature: 'sig-from-part',
          functionCall: {
            name: 'request_clarify',
            args: { title: '确认频率' },
          },
        }],
      },
    }],
  });
  assert.equal(extracted[0].name, 'request_clarify');
  assert.equal(extracted[0].thoughtSignature, 'sig-from-part');

  const normalized = normalizeGoogleFunctionCalls([
    { id: 'fc_2', name: 'write_file', args: { path: 'b.txt', content: 'ok' }, thoughtSignature: 'sig-b' },
  ]);
  assert.equal(normalized[0].function.name, 'write_file');
  assert.equal(normalized[0].extra_content.google_native.id, 'fc_2');
  assert.equal(normalized[0].extra_content.google_native.thoughtSignature, 'sig-b');

  const convertedSigned = convertMessagesToGoogleContents([
    {
      role: 'assistant',
      content: '',
      tool_calls: [normalized[0]],
    },
  ]);
  assert.equal(convertedSigned.contents[0].parts[0].thoughtSignature, 'sig-b');

  console.log('PASS google native helpers normalize Vertex config, message conversion, and function calls');

  // canvas 实时预览：Gemini 的 args 已经是解析好的对象，直接拿 content 现成用，
  // 不需要 partialJsonField 那套容错抠取——这里只验证节流/过滤逻辑接得对。
  const previewEvents = [];
  const previewState = new Map();
  _internals.maybeEmitCanvasStreamPreview({
    functionCalls: [{ id: 'call_1', name: 'canvas', args: { action: 'create', title: '深夜电台', content: '<html>开头' } }],
    state: previewState,
    onToolEvent: (evt) => previewEvents.push(evt),
  });
  assert.equal(previewEvents.length, 1);
  assert.equal(previewEvents[0].type, 'canvas_stream');
  assert.equal(previewEvents[0].callId, 'call_1');
  assert.equal(previewEvents[0].content, '<html>开头');
  assert.equal(previewEvents[0].title, '深夜电台');

  // 内容没有变长——再调用一次不应该重复发
  _internals.maybeEmitCanvasStreamPreview({
    functionCalls: [{ id: 'call_1', name: 'canvas', args: { action: 'create', title: '深夜电台', content: '<html>开头' } }],
    state: previewState,
    onToolEvent: (evt) => previewEvents.push(evt),
  });
  assert.equal(previewEvents.length, 1);

  // 非 canvas 工具不应该触发预览事件
  const otherEvents = [];
  _internals.maybeEmitCanvasStreamPreview({
    functionCalls: [{ id: 'call_2', name: 'read_file', args: { path: 'a.txt' } }],
    state: new Map(),
    onToolEvent: (evt) => otherEvents.push(evt),
  });
  assert.equal(otherEvents.length, 0);

  // 还没攒出 content/title 时不应该触发
  const emptyEvents = [];
  _internals.maybeEmitCanvasStreamPreview({
    functionCalls: [{ id: 'call_3', name: 'canvas', args: { action: 'create' } }],
    state: new Map(),
    onToolEvent: (evt) => emptyEvents.push(evt),
  });
  assert.equal(emptyEvents.length, 0);

  console.log('PASS google native canvas stream preview emits/suppresses correctly');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
