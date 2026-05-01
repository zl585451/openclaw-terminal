'use strict';

const { describe, it, expect } = globalThis;
const { extractQuoteSpans } = require('../script_adapter/quoteSpanExtractor');
const {
  extractInnerVoiceSpans,
  classifyInnerVoiceLine,
  isValidInnerVoiceSpanText,
} = require('../script_adapter/innerVoiceSpanExtractor');

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

  it('extracts short viewpoint reaction as current actor OS', () => {
    const spanDoc = extractQuoteSpans({
      sourceText: [
        '第2章 夫人的心病',
        '来真的？',
        '宁默内心陷入纠结之中。',
      ].join('\n'),
    });
    const result = extractInnerVoiceSpans({ spanDoc, viewpointHint: '宁默' });

    expect(result.spans).toHaveLength(1);
    expect(result.spans[0].speaker).toBe('宁默');
    expect(result.spans[0].text).toBe('来真的？');
  });

  it('extracts thought cue content and keeps prefix as narration', () => {
    const sourceText = '柳儿了然，心头却莫名一凛。她的目光忍不住偷偷飘向画像一角，小脸微微泛红，心中嘀咕：王管事选的这人，真是俊的没边了……';
    const spanDoc = extractQuoteSpans({ sourceText });
    const result = extractInnerVoiceSpans({ spanDoc, viewpointHint: '宁默' });

    expect(result.spans).toHaveLength(1);
    expect(result.spans[0].speaker).toBe('柳儿');
    expect(result.spans[0].text).toBe('王管事选的这人，真是俊的没边了……');
    expect(sourceText.slice(result.spans[0].start, result.spans[0].end)).toBe('王管事选的这人，真是俊的没边了……');
  });

  it('extracts viewpoint question for the current non-protagonist actor', () => {
    const spanDoc = extractQuoteSpans({
      sourceText: [
        '三夫人独自站了一会儿，走回榻边，伸手从诗集下抽出了那张画像。',
        '画上的少年郎君，眉目疏朗，眼神清亮。',
        '王管事说……真人比画像更俊美？',
      ].join('\n'),
    });
    const result = extractInnerVoiceSpans({ spanDoc, viewpointHint: '宁默' });

    expect(result.spans).toHaveLength(1);
    expect(result.spans[0].speaker).toBe('三夫人');
    expect(result.spans[0].text).toBe('王管事说……真人比画像更俊美？');
  });

  it('infers chapter viewpoint without leaking Ningmo into unrelated books', () => {
    const sourceText = [
      '第4章 你是谁',
      '周振山刚回来。他坐在床边，闭上了眼睛。',
      '脑子里还在过白天的细节。',
      '左臂怎么了？',
      '他左臂前不久被划了一刀。',
    ].join('\n');
    const spanDoc = extractQuoteSpans({ sourceText });
    const result = extractInnerVoiceSpans({ spanDoc });

    expect(result.viewpoint).toBe('周振山');
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0].speaker).toBe('周振山');
    expect(result.spans[0].text).toBe('左臂怎么了？');
  });

  it('does not emit OS when no viewpoint can be resolved', () => {
    const spanDoc = extractQuoteSpans({ sourceText: '第1章\n来真的？\n风吹过空屋。' });
    const result = extractInnerVoiceSpans({ spanDoc });

    expect(result.viewpoint).toBe('');
    expect(result.spans).toHaveLength(0);
  });

  it('does not switch current actor for possessive/object mentions', () => {
    const spanDoc = extractQuoteSpans({
      sourceText: [
        '宁默内心陷入纠结之中。',
        '但王大山给出的条件，他实在没办法拒绝。',
        '拒绝就是死！',
        '接受还有活路。',
      ].join('\n'),
    });
    const result = extractInnerVoiceSpans({ spanDoc, viewpointHint: '宁默' });

    expect(result.spans).toHaveLength(1);
    expect(result.spans[0].speaker).toBe('宁默');
    expect(result.spans[0].text).toBe('拒绝就是死！ 接受还有活路。');
  });

  it('rejects polluted OS speaker candidates and tiny fragments', () => {
    const spanDoc = extractQuoteSpans({
      sourceText: [
        '没听过他活着的样子。',
        '可是……怎么可能？',
        '心里那个',
        '幻听',
        '、',
        '故障',
        '、',
        '串频',
        '的解释开始崩塌。',
      ].join('\n'),
    });
    const result = extractInnerVoiceSpans({
      spanDoc,
      viewpointResult: {
        viewpoint: '周佳宁',
        candidates: ['周佳宁', '没听过他', '嗫嚅'],
      },
    });

    expect(result.spans.map((span) => span.speaker)).not.toContain('没听过他');
    expect(result.spans.map((span) => span.text)).not.toContain('幻听');
    expect(isValidInnerVoiceSpanText('欠')).toBe(false);
    expect(isValidInnerVoiceSpanText('幻听')).toBe(false);
    expect(isValidInnerVoiceSpanText('来真的？')).toBe(true);
  });

  it('keeps third-person action and descriptions as narration', () => {
    expect(classifyInnerVoiceLine('宁默眉头皱的很深。').isInnerVoice).toBe(false);
    expect(classifyInnerVoiceLine('他撑开眼皮。').isInnerVoice).toBe(false);
    expect(classifyInnerVoiceLine('油灯微微跳动，看起来格外逼真！').isInnerVoice).toBe(false);
    expect(classifyInnerVoiceLine('自己身上穿着囚衣，全身火辣辣的疼，手脚全是鞭痕的血迹。').isInnerVoice).toBe(false);
  });
});
