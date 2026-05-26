'use strict';

const assert = require('node:assert');
const {
  _test: {
    canFallbackToRuleAnalysis,
    isRetryableAnalysisError,
    parseJsonObject,
    runBusinessAnalysisCompletion,
  },
} = require('../script_adapter/businessAnalysisOrchestrator');

function validAnalysisJson() {
  return JSON.stringify({
    agentName: '业务分析 Agent',
    summary: '可以进入多人演播制作。',
    diagnosis: [{ title: '旁白偏书面', detail: '需要轻度口语化。', severity: '中' }],
    evidence: [{ location: '第2章', issue: '旁白密度', quote: '他翻开案卷。' }],
    strategyOptions: [
      {
        id: 'standard',
        title: '标准多人演播',
        desc: '保留剧情并优化听感。',
        editDepth: '中',
        impact: '进入文本改编和角色音标注。',
        recommended: true,
      },
    ],
    recommendedStrategyId: 'standard',
    executionImpact: {
      nextAgents: ['文本改编 Agent'],
      outputs: ['多人演播台本'],
      requiresReview: true,
    },
  });
}

async function testBadJsonRetriesWithCompactPrompt() {
  const calls = [];
  const result = await runBusinessAnalysisCompletion({
    provider: { model: 'test-model' },
    params: { workGoal: '多人演播有声书', rangeLabel: '第2章' },
    context: { sourceText: '正文', totalChars: 2 },
    request: async (options) => {
      calls.push(options);
      if (calls.length === 1) {
        return {
          model: 'test-model',
          content: '{"diagnosis":[{"title":"坏JSON"} {"title":"少逗号"}]}',
        };
      }
      return { model: 'test-model', content: validAnalysisJson() };
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].compact, true);
  assert.equal(result.model, 'test-model (compact retry)');
  assert.equal(result.payload.recommendedStrategyId, 'standard');
}

async function testBadJsonCanFallbackAfterRetryFails() {
  await assert.rejects(
    () => runBusinessAnalysisCompletion({
      provider: { model: 'test-model' },
      params: { workGoal: '多人演播有声书', rangeLabel: '第2章' },
      context: { sourceText: '正文', totalChars: 2 },
      request: async () => ({
        model: 'test-model',
        content: '{"strategyOptions":[{"id":"standard"} {"id":"deep"}]}',
      }),
    }),
    (error) => {
      assert.equal(error.code, 'BUSINESS_ANALYSIS_JSON_PARSE_FAILED');
      assert.equal(isRetryableAnalysisError(error), true);
      assert.equal(canFallbackToRuleAnalysis(error), true);
      return true;
    },
  );
}

function testParseJsonObjectExtractsWrappedJson() {
  const payload = parseJsonObject(`\`\`\`json\n${validAnalysisJson()}\n\`\`\``);
  assert.equal(payload.agentName, '业务分析 Agent');
}

(async () => {
  await testBadJsonRetriesWithCompactPrompt();
  await testBadJsonCanFallbackAfterRetryFails();
  testParseJsonObjectExtractsWrappedJson();
  console.log('PASS business analysis JSON retry and fallback guards');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
