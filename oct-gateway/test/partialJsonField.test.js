'use strict';

const { describe, it, expect } = globalThis;
const { extractPartialJsonStringField, extractPartialCanvasArgs } = require('../runtime/partialJsonField');

describe('extractPartialJsonStringField', () => {
  it('抠出已经完整闭合的字符串字段', () => {
    const json = '{"action":"create","content":"hello world"}';
    expect(extractPartialJsonStringField(json, 'content')).toBe('hello world');
  });

  it('字段值还在流式到达中（没有闭合引号）时，返回目前已收到的部分', () => {
    const partial = '{"action":"create","content":"<html><body><div clas';
    expect(extractPartialJsonStringField(partial, 'content')).toBe('<html><body><div clas');
  });

  it('字段尚未出现在已收到的文本里时返回 undefined', () => {
    const partial = '{"action":"crea';
    expect(extractPartialJsonStringField(partial, 'content')).toBeUndefined();
  });

  it('正确处理转义字符（引号/换行/反斜杠）', () => {
    const json = '{"content":"line1\\nline2 say \\"hi\\" path C:\\\\x"}';
    expect(extractPartialJsonStringField(json, 'content')).toBe('line1\nline2 say "hi" path C:\\x');
  });

  it('末尾是不完整的转义序列时，停在转义符之前，不猜测', () => {
    const partial = '{"content":"abc\\';
    expect(extractPartialJsonStringField(partial, 'content')).toBe('abc');
  });

  it('末尾是不完整的 \\u 转义序列时，停在转义符之前', () => {
    const partial = '{"content":"abc\\u00';
    expect(extractPartialJsonStringField(partial, 'content')).toBe('abc');
  });

  it('正确解码完整的 \\u 转义序列', () => {
    const json = '{"content":"\\u4f60\\u597d"}';
    expect(extractPartialJsonStringField(json, 'content')).toBe('你好');
  });

  it('遇到不带反斜杠的引号就认为字符串结束，不管后面是否还有更多 JSON', () => {
    const json = '{"content":"done"  ,"language":"mermaid"}';
    expect(extractPartialJsonStringField(json, 'content')).toBe('done');
  });

  it('空输入返回 undefined', () => {
    expect(extractPartialJsonStringField('', 'content')).toBeUndefined();
    expect(extractPartialJsonStringField(null, 'content')).toBeUndefined();
  });
});

describe('extractPartialCanvasArgs', () => {
  it('从流式片段里同时抠出多个字段', () => {
    const partial = '{"action":"create","title":"深夜电台方案","mode":"html","content":"<html><body><h1>深夜';
    const args = extractPartialCanvasArgs(partial);
    expect(args.action).toBe('create');
    expect(args.title).toBe('深夜电台方案');
    expect(args.mode).toBe('html');
    expect(args.content).toBe('<html><body><h1>深夜');
    expect(args.documentId).toBeUndefined();
  });

  it('什么字段都还没收到时返回空对象', () => {
    expect(extractPartialCanvasArgs('{"acti')).toEqual({});
  });
});
