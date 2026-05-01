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

  it('passes clean scripts', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'narration', text: '风吹进屋里。' },
        { segmentId: 'seg-002', type: 'dialogue', speaker: '甲', text: '你来了。' },
        { segmentId: 'seg-003', type: 'inner_monologue', speaker: '甲', text: '不对，屋里有人来过。' },
      ]),
      sourceText: '风吹进屋里。”你来了。”不对，屋里有人来过。',
    });
    expect(report).toEqual({ conclusion: 'pass', issues: [] });
  });

  it('detects dialogue_action_misclassified', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', speaker: '周佳宁', text: '她伸手拿起对讲机。' },
      ]),
    });
    expect(categories(report)).toContain('dialogue_action_misclassified');
  });

  it('detects inner_monologue_third_person', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'inner_monologue', speaker: '周佳宁', text: '她心里忽然有点发紧。' },
      ]),
    });
    expect(categories(report)).toContain('inner_monologue_third_person');
  });

  it('detects speaker_contamination', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', speaker: '检查字数比例', text: '对白文本。' },
      ]),
    });
    expect(categories(report)).toContain('speaker_contamination');
    expect(report.conclusion).toBe('reject');
  });

  it('detects speaker_protocol_residue', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', speaker: '宁默|“醒了？”', text: '醒了？' },
      ]),
    });
    expect(categories(report)).toContain('speaker_protocol_residue');
    expect(report.conclusion).toBe('reject');
  });

  it('detects dialogue_duplicated_in_narration', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'narration', text: '狱卒喊道：“宁默，有人来看你！”' },
        { segmentId: 'seg-002', type: 'dialogue', speaker: '狱卒', text: '宁默，有人来看你！' },
      ]),
    });
    expect(categories(report)).toContain('dialogue_duplicated_in_narration');
    expect(report.conclusion).toBe('reject');
  });

  it('detects voice_registry_pollution_risk', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', speaker: '这是一个非常异常的长speaker名', text: '对白文本。' },
      ]),
    });
    expect(categories(report)).toContain('voice_registry_pollution_risk');
  });
});
