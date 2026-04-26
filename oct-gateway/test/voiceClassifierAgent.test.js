'use strict';

/**
 * 角色音统筹 Agent 测试。
 * 默认离线；RUN_LIVE_TESTS=1 时跑真实 LLM（需 SCRIPT_ADAPTER_* 或 SUMMARIZER_* 等）。
 */

const assert = require('node:assert');
const {
  runVoiceClassifierAgent,
  aggregateSpeakers,
  parseVoiceClassifierOutput,
  pickAdaptedScript,
} = require('../script_adapter/agents/voiceClassifierAgent');

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

async function main() {
  await test('empty artifacts throws VOICE_CLASSIFIER_NO_ADAPTED_SCRIPT', async () => {
    await assert.rejects(
      () => runVoiceClassifierAgent({ artifacts: {} }),
      /VOICE_CLASSIFIER_NO_ADAPTED_SCRIPT/,
    );
  });

  await test('empty segments throws VOICE_CLASSIFIER_EMPTY_SEGMENTS', async () => {
    const artifacts = { a: adaptedArtifact([]) };
    await assert.rejects(
      () => runVoiceClassifierAgent({ artifacts }),
      /VOICE_CLASSIFIER_EMPTY_SEGMENTS/,
    );
  });

  await test('aggregateSpeakers counts narration dialogue inner_monologue', () => {
    const segments = [
      { segmentId: '1', type: 'narration', text: '旁白' },
      { segmentId: '2', type: 'dialogue', speaker: '林晚', text: '你好' },
      { segmentId: '3', type: 'dialogue', speaker: '陈默', text: '嗯' },
      { segmentId: '4', type: 'inner_monologue', speaker: '林晚', text: '心想' },
    ];
    const stats = aggregateSpeakers(segments);
    const byName = Object.fromEntries(stats.map((s) => [s.roleName, s.appearanceCount]));
    assert.equal(byName['旁白'], 1);
    assert.equal(byName['林晚'], 2);
    assert.equal(byName['陈默'], 1);
    assert.ok(stats[0].roleName === '林晚', 'sorted by count desc');
  });

  await test('parseVoiceClassifierOutput fixes invalid category and fills missing roles', () => {
    const stats = [
      { roleName: '旁白', appearanceCount: 5 },
      { roleName: '甲', appearanceCount: 2 },
      { roleName: '乙', appearanceCount: 1 },
    ];
    const raw = JSON.stringify({
      registry: [
        { roleName: '旁白', category: 'narrator', voiceHint: '稳', appearanceCount: 999 },
        { roleName: '甲', category: 'bogus', voiceHint: '主', appearanceCount: 1 },
      ],
      unresolved: [],
    });
    const out = parseVoiceClassifierOutput(raw, stats);
    assert.equal(out.registry.length, 3);
    const 甲 = out.registry.find((r) => r.roleName === '甲');
    assert.equal(甲.category, 'support');
    assert.equal(甲.appearanceCount, 2);
    const 乙 = out.registry.find((r) => r.roleName === '乙');
    assert.equal(乙.category, 'support');
    assert.equal(乙.appearanceCount, 1);
    assert.equal(out.registry[0].roleName, '旁白');
    assert.equal(out.registry[0].appearanceCount, 5);
  });

  await test('parseVoiceClassifierOutput recomputes unresolved', () => {
    const stats = [
      { roleName: '旁白', appearanceCount: 1 },
      { roleName: '神秘声', appearanceCount: 1 },
    ];
    const raw = JSON.stringify({
      registry: [
        { roleName: '旁白', category: 'narrator', voiceHint: 'x', appearanceCount: 1 },
        { roleName: '神秘声', category: 'unresolved', voiceHint: 'y', appearanceCount: 1 },
      ],
    });
    const out = parseVoiceClassifierOutput(raw, stats);
    assert.deepEqual(out.unresolved, ['神秘声']);
  });

  await test('pickAdaptedScript finds adapted_script artifact', () => {
    const art = adaptedArtifact([{ segmentId: '1', type: 'narration', text: 't' }]);
    const picked = pickAdaptedScript({ x: art });
    assert.equal(picked.artifactType, 'adapted_script');
  });

  const runLive = process.env.RUN_LIVE_TESTS === '1' || process.env.RUN_LIVE_TESTS === 'true';
  if (!runLive) {
    console.log('SKIP live voiceClassifierAgent tests. Set RUN_LIVE_TESTS=1 to enable real LLM calls.');
  } else {
    const segments = [
      { segmentId: 's1', type: 'narration', text: '夜色沉沉，风从巷口灌进来。' },
      { segmentId: 's2', type: 'dialogue', speaker: '阿青', text: '你来了。' },
      { segmentId: 's3', type: 'dialogue', speaker: '老周', text: '嗯，路上耽搁了。' },
      { segmentId: 's4', type: 'inner_monologue', speaker: '阿青', text: '他到底知道多少？' },
    ];
    const artifacts = { a1: adaptedArtifact(segments, '第1章 试音') };
    await test('live classifier returns registry with five categories and hints', async () => {
      const { payload, latencyMs, model } = await runVoiceClassifierAgent({ artifacts });
      assert.ok(model, 'model should be set');
      assert.ok(typeof latencyMs === 'number' && latencyMs >= 0, 'latencyMs');
      assert.ok(Array.isArray(payload.registry) && payload.registry.length >= 3, 'registry size');
      const valid = new Set(['narrator', 'main', 'support', 'unresolved', 'sfx']);
      for (const r of payload.registry) {
        assert.ok(valid.has(r.category), `category ${r.category}`);
        assert.ok(String(r.voiceHint || '').length > 0, `voiceHint for ${r.roleName}`);
      }
      assert.ok(Array.isArray(payload.unresolved), 'unresolved array');
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
