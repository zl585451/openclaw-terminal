'use strict';

const assert = require('node:assert');
const {
  runPerformanceDesignerAgent,
  parsePerformanceDesignerOutput,
} = require('../script_adapter/agents/performanceDesignerAgent');

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

function adaptedArtifact(segments, chapterTitle = '测试章') {
  return {
    artifactId: 'artifact-adapted_script-test',
    artifactType: 'adapted_script',
    producedBy: 'adapter.audiobook_text_rewriter@1.0',
    payload: { chapterTitle, totalCharCount: 100, segments },
    metrics: {},
  };
}

function voiceRegistryArtifact() {
  return {
    artifactId: 'artifact-voice_registry-test',
    artifactType: 'voice_registry',
    producedBy: 'classifier.voice_role_marker@1.0',
    payload: {
      registry: [
        { roleName: '旁白', category: 'narrator', voiceHint: '冷静', appearanceCount: 2 },
        { roleName: '林晚', category: 'main', voiceHint: '年轻女性', appearanceCount: 2 },
      ],
      unresolved: [],
    },
    metrics: {},
  };
}

async function main() {
  await test('missing adapted_script throws PERF_DESIGNER_NO_ADAPTED_SCRIPT', async () => {
    await assert.rejects(
      () => runPerformanceDesignerAgent({ artifacts: {} }),
      /PERF_DESIGNER_NO_ADAPTED_SCRIPT/,
    );
  });

  await test('empty segments throws PERF_DESIGNER_EMPTY_SEGMENTS', async () => {
    const artifacts = { a: adaptedArtifact([]) };
    await assert.rejects(
      () => runPerformanceDesignerAgent({ artifacts }),
      /PERF_DESIGNER_EMPTY_SEGMENTS/,
    );
  });

  await test('parsePerformanceDesignerOutput filters invalid segment ids and fills bgm fallback', () => {
    const segments = [
      { segmentId: 'seg-001', type: 'narration', text: 't1' },
      { segmentId: 'seg-002', type: 'dialogue', speaker: '林晚', text: 't2' },
    ];
    const out = parsePerformanceDesignerOutput(JSON.stringify({
      sfxList: [
        { atSegmentId: 'seg-001', sfxType: 'AMB', description: '风声' },
        { atSegmentId: 'ghost', sfxType: 'SFX', description: '不存在' },
      ],
      cvDirections: [
        { atSegmentId: 'seg-002', emotion: '压抑', pace: '慢' },
        { atSegmentId: 'ghost', emotion: '无效', pace: '快' },
      ],
    }), segments);
    assert.equal(out.bgmTrack.mood, '未指定');
    assert.equal(out.sfxList.length, 1);
    assert.equal(out.sfxList[0].atSegmentId, 'seg-001');
    assert.equal(out.cvDirections.length, 1);
    assert.equal(out.cvDirections[0].atSegmentId, 'seg-002');
  });

  const runLive = process.env.RUN_LIVE_TESTS === '1' || process.env.RUN_LIVE_TESTS === 'true';
  if (!runLive) {
    console.log('SKIP live performanceDesignerAgent tests. Set RUN_LIVE_TESTS=1 to enable real LLM calls.');
  } else {
    const segments = [
      { segmentId: 'seg-001', type: 'narration', text: '夜风吹进空屋。' },
      { segmentId: 'seg-002', type: 'dialogue', speaker: '林晚', text: '门怎么自己开了？' },
      { segmentId: 'seg-003', type: 'dialogue', speaker: '陈默', text: '先别出声。' },
      { segmentId: 'seg-004', type: 'inner_monologue', speaker: '林晚', text: '他也听见了吗？' },
    ];
    const artifacts = { a1: adaptedArtifact(segments, '第1章'), a2: voiceRegistryArtifact() };
    await test('live designer returns usable payload with whitelisted ids', async () => {
      const { payload, latencyMs, model } = await runPerformanceDesignerAgent({ artifacts });
      assert.ok(model, 'model should be set');
      assert.ok(typeof latencyMs === 'number' && latencyMs >= 0, 'latencyMs');
      assert.ok(payload.bgmTrack && payload.bgmTrack.mood, 'bgmTrack');
      assert.ok(payload.sfxList.length >= 1, 'at least one sfx');
      assert.ok(payload.cvDirections.length >= 1, 'at least one cv direction');
      const validIds = new Set(segments.map((s) => s.segmentId));
      assert.ok(payload.sfxList.every((item) => validIds.has(item.atSegmentId)), 'sfx whitelist');
      assert.ok(payload.cvDirections.every((item) => validIds.has(item.atSegmentId)), 'cv whitelist');
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
