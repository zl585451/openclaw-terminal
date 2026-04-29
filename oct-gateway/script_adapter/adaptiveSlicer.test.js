'use strict';

const assert = require('node:assert');
const { createAdaptiveSlices, getAdaptiveSliceCount, mergeSlicePayloads } = require('./adaptiveSlicer');

const results = [];

function makeParagraphs(count, sentence = '这一段用于测试长章切片，包含足够的中文字符和清晰的段落边界。') {
  return Array.from({ length: count }, (_, index) => `${index + 1}。${sentence.repeat(4)}`).join('\n\n');
}

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: error?.message || String(error) });
    console.log(`FAIL ${name}: ${error?.message || String(error)}`);
  }
}

function expectContinuousSegmentIds(segments) {
  for (let index = 0; index < segments.length; index += 1) {
    assert.equal(segments[index].segmentId, `seg-${String(index + 1).padStart(3, '0')}`);
  }
}

test('selects adaptive slice count by source length', () => {
  assert.equal(getAdaptiveSliceCount(2500), 1);
  assert.equal(getAdaptiveSliceCount(2501), 2);
  assert.equal(getAdaptiveSliceCount(4000), 2);
  assert.equal(getAdaptiveSliceCount(4001), 3);
});

test('keeps short chapters in a single worker without anchors', () => {
  const slices = createAdaptiveSlices('短章正文。', { anchorSize: 200 });
  assert.equal(slices.length, 1);
  assert.equal(slices[0].coreText, '短章正文。');
  assert.equal(slices[0].previousAnchor, '');
  assert.equal(slices[0].nextAnchor, '');
});

test('splits 2500-4000 chars into two paragraph-boundary slices with anchors', () => {
  const source = makeParagraphs(24);
  assert.ok(source.length > 2500);
  assert.ok(source.length <= 4000);

  const slices = createAdaptiveSlices(source, { anchorSize: 200 });
  assert.equal(slices.length, 2);
  assert.equal(slices[0].coreEnd, slices[1].coreStart);
  assert.equal(source[slices[0].coreEnd - 1], '\n');
  assert.ok(slices[0].nextAnchor.length <= 200);
  assert.ok(slices[1].previousAnchor.length <= 200);
});

test('splits chapters above 4000 chars into three slices', () => {
  const source = makeParagraphs(36);
  assert.ok(source.length > 4000);

  const slices = createAdaptiveSlices(source, { anchorSize: 200 });
  assert.equal(slices.length, 3);
  assert.deepEqual(slices.map((slice) => slice.total), [3, 3, 3]);
  assert.equal(slices[0].coreEnd, slices[1].coreStart);
  assert.equal(slices[1].coreEnd, slices[2].coreStart);
});

test('merges slice payloads, removes adjacent anchor duplicates, and renumbers globally', () => {
  const payload = mergeSlicePayloads([
    {
      ok: true,
      payload: {
        chapterTitle: '长章',
        segments: [
          { segmentId: 'seg-001', type: 'narration', text: '上片正文' },
          { segmentId: 'seg-002', type: 'dialogue', speaker: '林晚', text: '重复锚点' },
        ],
      },
    },
    {
      ok: true,
      payload: {
        segments: [
          { segmentId: 'seg-001', type: 'dialogue', speaker: '林晚', text: '重复锚点' },
          { segmentId: 'seg-002', type: 'inner_monologue', speaker: '林晚', text: '她知道不能停。' },
        ],
      },
    },
  ]);

  assert.deepEqual(payload, {
    chapterTitle: '长章',
    totalCharCount: '上片正文重复锚点她知道不能停。'.length,
    segments: [
      { segmentId: 'seg-001', type: 'narration', text: '上片正文' },
      { segmentId: 'seg-002', type: 'dialogue', speaker: '林晚', text: '重复锚点' },
      { segmentId: 'seg-003', type: 'inner_monologue', speaker: '林晚', text: '她知道不能停。' },
    ],
  });
});

test('keeps degraded slice placeholders without blocking successful slices', () => {
  const payload = mergeSlicePayloads([
    {
      ok: true,
      payload: {
        segments: [{ segmentId: 'seg-001', type: 'narration', text: '成功片段' }],
      },
    },
    {
      ok: false,
      sliceIndex: 2,
      error: 'timeout',
    },
  ]);

  assert.equal(payload.segments.length, 2);
  assert.equal(payload.segments[1].type, 'narration');
  assert.ok(payload.segments[1].text.includes('第 2 片改编失败'));
  expectContinuousSegmentIds(payload.segments);
});

const failed = results.filter((item) => !item.ok);
console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
