'use strict';

const { describe, it, expect } = globalThis;
const { mergeClassifiedSegments } = require('../script_adapter/classifiedMerger');

function cls(type, speaker, text, paraId = 'P1') {
  return { paraId, type, speaker, text };
}

describe('mergeClassifiedSegments', () => {
  // 样例4：混合段落拆分
  it('handles mixed paragraphs without duplication', () => {
    const classifications = [
      cls('narration', undefined, '周佳宁低声问。', 'P5'),
      cls('dialogue', '周佳宁', '妈，你怎么不进去？', 'P5'),
      cls('narration', undefined, '她心里忽然有点发紧。', 'P5'),
    ];
    const rewritten = new Map();
    const originalParagraphs = [
      { id: 'P5', text: '周佳宁低声问："妈，你怎么不进去？"她心里忽然有点发紧。' },
    ];

    const { payload, warnings } = mergeClassifiedSegments({
      classifications,
      rewrittenTexts: rewritten,
      originalParagraphs,
      chapterTitle: '测试章',
    });

    expect(payload.segments).toHaveLength(3);
    // 每个segment只含对应片段，不重复整段原文
    expect(payload.segments[0].text).toBe('周佳宁低声问。');
    expect(payload.segments[0].type).toBe('narration');
    expect(payload.segments[1].text).toBe('妈，你怎么不进去？');
    expect(payload.segments[1].type).toBe('dialogue');
    expect(payload.segments[1].speaker).toBe('周佳宁');
    expect(payload.segments[2].text).toBe('她心里忽然有点发紧。');
    expect(payload.segments[2].type).toBe('narration');
  });

  it('narration uses rewritten text when available', () => {
    const classifications = [cls('narration', undefined, '三月的风从楼道窗户钻进来，带着一股铁锈和灰尘的混合味道。', 'P1')];
    const rewritten = new Map([['P1', '三月的风从楼道口灌进来，带着铁锈混着灰的味儿。']]);
    const { payload } = mergeClassifiedSegments({ classifications, rewrittenTexts: rewritten, originalParagraphs: [] });
    expect(payload.segments[0].text).toBe('三月的风从楼道口灌进来，带着铁锈混着灰的味儿。');
  });

  it('narration falls back to original when no rewritten text', () => {
    const classifications = [cls('narration', undefined, '原始旁白文本。', 'P1')];
    const { payload } = mergeClassifiedSegments({ classifications, rewrittenTexts: new Map(), originalParagraphs: [] });
    expect(payload.segments[0].text).toBe('原始旁白文本。');
  });

  it('dialogue uses original text', () => {
    const classifications = [cls('dialogue', '周佳宁', '妈，你怎么不进去？', 'P1')];
    const { payload } = mergeClassifiedSegments({ classifications, rewrittenTexts: new Map(), originalParagraphs: [] });
    expect(payload.segments[0].text).toBe('妈，你怎么不进去？');
    expect(payload.segments[0].speaker).toBe('周佳宁');
  });

  it('filters out empty text segments', () => {
    const classifications = [
      cls('narration', undefined, '有效旁白。', 'P1'),
      cls('dialogue', '周佳宁', '', 'P2'), // 空文本
    ];
    const { payload } = mergeClassifiedSegments({ classifications, rewrittenTexts: new Map(), originalParagraphs: [] });
    expect(payload.segments).toHaveLength(1);
    expect(payload.segments[0].text).toBe('有效旁白。');
  });

  it('throws when no valid segments', () => {
    expect(() =>
      mergeClassifiedSegments({ classifications: [], rewrittenTexts: new Map(), originalParagraphs: [] })
    ).toThrow();
  });

  it('assigns sequential segmentIds', () => {
    const classifications = [
      cls('narration', undefined, '第一段。', 'P1'),
      cls('dialogue', '周', '第二段。', 'P2'),
      cls('narration', undefined, '第三段。', 'P3'),
    ];
    const { payload } = mergeClassifiedSegments({ classifications, rewrittenTexts: new Map(), originalParagraphs: [] });
    expect(payload.segments[0].segmentId).toBe('seg-001');
    expect(payload.segments[1].segmentId).toBe('seg-002');
    expect(payload.segments[2].segmentId).toBe('seg-003');
  });

  it('computes totalCharCount correctly', () => {
    const classifications = [
      cls('narration', undefined, '旁白一。', 'P1'),
      cls('dialogue', '甲', '对白一。', 'P2'),
    ];
    const { payload } = mergeClassifiedSegments({ classifications, rewrittenTexts: new Map(), originalParagraphs: [] });
    expect(payload.totalCharCount).toBe(8); // "旁白一。"=4 + "对白一。"=4
  });
});
