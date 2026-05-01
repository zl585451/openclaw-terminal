'use strict';

const { describe, it, expect } = globalThis;
const { parseQuoteAttributionLines } = require('../script_adapter/quoteAttributionParser');

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
});
