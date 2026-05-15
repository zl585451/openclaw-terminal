'use strict';

const assert = require('node:assert');
const {
  runDeliveryPackagerAgent,
  estimateSize,
} = require('../script_adapter/agents/deliveryPackagerAgent');

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
  await test('missing adapted_script throws PACKAGER_NO_ADAPTED_SCRIPT', async () => {
    await assert.rejects(
      () => runDeliveryPackagerAgent({ artifacts: {} }),
      /PACKAGER_NO_ADAPTED_SCRIPT/,
    );
  });

  await test('estimateSize returns 0 B for empty payload', () => {
    assert.equal(estimateSize(null), '0 B');
  });

  await test('packager returns unified package and notes with degraded upstreams', async () => {
    const artifacts = {
      a1: artifact('adapted_script', {
        chapterTitle: '测试章/别名',
        totalCharCount: 256,
        segments: [
          { segmentId: 'seg-001', type: 'narration', text: '旁白' },
          { segmentId: 'seg-002', type: 'dialogue', speaker: '甲', text: '对白' },
        ],
      }),
    };
    const { payload, model } = await runDeliveryPackagerAgent({ artifacts });
    assert.equal(model, 'js-packager');
    assert.equal(payload.manifest.length, 4);
    assert.ok(payload.versionTag.startsWith('audiobook-mvp-'));
    assert.ok(payload.notes.includes('测试章/别名'));
    assert.equal(payload.adapted_script.segments.length, 2);
    assert.equal(payload.voice_markers.registry.length, 0);
    assert.equal(payload.basic_qc_report.conclusion, 'pass');
    assert.ok(payload.manifest[1].size !== '0 B');
    assert.ok(payload.manifest[2].size !== '0 B');
  });

  await test('packager rejects failed quality reports before delivery', async () => {
    const artifacts = {
      a1: artifact('adapted_script', {
        chapterTitle: '第1章',
        totalCharCount: 100,
        segments: [{ segmentId: 'seg-001', type: 'narration', text: '旁白' }],
      }),
      a2: artifact('voice_registry', { registry: [], unresolved: [] }),
      a3: artifact('performance_design', { bgmTrack: { mood: '静', suggestion: '轻' }, sfxList: [], cvDirections: [] }),
      a4: artifact('review_report', {
        conclusion: 'reject',
        issues: [{ severity: 'P0', category: '忠实度', description: '改剧情', suggestion: '回改' }],
      }),
    };
    await assert.rejects(
      () => runDeliveryPackagerAgent({ artifacts }),
      /PACKAGER_REJECTED_BY_QC/,
    );
  });

  const failed = results.filter((item) => !item.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
