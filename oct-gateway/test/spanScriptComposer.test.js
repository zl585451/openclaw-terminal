'use strict';

const { describe, it, expect } = globalThis;
const { extractQuoteSpans } = require('../script_adapter/quoteSpanExtractor');
const { composeScriptFromSpans } = require('../script_adapter/spanScriptComposer');

describe('spanScriptComposer', () => {
  it('composes narration and dialogue without duplicating quoted text in narration', () => {
    const sourceText = '第1章 借种\n狱卒的声音响起：“宁默，有人来看你！”随后脚步声远去。';
    const spanDoc = extractQuoteSpans({ sourceText });
    const result = composeScriptFromSpans({
      spanDoc,
      attributions: [
        { quoteId: 'q001', voiceType: 'dialogue', speaker: '狱卒', confidence: 'high', evidence: '狱卒的声音' },
      ],
    });

    expect(result.payload.segments.map((segment) => segment.type)).toEqual(['narration', 'dialogue', 'narration']);
    expect(result.payload.segments[1].speaker).toBe('狱卒');
    expect(result.payload.segments[1].text).toBe('宁默，有人来看你！');
    expect(result.payload.segments[0].text.includes('宁默，有人来看你！')).toBe(false);
    expect(result.payload.segments[2].text.includes('宁默，有人来看你！')).toBe(false);
  });

  it('maps system voice to compatible dialogue segment with system speaker', () => {
    const spanDoc = extractQuoteSpans({ sourceText: '耳边响起【叮，系统已激活】。' });
    const result = composeScriptFromSpans({
      spanDoc,
      attributions: [
        { quoteId: 'q001', voiceType: 'system_voice', speaker: '系统音', confidence: 'high', evidence: '方括号提示' },
      ],
    });
    expect(result.payload.segments[0].type).toBe('narration');
    expect(result.payload.segments[1].type).toBe('dialogue');
    expect(result.payload.segments[1].speaker).toBe('系统音');
    expect(result.payload.segments[1].text).toBe('叮，系统已激活');
  });

  it('keeps document reading attributions as document reading segments', () => {
    const spanDoc = extractQuoteSpans({ sourceText: '他翻到那页，上面写着“太玄经第一卷”。' });
    const result = composeScriptFromSpans({
      spanDoc,
      attributions: [
        { quoteId: 'q001', voiceType: 'document_reading', speaker: '文献', confidence: 'medium', evidence: '上面写着' },
      ],
    });

    expect(result.payload.segments[1].type).toBe('document_reading');
    expect(result.payload.segments[1].speaker).toBe('文献');
    expect(result.payload.segments[1].text).toBe('太玄经第一卷');
  });

  it('normalizes pure sfx away from system speaker', () => {
    const spanDoc = extractQuoteSpans({ sourceText: '门内传来【咚】的一声。' });
    const result = composeScriptFromSpans({
      spanDoc,
      attributions: [
        { quoteId: 'q001', voiceType: 'system_voice', speaker: '系统音', confidence: 'medium', evidence: '方括号拟声' },
      ],
    });
    expect(result.payload.segments[1].type).toBe('dialogue');
    expect(result.payload.segments[1].speaker).toBe('SFX');
    expect(result.payload.segments[1].text).toBe('咚');
  });

  it('inserts inner voice spans inside narration gaps without duplication', () => {
    const spanDoc = extractQuoteSpans({
      sourceText: [
        '第1章 借种',
        '“宁解元——”',
        '宁默隐约听到有人说话。',
        '嘶~',
        '疼！',
        '他撑开眼皮。',
      ].join('\n'),
    });
    const result = composeScriptFromSpans({
      spanDoc,
      attributions: [
        { quoteId: 'q001', voiceType: 'dialogue', speaker: '未定男声A', confidence: 'low', evidence: '开场无明确身份' },
      ],
      innerVoiceSpans: [
        {
          osId: 'os001',
          gapId: 'n002',
          start: spanDoc.sourceText.indexOf('嘶~'),
          end: spanDoc.sourceText.indexOf('他撑开眼皮。') - 1,
          speaker: '宁默',
          text: '嘶~ 疼！',
          confidence: 'high',
          evidence: 'short_reaction',
        },
      ],
    });

    expect(result.payload.segments.map((segment) => segment.type)).toEqual(['dialogue', 'narration', 'inner_monologue', 'narration']);
    expect(result.payload.segments[2].speaker).toBe('宁默');
    expect(result.payload.segments[2].text).toBe('嘶~ 疼！');
    expect(result.payload.segments[1].text.includes('嘶')).toBe(false);
    expect(result.payload.segments[3].text.includes('疼')).toBe(false);
  });

  it('drops standalone cue narration and extracts standalone sfx lines', () => {
    const spanDoc = extractQuoteSpans({
      sourceText: [
        '第4章 你是谁',
        '周振山揉了揉后颈。',
        '咔',
        '声。',
        '她忽然开口问道：',
        '“你是谁？”',
      ].join('\n'),
    });
    const result = composeScriptFromSpans({
      spanDoc,
      attributions: [
        { quoteId: 'q001', voiceType: 'dialogue', speaker: '周振山', confidence: 'high', evidence: 'question' },
      ],
    });

    expect(result.payload.segments.map((segment) => `${segment.type}:${segment.speaker || '旁白'}:${segment.text}`)).toEqual([
      'narration:旁白:周振山揉了揉后颈。',
      'dialogue:SFX:咔',
      'narration:旁白:声。',
      'dialogue:周振山:你是谁？',
    ]);
  });
});
