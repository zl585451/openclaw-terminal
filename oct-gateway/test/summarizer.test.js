'use strict';

/**
 * Summarizer 单元测试。
 *
 * 默认只跑离线测试(chunker 三种切分 + summarize 超长输入校验),不消耗 API 配额。
 * 想要跑真实 LLM 调用(预计 ~0.05 元/次):
 *   PowerShell:  $env:RUN_LIVE_TESTS=1; node oct-gateway/test/summarizer.test.js
 *   bash:        RUN_LIVE_TESTS=1 node oct-gateway/test/summarizer.test.js
 * 跑 live 之前,请先确保以下任一组配置已就绪:
 *   - SUMMARIZER_BASE_URL / SUMMARIZER_API_KEY / SUMMARIZER_MODEL
 *   - 或当前 Gateway provider 的 baseUrl / apiKey 已通过设置面板配置好
 */

const assert = require('node:assert');
const { chunkByChars, chunkByParagraphs, chunkByChapters } = require('../services/chunker');
const { summarize, summarizeChunks } = require('../services/summarizer');

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
  const sentence = '这是一个用于切分测试的句子，包含自然边界和段落信息。';
  let text = '';
  while (text.length < length) text += sentence;
  return text.slice(0, length);
}

async function main() {
  await test('chunkByChars splits long text with overlap', () => {
    const chunks = chunkByChars(makeText(5000), { targetSize: 1500, maxSize: 1800, overlap: 120 });
    assert.ok(chunks.length >= 3, 'should create multiple chunks');
    assert.ok(chunks[1].startChar < chunks[0].endChar, 'should overlap adjacent chunks');
    assert.ok(chunks.every((chunk) => chunk.content.length <= 1800), 'should respect maxSize');
  });

  await test('chunkByParagraphs keeps paragraph units', () => {
    const text = ['第一段内容。'.repeat(40), '第二段内容。'.repeat(40), '第三段内容。'.repeat(40)].join('\n\n');
    const chunks = chunkByParagraphs(text, { targetSize: 260 });
    assert.ok(chunks.length >= 2, 'should create multiple chunks');
    assert.ok(chunks.every((chunk) => chunk.paragraphCount >= 1), 'should count paragraphs');
    assert.ok(!chunks.some((chunk) => chunk.content.includes('第一段内容') && chunk.content.endsWith('第二段')), 'should not break paragraph text awkwardly');
  });

  await test('chunkByChapters detects Chinese chapter headings', () => {
    const text = '第一章 樟木箱\n内容一。\n\n第二章 夜\n内容二。';
    const chunks = chunkByChapters(text);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].title, '第一章 樟木箱');
    assert.equal(chunks[1].title, '第二章 夜');
  });

  await test('summarize rejects oversized input', async () => {
    await assert.rejects(() => summarize(makeText(9000)), /SUMMARIZER_INPUT_TOO_LONG/);
  });

  // 默认 SKIP live 测试,避免无心消耗 API 配额。设 RUN_LIVE_TESTS=1 才跑。
  const runLive = process.env.RUN_LIVE_TESTS === '1' || process.env.RUN_LIVE_TESTS === 'true';
  if (!runLive) {
    console.log('SKIP live summarizer tests. Set RUN_LIVE_TESTS=1 to enable real LLM calls.');
  } else {
    await test('summarize returns non-empty summary', async () => {
      const result = await summarize(makeText(2000), { targetLength: 200, purpose: 'general' });
      assert.ok(result.summary.length > 0, 'summary should not be empty');
      assert.ok(result.summary.length < 800, 'summary should be reasonably short');
    });

    await test('summarizeChunks returns chunk summaries and final summary', async () => {
      const chunks = [
        { content: makeText(1200), index: 0 },
        { content: makeText(1300), index: 1 },
        { content: makeText(1400), index: 2 },
      ];
      const result = await summarizeChunks(chunks, { chunkSummaryLength: 120, finalSummaryLength: 250 });
      assert.equal(result.chunkSummaries.length, 3);
      assert.ok(result.finalSummary.length > 0, 'final summary should not be empty');
    });

    await test('summarize timeout simulation', async () => {
      await assert.rejects(() => summarize(makeText(2000), { timeoutMs: 1 }), /超时|timed out|abort/i);
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
