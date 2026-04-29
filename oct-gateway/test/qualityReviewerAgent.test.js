'use strict';

const assert = require('node:assert');
const {
  runQualityReviewerAgent,
  parseQualityReviewerOutput,
} = require('../script_adapter/agents/qualityReviewerAgent');

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

function artifact(type, payload) {
  return {
    artifactId: `artifact-${type}-test`,
    artifactType: type,
    producedBy: 'test',
    payload,
    metrics: {},
  };
}

async function main() {
  await test('missing adapted_script throws REVIEWER_NO_ADAPTED_SCRIPT', async () => {
    await assert.rejects(
      () => runQualityReviewerAgent({ artifacts: {} }),
      /REVIEWER_NO_ADAPTED_SCRIPT/,
    );
  });

  await test('parseQualityReviewerOutput normalizes conclusion and severity', () => {
    const out = parseQualityReviewerOutput(JSON.stringify({
      conclusion: 'pass',
      issues: [
        { severity: 'high', category: '忠实度', location: 'seg-001', description: '问题A', suggestion: '修' },
        { severity: 'P0', category: '人物度', location: 'seg-002', description: '问题B', suggestion: '修' },
      ],
    }));
    assert.equal(out.conclusion, 'reject');
    assert.equal(out.issues[0].severity, 'P2');
    assert.equal(out.issues[1].severity, 'P0');
  });

  await test('parseQualityReviewerOutput upgrades P1 to pass_with_changes', () => {
    const out = parseQualityReviewerOutput(JSON.stringify({
      conclusion: 'pass',
      issues: [
        { severity: 'P1', category: '可听度', location: '全局', description: '需要微调', suggestion: '拆句' },
      ],
    }));
    assert.equal(out.conclusion, 'pass_with_changes');
  });

  const runLive = process.env.RUN_LIVE_TESTS === '1' || process.env.RUN_LIVE_TESTS === 'true';
  if (!runLive) {
    console.log('SKIP live qualityReviewerAgent tests. Set RUN_LIVE_TESTS=1 to enable real LLM calls.');
  } else {
    const artifacts = {
      a1: artifact('adapted_script', {
        chapterTitle: '第1章',
        totalCharCount: 120,
        segments: [
          { segmentId: 'seg-001', type: 'narration', text: '夜风吹过走廊。' },
          { segmentId: 'seg-002', type: 'dialogue', speaker: '林晚', text: '你听见了吗？' },
          { segmentId: 'seg-003', type: 'dialogue', speaker: '陈默', text: '别回头。' },
          { segmentId: 'seg-004', type: 'inner_monologue', speaker: '林晚', text: '心脏跳得厉害。' },
        ],
      }),
      a2: artifact('voice_registry', {
        registry: [
          { roleName: '旁白', category: 'narrator', voiceHint: '冷静', appearanceCount: 1 },
          { roleName: '林晚', category: 'main', voiceHint: '年轻女性', appearanceCount: 2 },
          { roleName: '陈默', category: 'support', voiceHint: '低沉男声', appearanceCount: 1 },
        ],
        unresolved: [],
      }),
      a3: artifact('performance_design', {
        bgmTrack: { mood: '空屋悬疑', suggestion: '保持稀疏底噪' },
        sfxList: [{ atSegmentId: 'seg-001', sfxType: 'AMB', description: '风声' }],
        cvDirections: [{ atSegmentId: 'seg-002', emotion: '克制', pace: '慢' }],
      }),
    };
    await test('live reviewer returns conclusion and issue severities', async () => {
      const { payload, latencyMs, model } = await runQualityReviewerAgent({ artifacts });
      assert.ok(model, 'model should be set');
      assert.ok(typeof latencyMs === 'number' && latencyMs >= 0, 'latencyMs');
      assert.ok(['pass', 'pass_with_changes', 'reject'].includes(payload.conclusion), 'conclusion');
      assert.ok(payload.issues.length >= 1, 'issues');
      assert.ok(payload.issues.every((issue) => ['P0', 'P1', 'P2'].includes(issue.severity)), 'severity');
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
