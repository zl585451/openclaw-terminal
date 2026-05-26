'use strict';

const { describe, it, expect } = globalThis;
const { parseQuoteAttributionLines } = require('../script_adapter/quoteAttributionParser');
const {
  buildAttributionInput,
  hasDocumentReadingTrigger,
} = require('../script_adapter/agents/quoteAttributionAgent');

describe('quoteAttributionParser', () => {
  it('parses valid attribution line protocol', () => {
    const parsed = parseQuoteAttributionLines('q001|dialogue|狱卒|high|左侧写“狱卒的声音”', { quoteIds: ['q001'] });
    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.attributions[0]).toEqual({
      quoteId: 'q001',
      voiceType: 'dialogue',
      speaker: '狱卒',
      confidence: 'high',
      evidence: '左侧写“狱卒的声音”',
      raw: 'q001|dialogue|狱卒|high|左侧写“狱卒的声音”',
    });
  });

  it('rejects polluted speaker and unknown quote id', () => {
    const parsed = parseQuoteAttributionLines([
      'q001|dialogue|角色名|high|污染',
      'q999|dialogue|王大山|high|不存在',
    ].join('\n'), { quoteIds: ['q001'] });
    expect(parsed.attributions).toHaveLength(0);
    expect(parsed.warnings.map((item) => item.reason)).toEqual(['invalid_speaker', 'unknown_quote_id']);
  });

  it('normalizes Chinese voice type and confidence', () => {
    const parsed = parseQuoteAttributionLines('q002|系统音|系统音|高|方括号提示', { quoteIds: ['q002'] });
    expect(parsed.attributions[0].voiceType).toBe('system_voice');
    expect(parsed.attributions[0].confidence).toBe('high');
    expect(parsed.attributions[0].speaker).toBe('系统音');
  });

  it('accepts document reading attribution output', () => {
    const parsed = parseQuoteAttributionLines('q003|document_reading|文献|medium|kindHint 命中文献阅读', { quoteIds: ['q003'] });
    expect(parsed.warnings).toHaveLength(0);
    expect(parsed.attributions[0].voiceType).toBe('document_reading');
    expect(parsed.attributions[0].speaker).toBe('文献');
  });

  it('adds document reading hint when left context contains reading trigger', () => {
    const input = buildAttributionInput({
      chapterTitle: '测试章节',
      quotes: [{
        quoteId: 'q001',
        text: '太玄经第一卷',
        leftContext: '他翻开旧书，扉页上',
        rightContext: '几个字微微发亮。',
      }],
    });

    expect(input).toContain('"isDocumentReading": true');
    expect(input).toContain('"kindHint": "document_reading"');
  });

  it('checks document reading triggers only inside the left-context tail window', () => {
    expect(hasDocumentReadingTrigger(`${'远处'.repeat(120)}扉页上`)).toBe(true);
    expect(hasDocumentReadingTrigger(`目录${'远处'.repeat(120)}`)).toBe(false);
  });
});
