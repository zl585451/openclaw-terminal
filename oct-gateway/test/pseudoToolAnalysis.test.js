'use strict';

/**
 * analyzePseudoToolUsage 回归测试。
 *
 * 该纯函数行为保持地抽离自 ai.js streamChatRaw 的「伪工具判定」内联块（P0）。
 * 本测试锁定其决策分支，保证抽离前后行为一致。
 */
const { describe, it, expect } = globalThis;
const { createPseudoToolCompat } = require('../runtime/pseudoToolCompat');

function makeCompat() {
  const toolLoader = {
    getDefinitions: () => [
      { function: { name: 'web_search' } },
      { function: { name: 'canvas' } },
    ],
  };
  const logger = { warn() {}, info() {}, debug() {} };
  return createPseudoToolCompat({ toolLoader, logger });
}

describe('analyzePseudoToolUsage 伪工具判定（行为保持抽离）', () => {
  const compat = makeCompat();
  const analyze = (args) => compat.analyzePseudoToolUsage(args);

  it('supportsTools=false 时短路：不检测、不残留、不触发安全网', () => {
    const r = analyze({ text: 'web_search({"query":"hi"})', supportsTools: false, toolReliability: 'loose' });
    expect(r.pseudoToolCalls).toEqual([]);
    expect(r.residueDetected).toBe(false);
    expect(r.strictFallbackTriggered).toBe(false);
  });

  it('loose + 函数风格伪调用 → 提取出调用', () => {
    const r = analyze({ text: 'web_search({"query":"hi"})', supportsTools: true, toolReliability: 'loose' });
    expect(r.pseudoToolCalls.length).toBe(1);
    expect(r.pseudoToolCalls[0].function.name).toBe('web_search');
    expect(r.strictFallbackTriggered).toBe(false);
  });

  it('loose + 纯文本 → 不提取任何调用', () => {
    const r = analyze({ text: '这是一段普通回复，没有任何工具调用。', supportsTools: true, toolReliability: 'loose' });
    expect(r.pseudoToolCalls).toEqual([]);
    expect(r.residueDetected).toBe(false);
    expect(r.strictFallbackTriggered).toBe(false);
  });

  it('strict + 纯文本（无残留）→ 不走伪检测、不触发安全网', () => {
    const r = analyze({ text: '一切正常的最终回答。', supportsTools: true, toolReliability: 'strict' });
    expect(r.pseudoToolCalls).toEqual([]);
    expect(r.strictFallbackTriggered).toBe(false);
  });

  it('strict + {"name":"web_search"} 残留 → 触发安全网降级', () => {
    const r = analyze({ text: '好的 {"name":"web_search","arguments":{}}', supportsTools: true, toolReliability: 'strict' });
    expect(r.strictFallbackTriggered).toBe(true);
  });

  it('strict + canvas("create"...) 残留 → 触发安全网降级', () => {
    const r = analyze({ text: '我来画图 canvas("create", {})', supportsTools: true, toolReliability: 'strict' });
    expect(r.strictFallbackTriggered).toBe(true);
  });

  it('supportsTools=true 时 <tool_call> 残留被识别为 residueDetected', () => {
    const r = analyze({ text: '正文 <tool_call>x</tool_call>', supportsTools: true, toolReliability: 'loose' });
    expect(r.residueDetected).toBe(true);
  });

  it('strict + <tool_call> 残留 → residue 识别同时触发安全网', () => {
    const r = analyze({ text: '正文 <tool_call>x</tool_call>', supportsTools: true, toolReliability: 'strict' });
    expect(r.residueDetected).toBe(true);
    expect(r.strictFallbackTriggered).toBe(true);
  });
});
