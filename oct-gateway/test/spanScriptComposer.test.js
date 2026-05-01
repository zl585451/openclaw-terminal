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
});
