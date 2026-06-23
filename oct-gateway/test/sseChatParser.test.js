'use strict';

/**
 * sseChatParser 回归测试。
 *
 * 这两个纯函数行为保持地抽离自 ai.js streamChatRaw 的逐行 SSE 解析（P0）。
 * 测试重点锁定容易出错的顺序/门控约定：
 *  - usage/model 不依赖 delta 是否存在；
 *  - reasoning/content/toolCalls 仅在 hasDelta 时由调用方处理。
 */
const { describe, it, expect } = globalThis;
const { parseSseLine, extractStreamUpdate } = require('../runtime/sseChatParser');

describe('parseSseLine 单行 SSE 分类', () => {
  it('空行 → empty', () => {
    expect(parseSseLine('').kind).toBe('empty');
    expect(parseSseLine('   ').kind).toBe('empty');
  });

  it('data: [DONE] → done', () => {
    expect(parseSseLine('data: [DONE]').kind).toBe('done');
  });

  it('非 data: 前缀 → non-data', () => {
    expect(parseSseLine('event: ping').kind).toBe('non-data');
    expect(parseSseLine(': keep-alive comment').kind).toBe('non-data');
  });

  it('data: 后非法 JSON → json-error', () => {
    expect(parseSseLine('data: {not json').kind).toBe('json-error');
  });

  it('data: 后合法 JSON → data 且携带 parsed', () => {
    const r = parseSseLine('data: {"model":"m","choices":[{"delta":{"content":"hi"}}]}');
    expect(r.kind).toBe('data');
    expect(r.parsed.model).toBe('m');
    expect(r.parsed.choices[0].delta.content).toBe('hi');
  });

  it('容忍前后空白（trim）', () => {
    expect(parseSseLine('  data: [DONE]  ').kind).toBe('done');
  });
});

describe('extractStreamUpdate 增量提取', () => {
  it('usage 与 model 不依赖 delta 是否存在', () => {
    const u = extractStreamUpdate({ usage: { total_tokens: 5 }, model: 'gpt-x' });
    expect(u.usage).toEqual({ total_tokens: 5 });
    expect(u.model).toBe('gpt-x');
    expect(u.hasDelta).toBe(false);
  });

  it('无 choices/delta 时 hasDelta=false，增量字段为空', () => {
    const u = extractStreamUpdate({});
    expect(u.hasDelta).toBe(false);
    expect(u.reasoningContent).toBe('');
    expect(u.content).toBe('');
    expect(u.toolCalls).toBe(null);
  });

  it('提取 content / reasoning_content', () => {
    const u = extractStreamUpdate({
      choices: [{ delta: { content: '正文', reasoning_content: '思考' } }],
    });
    expect(u.hasDelta).toBe(true);
    expect(u.content).toBe('正文');
    expect(u.reasoningContent).toBe('思考');
  });

  it('提取 tool_calls 数组', () => {
    const u = extractStreamUpdate({
      choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'web_search' } }] } }],
    });
    expect(Array.isArray(u.toolCalls)).toBe(true);
    expect(u.toolCalls[0].function.name).toBe('web_search');
  });

  it('提取 finish_reason', () => {
    const u = extractStreamUpdate({ choices: [{ delta: {}, finish_reason: 'stop' }] });
    expect(u.hasDelta).toBe(true);
    expect(u.finishReason).toBe('stop');
  });

  it('缺失字段回落为安全默认值（null/空串）', () => {
    const u = extractStreamUpdate({ choices: [{ delta: {} }] });
    expect(u.usage).toBe(null);
    expect(u.model).toBe(null);
    expect(u.finishReason).toBe(null);
    expect(u.content).toBe('');
  });
});
