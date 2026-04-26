'use strict';

/**
 * Tool result summarizer 单元测试。
 *
 * 默认只跑离线测试,不消耗 API 配额。
 * 想要跑真实 LLM 调用:
 *   PowerShell:  $env:RUN_LIVE_TESTS=1; node oct-gateway/test/toolResultSummarizer.test.js
 *   bash:        RUN_LIVE_TESTS=1 node oct-gateway/test/toolResultSummarizer.test.js
 */

const assert = require('node:assert');
const {
  summarizeToolResult,
  shouldSummarizeToolResult,
} = require('../runtime/toolResultSummarizer');

const results = [];
const ORIGINAL_ENV = {
  TOOL_RESULT_SUMMARIZER_ENABLED: process.env.TOOL_RESULT_SUMMARIZER_ENABLED,
  TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS: process.env.TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS,
  TOOL_RESULT_SUMMARIZER_TARGET_CHARS: process.env.TOOL_RESULT_SUMMARIZER_TARGET_CHARS,
  TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP: process.env.TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP,
  TOOL_RESULT_SUMMARIZER_TOOLS: process.env.TOOL_RESULT_SUMMARIZER_TOOLS,
};

async function test(name, fn) {
  try {
    resetEnv();
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error?.message || String(error) });
    console.log(`FAIL ${name}: ${error?.message || String(error)}`);
  } finally {
    resetEnv();
  }
}

function resetEnv() {
  for (const key of Object.keys(ORIGINAL_ENV)) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
}

function enableSummarizer(extra = {}) {
  process.env.TOOL_RESULT_SUMMARIZER_ENABLED = '1';
  for (const [key, value] of Object.entries(extra)) {
    process.env[key] = String(value);
  }
}

function makeText(length) {
  const sentence = '这是一个用于工具结果摘要测试的长文本片段，包含事实、结构和可执行信息。';
  let text = '';
  while (text.length < length) text += sentence;
  return text.slice(0, length);
}

async function main() {
  await test('feature disabled returns noop feature_disabled', async () => {
    delete process.env.TOOL_RESULT_SUMMARIZER_ENABLED;
    const decision = shouldSummarizeToolResult('web_search', makeText(5000));
    assert.equal(decision.shouldSummarize, false);
    assert.equal(decision.reason, 'feature_disabled');

    const result = await summarizeToolResult('web_search', makeText(5000));
    assert.equal(result.mode, 'noop');
    assert.equal(result.reason, 'feature_disabled');
  });

  await test('enabled short text returns under_threshold', async () => {
    enableSummarizer({ TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS: 2400 });
    const result = await summarizeToolResult('web_search', makeText(400));
    assert.equal(result.mode, 'noop');
    assert.equal(result.reason, 'under_threshold');
  });

  await test('enabled over threshold but not in allow list returns not_in_allow_list', async () => {
    enableSummarizer({
      TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS: 100,
      TOOL_RESULT_SUMMARIZER_TOOLS: 'web_search,read_document',
    });
    const result = await summarizeToolResult('read_file', makeText(500));
    assert.equal(result.mode, 'noop');
    assert.equal(result.reason, 'not_in_allow_list');
  });

  await test('enabled over threshold and in allow list calls mock summarize', async () => {
    enableSummarizer({
      TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS: 100,
      TOOL_RESULT_SUMMARIZER_TOOLS: 'web_search',
    });
    const result = await summarizeToolResult('web_search', makeText(500), {
      summarize: async (text, options) => {
        assert.ok(text.length > 100);
        assert.equal(options.purpose, 'tool_result');
        assert.equal(options.targetLength, 600);
        return { model: 'mock-summarizer', summary: '压缩后的工具结果摘要。' };
      },
    });
    assert.equal(result.mode, 'summary');
    assert.match(result.text, /^\[summarizer\/mock-summarizer\]/);
  });

  await test('object input violates wrapper contract and returns invalid_input_not_string', async () => {
    enableSummarizer();
    const result = await summarizeToolResult('web_search', { value: 'not a string' });
    assert.equal(result.mode, 'noop');
    assert.equal(result.text, '');
    assert.equal(result.reason, 'invalid_input_not_string');
  });

  await test('mock summarize failure returns fallback_truncate', async () => {
    enableSummarizer({
      TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS: 100,
      TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP: 120,
    });
    const result = await summarizeToolResult('web_search', makeText(500), {
      summarize: async () => {
        throw new Error('mock timeout');
      },
    });
    assert.equal(result.mode, 'fallback_truncate');
    assert.match(result.text, /^\[summarizer fallback: mock timeout\]/);
    assert.ok(result.text.includes('...(truncated)'));
  });

  const runLive = process.env.RUN_LIVE_TESTS === '1' || process.env.RUN_LIVE_TESTS === 'true';
  if (!runLive) {
    console.log('SKIP live tool result summarizer tests. Set RUN_LIVE_TESTS=1 to enable real LLM calls.');
  } else {
    await test('live summarize returns summary', async () => {
      enableSummarizer({
        TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS: 100,
        TOOL_RESULT_SUMMARIZER_TOOLS: 'web_search',
      });
      const result = await summarizeToolResult('web_search', makeText(5000));
      assert.equal(result.mode, 'summary');
      assert.ok(result.text.length > 0);
    });

    await test('live summarize timeout falls back', async () => {
      enableSummarizer({
        TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS: 100,
        TOOL_RESULT_SUMMARIZER_TOOLS: 'web_search',
      });
      const result = await summarizeToolResult('web_search', makeText(5000), { timeoutMs: 1 });
      assert.equal(result.mode, 'fallback_truncate');
      assert.match(result.text, /^\[summarizer fallback:/);
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
