'use strict';

const assert = require('node:assert');

const llmClientPath = require.resolve('../services/llmClient');
const agentPath = require.resolve('../script_adapter/agents/textRewriterAgent');

const originalLlmClient = require(llmClientPath);
const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error?.message || String(error) });
    console.log(`FAIL ${name}: ${error?.message || String(error)}`);
  }
}

function makeText(length) {
  const unit = '第七天夜里，老宅走廊的风灯摇了两下，林晚听见木门后有人压低声音说话。';
  let text = '';
  while (text.length < length) text += unit;
  return text.slice(0, length);
}

function loadAgentWithStub(chatStub) {
  delete require.cache[agentPath];
  delete require.cache[llmClientPath];
  require.cache[llmClientPath] = {
    id: llmClientPath,
    filename: llmClientPath,
    loaded: true,
    exports: {
      ...originalLlmClient,
      resolveProviderFor: () => ({ baseUrl: 'http://stub.local', apiKey: 'test', model: 'stub-model' }),
      chatCompletion: chatStub,
    },
  };
  return require(agentPath);
}

function restore() {
  delete require.cache[agentPath];
  delete require.cache[llmClientPath];
  require.cache[llmClientPath] = {
    id: llmClientPath,
    filename: llmClientPath,
    loaded: true,
    exports: originalLlmClient,
  };
}

async function main() {
  await test('short text stays single-pass', async () => {
    let calls = 0;
    const { runTextRewriterAgent } = loadAgentWithStub(async () => {
      calls += 1;
      return {
        content: JSON.stringify({
          chapterTitle: '短章',
          totalCharCount: 10,
          segments: [
            { segmentId: 'seg-001', type: 'narration', text: '短文本改编', rewriteNote: '拆句' },
          ],
        }),
        model: 'stub-model',
        latencyMs: 12,
      };
    });

    const result = await runTextRewriterAgent({ sourceText: makeText(200) });
    assert.equal(calls, 1);
    assert.equal(result.model, 'stub-model');
    assert.equal(result.payload.segments.length, 1);
  });

  await test('8000-char text uses chunked mode and renumbers segments globally', async () => {
    let calls = 0;
    const { runTextRewriterAgent } = loadAgentWithStub(async () => {
      calls += 1;
      return {
        content: JSON.stringify({
          chapterTitle: calls === 1 ? '长章' : `长章-${calls}`,
          totalCharCount: 16,
          segments: [
            { segmentId: 'seg-001', type: 'narration', text: `片段${calls}-旁白`, rewriteNote: '保留信息顺序' },
            { segmentId: 'seg-002', type: 'dialogue', speaker: '林晚', text: `片段${calls}-对白`, rewriteNote: '拉开角色声部' },
          ],
        }),
        model: 'stub-model',
        latencyMs: 20,
      };
    });

    const result = await runTextRewriterAgent({ sourceText: makeText(8000) });
    assert.ok(calls >= 2, `expected multiple chunks, got ${calls}`);
    assert.ok(result.model.includes(`chunked × ${calls}`));
    assert.equal(result.payload.chapterTitle, '长章');
    assert.equal(result.payload.segments[0].segmentId, 'seg-001');
    assert.equal(result.payload.segments[1].segmentId, 'seg-002');
    assert.equal(result.payload.segments[result.payload.segments.length - 1].segmentId, `seg-${String(result.payload.segments.length).padStart(3, '0')}`);
  });

  await test('chunk failure falls back to placeholder and later chunks continue', async () => {
    let calls = 0;
    const { runTextRewriterAgent } = loadAgentWithStub(async () => {
      calls += 1;
      if (calls === 2) throw new Error('boom chunk 2');
      return {
        content: JSON.stringify({
          chapterTitle: '故障恢复章',
          totalCharCount: 16,
          segments: [
            { segmentId: 'seg-001', type: 'narration', text: `片段${calls}-成功`, rewriteNote: '继续推进' },
          ],
        }),
        model: 'stub-model',
        latencyMs: 18,
      };
    });

    const result = await runTextRewriterAgent({ sourceText: makeText(9000) });
    assert.ok(calls >= 3, `expected 3+ chunks, got ${calls}`);
    assert.ok(result.payload.segments.some((segment) => String(segment.text).includes('第 2 段改编失败')));
    assert.ok(result.payload.segments.some((segment) => String(segment.text).includes(`片段${calls}-成功`)));
  });

  restore();

  const failed = results.filter((item) => !item.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  restore();
  console.error(error);
  process.exitCode = 1;
});
