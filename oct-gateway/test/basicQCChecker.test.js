'use strict';

const { describe, it, expect } = globalThis;
const { checkBasicQC } = require('../script_adapter/basicQCChecker');

function payload(segments, totalCharCount) {
  return {
    chapterTitle: '测试章',
    totalCharCount: totalCharCount ?? segments.reduce((sum, segment) => sum + String(segment.text || '').length, 0),
    segments,
  };
}

function categories(report) {
  return report.issues.map((issue) => issue.category);
}

describe('checkBasicQC', () => {
  it('rejects empty scripts', () => {
    const report = checkBasicQC({ adaptedScript: payload([]) });
    expect(report.conclusion).toBe('reject');
    expect(categories(report)).toContain('empty_script');
  });

  it('rejects dialogue and inner monologue without speaker', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', text: '你好' },
        { segmentId: 'seg-002', type: 'inner_monologue', speaker: '   ', text: '他心里一沉。' },
      ]),
    });
    expect(report.conclusion).toBe('reject');
    expect(report.issues.filter((issue) => issue.category === 'missing_speaker')).toHaveLength(2);
  });

  it('rejects AI contamination keywords', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'narration', text: '根据您的要求，以下内容已经改写。' },
      ]),
    });
    expect(report.conclusion).toBe('reject');
    expect(categories(report)).toContain('ai_contamination');
  });

  it('marks narration-only scripts as pass_with_changes', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'narration', text: '旁白一。' },
        { segmentId: 'seg-002', type: 'narration', text: '旁白二。' },
      ]),
    });
    expect(report.conclusion).toBe('pass_with_changes');
    expect(categories(report)).toContain('narration_only');
  });

  it('detects abnormal char ratio', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', speaker: '甲', text: '短。' },
      ], 2),
      sourceText: '这是一段明显更长的原文，用于触发低字数比例检查。'.repeat(10),
    });
    expect(report.conclusion).toBe('pass_with_changes');
    expect(categories(report)).toContain('char_ratio_abnormal');
  });

  it('detects high parse warning ratio', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', speaker: '甲', text: '有效。' },
      ]),
      parseWarnings: [{ line: 1 }, { line: 2 }],
      totalLineCount: 10,
    });
    expect(report.conclusion).toBe('pass_with_changes');
    expect(categories(report)).toContain('parse_warning_high');
  });

  it('detects more than five consecutive narration segments', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'narration', text: '一' },
        { segmentId: 'seg-002', type: 'narration', text: '二' },
        { segmentId: 'seg-003', type: 'narration', text: '三' },
        { segmentId: 'seg-004', type: 'narration', text: '四' },
        { segmentId: 'seg-005', type: 'narration', text: '五' },
        { segmentId: 'seg-006', type: 'narration', text: '六' },
        { segmentId: 'seg-007', type: 'dialogue', speaker: '甲', text: '停。' },
      ]),
    });
    expect(report.conclusion).toBe('pass_with_changes');
    expect(categories(report)).toContain('consecutive_narration');
  });

  it('passes clean scripts', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'narration', text: '风吹进屋里。' },
        { segmentId: 'seg-002', type: 'dialogue', speaker: '甲', text: '你来了。' },
        { segmentId: 'seg-003', type: 'inner_monologue', speaker: '甲', text: '他心里松了一口气。' },
      ]),
      sourceText: '风吹进屋里。“你来了。”他心里松了一口气。',
    });
    expect(report).toEqual({ conclusion: 'pass', issues: [] });
  });
});
