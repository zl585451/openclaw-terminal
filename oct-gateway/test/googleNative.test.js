'use strict';

const assert = require('node:assert');
const {
  parseGoogleVertexFromBaseUrl,
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

  assert.equal(sanitizeGoogleModelId('google/gemini-2.5-flash'), 'gemini-2.5-flash');
  assert.equal(sanitizeGoogleModelId('gemini-2.5-flash-image-preview'), 'gemini-2.5-flash-image');
  assert.equal(sanitizeGoogleModelId('google/gemini-2.0-flash-001'), 'gemini-2.0-flash');

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

  const sanitized = _internals.sanitizeGoogleNativeContent({
    role: 'model',
    parts: [
      {
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
  assert.equal('id' in sanitized.parts[1].functionResponse, false);

  const merged = _internals.mergeFunctionCalls([], [
    { id: 'fc_1', name: 'read_file', args: { path: 'a.txt' } },
  ]);
  const mergedAgain = _internals.mergeFunctionCalls(merged, [
    { id: 'fc_1', name: 'read_file', args: { encoding: 'utf8' } },
  ]);
  assert.deepEqual(mergedAgain[0].args, { path: 'a.txt', encoding: 'utf8' });

  const normalized = normalizeGoogleFunctionCalls([
    { id: 'fc_2', name: 'write_file', args: { path: 'b.txt', content: 'ok' } },
  ]);
  assert.equal(normalized[0].function.name, 'write_file');
  assert.equal(normalized[0].extra_content.google_native.id, 'fc_2');

  console.log('PASS google native helpers normalize Vertex config, message conversion, and function calls');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
