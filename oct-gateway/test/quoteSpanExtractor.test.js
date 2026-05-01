'use strict';

const { describe, it, expect } = globalThis;
const { extractQuoteSpans, reconstructFromSpans } = require('../script_adapter/quoteSpanExtractor');

describe('quoteSpanExtractor', () => {
  it('extracts curly quotes and reconstructs original source', () => {
    const sourceText = '第1章 借种\n狱卒的声音响起：“宁默，有人来看你！”脚步声远去。';
    const doc = extractQuoteSpans({ sourceText });
    expect(doc.chapterTitle).toBe('第1章 借种');
    expect(doc.quotes).toHaveLength(1);
    expect(doc.quotes[0].quoteId).toBe('q001');
    expect(doc.quotes[0].text).toBe('宁默，有人来看你！');
    expect(sourceText.slice(doc.quotes[0].start, doc.quotes[0].end)).toBe('“宁默，有人来看你！”');
    expect(reconstructFromSpans(doc)).toBe(sourceText);
  });

  it('extracts system bracket voice as system hint', () => {
    const sourceText = '耳边忽然响起【叮，系统已激活】她愣住了。';
    const doc = extractQuoteSpans({ sourceText });
    expect(doc.quotes).toHaveLength(1);
    expect(doc.quotes[0].kindHint).toBe('system_voice');
    expect(doc.quotes[0].text).toBe('叮，系统已激活');
    expect(reconstructFromSpans(doc)).toBe(sourceText);
  });

  it('keeps narration gaps outside quote marks', () => {
    const sourceText = '王大山道：“醒了？”宁默没说话。“感觉如何？”';
    const doc = extractQuoteSpans({ sourceText });
    expect(doc.narrationGaps.map((gap) => gap.text)).toEqual(['王大山道：', '宁默没说话。']);
    expect(doc.quotes.map((quote) => quote.text)).toEqual(['醒了？', '感觉如何？']);
    expect(reconstructFromSpans(doc)).toBe(sourceText);
  });
});
