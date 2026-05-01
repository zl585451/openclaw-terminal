'use strict';

const { describe, it, expect } = globalThis;
const { extractQuoteSpans } = require('../script_adapter/quoteSpanExtractor');
const { extractInnerVoiceSpans, classifyInnerVoiceLine } = require('../script_adapter/innerVoiceSpanExtractor');

describe('innerVoiceSpanExtractor', () => {
  it('extracts contiguous protagonist OS from narration gaps', () => {
    const sourceText = [
      '第1章 借种',
      '“宁解元——”',
      '宁默隐约听到有人说话，眼皮动了动。',
      '嘶~',
      '疼！',
      '等……下！',
      '不应该只是腰酸么，怎么每一寸肌肤都像被炭火撩过？',
      '难道精疲力尽后，又被张秘书掌握了主动权？',
      '但是宁解元是什么鬼？',
      '他撑开眼皮。',
    ].join('\n');
    const spanDoc = extractQuoteSpans({ sourceText });
    const result = extractInnerVoiceSpans({ spanDoc, viewpointHint: '宁默' });

    expect(result.spans).toHaveLength(1);
    expect(result.spans[0].speaker).toBe('宁默');
    expect(result.spans[0].text).toBe('嘶~ 疼！ 等……下！ 不应该只是腰酸么，怎么每一寸肌肤都像被炭火撩过？ 难道精疲力尽后，又被张秘书掌握了主动权？ 但是宁解元是什么鬼？');
  });

  it('extracts short death-row reaction as OS', () => {
    const spanDoc = extractQuoteSpans({
      sourceText: [
        '狱卒放下木盘。',
        '断头饭？',
        '我干什么了？',
        '嘶！',
        '宁默脑海中突然一阵刺痛。',
      ].join('\n'),
    });
    const result = extractInnerVoiceSpans({ spanDoc, viewpointHint: '宁默' });

    expect(result.spans).toHaveLength(1);
    expect(result.spans[0].text).toBe('断头饭？ 我干什么了？ 嘶！');
  });

  it('keeps third-person action and descriptions as narration', () => {
    expect(classifyInnerVoiceLine('宁默眉头皱的很深。').isInnerVoice).toBe(false);
    expect(classifyInnerVoiceLine('他撑开眼皮。').isInnerVoice).toBe(false);
    expect(classifyInnerVoiceLine('油灯微微跳动，看起来格外逼真！').isInnerVoice).toBe(false);
    expect(classifyInnerVoiceLine('自己身上穿着囚衣，全身火辣辣的疼，手脚全是鞭痕的血迹。').isInnerVoice).toBe(false);
  });
});
