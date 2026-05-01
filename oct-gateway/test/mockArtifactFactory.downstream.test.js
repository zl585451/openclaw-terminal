'use strict';

/**
 * 验证：下游 mock 消费上游 adapted_script（segmentId / speaker / 统计与 manifest 对齐）。
 */

const assert = require('node:assert');
const { createArtifactForAgent, findAdaptedScriptPayload } = require('../script_adapter/mockArtifactFactory');

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

function adaptedEnvelope(payload) {
  return {
    artifactId: 'artifact-adapted_script-test',
    artifactType: 'adapted_script',
    producedBy: 'adapter.audiobook_text_rewriter@1.0',
    payload,
    metrics: {},
  };
}

async function main() {
  const customPayload = {
    chapterTitle: '测试章/别名',
    totalCharCount: 120,
    segments: [
      { segmentId: 'custom-n-1', type: 'narration', text: '旁白一段', rewriteNote: 'r' },
      { segmentId: 'custom-d-1', type: 'dialogue', speaker: '角色甲', text: '对白', rewriteNote: 'r' },
      { segmentId: 'custom-d-2', type: 'dialogue', speaker: '角色乙', text: '回应', rewriteNote: 'r' },
    ],
  };
  const artifacts = { a1: adaptedEnvelope(customPayload) };

  await test('findAdaptedScriptPayload returns payload', () => {
    const p = findAdaptedScriptPayload(artifacts);
    assert.equal(p.chapterTitle, '测试章/别名');
    assert.equal(p.segments.length, 3);
  });

  await test('voice_registry uses speakers from segments', async () => {
    const art = await createArtifactForAgent('classifier.voice_role_marker@1.0', '角色音统筹', { artifacts, realAgentsOverride: 'off' });
    const names = art.payload.registry.map((r) => r.roleName);
    assert.ok(names.includes('旁白'));
    assert.ok(names.includes('角色甲'));
    assert.ok(names.includes('角色乙'));
  });

  await test('performance_design uses real segmentId', async () => {
    const art = await createArtifactForAgent('designer.performance_audio@1.0', '演播设计师', { artifacts, realAgentsOverride: 'off' });
    const ids = art.payload.sfxList.map((x) => x.atSegmentId);
    assert.ok(ids.includes('custom-n-1'));
    assert.ok(art.payload.cvDirections.every((d) => String(d.atSegmentId).startsWith('custom-')));
  });

  await test('review_report references segment stats', async () => {
    const art = await createArtifactForAgent('reviewer.production_quality@1.0', '质检', { artifacts, realAgentsOverride: 'off' });
    assert.equal(art.payload.conclusion, 'pass');
    assert.equal(art.payload.issues.length, 0);
  });

  await test('final_package manifest uses chapterTitle slug', async () => {
    const art = await createArtifactForAgent('packager.content_delivery@1.0', '打包', { artifacts, realAgentsOverride: 'off' });
    assert.ok(art.payload.manifest[0].name.includes('测试章'));
    assert.ok(art.payload.versionTag.includes('segments-3'));
    assert.equal(art.payload.adapted_script.segments.length, 3);
    assert.equal(art.payload.basic_qc_report.conclusion, 'pass');
  });

  const failed = results.filter((item) => !item.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
