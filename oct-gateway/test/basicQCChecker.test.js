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
      sourceText: '甲站在门口。风吹进屋里。”你来了。”不对，屋里有人来过。',
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

  it('detects inner_monologue_action_misclassified', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'inner_monologue', speaker: '宁默', text: '他撑开眼皮。' },
      ]),
    });
    expect(categories(report)).toContain('inner_monologue_action_misclassified');
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
        { segmentId: 'seg-002', type: 'dialogue', speaker: '狱卒', text: '宁默，有人来看你！', quoteId: 'q001' },
      ]),
    });
    expect(categories(report)).toContain('dialogue_duplicated_in_narration');
    expect(report.conclusion).toBe('reject');
  });

  it('does not reject repeated short status phrases across narration and OS', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'narration', text: '双方各执一词，证据不足。' },
        { segmentId: 'seg-002', type: 'inner_monologue', speaker: '周佳宁', text: '证据不足' },
      ]),
      sourceText: '周佳宁翻到旧案：双方各执一词，证据不足。后面又写着“证据不足”。',
    });
    expect(categories(report)).not.toContain('dialogue_duplicated_in_narration');
  });

  it('detects voice_registry_pollution_risk', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', speaker: '这是一个非常异常的长speaker名', text: '对白文本。' },
      ]),
    });
    expect(categories(report)).toContain('voice_registry_pollution_risk');
  });

  it('detects narration cue residue', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'narration', text: '苏尘：' },
        { segmentId: 'seg-002', type: 'dialogue', speaker: '苏尘', text: '……' },
      ]),
    });
    expect(categories(report)).toContain('narration_cue_residue');
  });

  it('detects sfx assigned to character speaker', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', speaker: '周振山', text: '咚' },
      ]),
    });
    expect(categories(report)).toContain('sfx_role_misclassified');
  });

  it('detects pure sfx mislabeled as system voice but allows real system cue', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', speaker: '系统音', text: '咚' },
        { segmentId: 'seg-002', type: 'dialogue', speaker: '系统音', text: '叮，系统已激活' },
      ]),
    });
    expect(categories(report)).toContain('sfx_system_label_misclassified');
    expect(report.issues.filter((issue) => issue.category === 'sfx_system_label_misclassified')).toHaveLength(1);
  });

  it('allows pure sfx assigned to SFX or device speakers', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', speaker: 'SFX', text: '咚' },
        { segmentId: 'seg-002', type: 'dialogue', speaker: '对讲机', text: '滋啦……' },
        { segmentId: 'seg-003', type: 'dialogue', speaker: 'SFX', text: '滋啦……滋啦……' },
        { segmentId: 'seg-004', type: 'dialogue', speaker: 'SFX', text: '沙沙……沙沙……' },
        { segmentId: 'seg-005', type: 'dialogue', speaker: 'SFX', text: '咯咯' },
      ]),
    });
    expect(categories(report)).not.toContain('sfx_role_misclassified');
    expect(categories(report)).not.toContain('sfx_system_label_misclassified');
    expect(categories(report)).not.toContain('sfx_text_invalid');
  });

  it('detects invalid SFX text and OS fragments', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'dialogue', speaker: 'SFX', text: '84' },
        { segmentId: 'seg-002', type: 'inner_monologue', speaker: '周佳宁', text: '欠' },
        { segmentId: 'seg-003', type: 'inner_monologue', speaker: '周佳宁', text: '来真的？' },
        { segmentId: 'seg-004', type: 'inner_monologue', speaker: '嗫嚅', text: '来真的？' },
      ]),
    });
    expect(categories(report)).toContain('sfx_text_invalid');
    expect(categories(report)).toContain('inner_monologue_fragment');
    expect(categories(report)).toContain('inner_monologue_speaker_invalid');
    expect(report.issues.filter((issue) => issue.category === 'inner_monologue_fragment')).toHaveLength(1);
  });

  it('rejects foreign inner voice speaker not present in source text', () => {
    const report = checkBasicQC({
      adaptedScript: payload([
        { segmentId: 'seg-001', type: 'inner_monologue', speaker: '宁默', text: '左臂怎么了？' },
      ]),
      sourceText: '周振山躺在床上，想起那个女声说起他的左臂。',
    });
    expect(report.conclusion).toBe('reject');
    expect(categories(report)).toContain('foreign_inner_voice_speaker');
  });
});
