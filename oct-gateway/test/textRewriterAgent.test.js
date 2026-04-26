'use strict';

/**
 * 文本改编师 Agent 测试。
 * 默认离线；RUN_LIVE_TESTS=1 时跑真实 LLM（需 SCRIPT_ADAPTER_* 或 SUMMARIZER_* 或 Gateway provider）。
 */

const assert = require('node:assert');
const { runTextRewriterAgent } = require('../script_adapter/agents/textRewriterAgent');

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
  const s = '这是一段用于长度测试的小说原文句子。';
  let t = '';
  while (t.length < length) t += s;
  return t.slice(0, length);
}

async function main() {
  await test('empty source throws TEXT_REWRITER_NO_INPUT', async () => {
    await assert.rejects(() => runTextRewriterAgent({ sourceText: '' }), /TEXT_REWRITER_NO_INPUT/);
  });

  await test('oversized source throws TEXT_REWRITER_TOO_LONG', async () => {
    await assert.rejects(() => runTextRewriterAgent({ sourceText: makeText(5000) }), /TEXT_REWRITER_TOO_LONG/);
  });

  const runLive = process.env.RUN_LIVE_TESTS === '1' || process.env.RUN_LIVE_TESTS === 'true';
  if (!runLive) {
    console.log('SKIP live textRewriterAgent tests. Set RUN_LIVE_TESTS=1 to enable real LLM calls.');
  } else {
    const sample = [
      '夜色沉沉，老宅的门轴发出一声低哑的呻吟。',
      '林晚站在门槛外，手指攥着那封泛黄的信，迟迟不敢跨进去。',
      '屋里传来瓷器轻碰的声响，像有人在收拾什么，又像是风穿过空屋的回声。',
    ].join('');
    await test('live rewrite returns valid structure', async () => {
      const { payload, latencyMs, model } = await runTextRewriterAgent({ sourceText: sample });
      assert.ok(model, 'model should be set');
      assert.ok(typeof latencyMs === 'number' && latencyMs >= 0, 'latencyMs');
      assert.ok(Array.isArray(payload.segments) && payload.segments.length >= 2, 'at least 2 segments');
      const hasDialogue = payload.segments.some((s) => s.type === 'dialogue');
      assert.ok(hasDialogue, 'at least one dialogue segment');
    });
  }

  const failed = results.filter((item) => !item.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
