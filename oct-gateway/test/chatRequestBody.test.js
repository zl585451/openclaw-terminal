'use strict';

/**
 * buildChatRequestBody 回归测试。
 *
 * 该纯函数行为保持地抽离自 ai.js streamChatRaw 的请求体组装（P0 续作）。
 * 锁定字段组装、工具注入时机、tool_choice 降级与日志行为。
 */
const { describe, it, expect } = globalThis;
const { buildChatRequestBody } = require('../runtime/chatRequestBody');

const baseProvider = { id: 'test', supportsStreamOptions: false, supportsToolChoiceFunction: false };
const baseCaps = { maxTokens: 2048 };
const baseArgs = {
  model: 'm',
  messages: [{ role: 'user', content: 'hi' }],
  caps: baseCaps,
  provider: baseProvider,
  requestTemperature: null,
  shouldInjectTools: false,
  toolDefinitions: null,
  forceFinalFromToolResults: false,
  toolChoice: 'auto',
  turnId: 't1',
  toolRound: 0,
};

describe('buildChatRequestBody 请求体组装（行为保持抽离）', () => {
  it('基础字段：model / messages / stream / max_tokens', () => {
    const { requestBody, logs } = buildChatRequestBody({ ...baseArgs });
    expect(requestBody.model).toBe('m');
    expect(requestBody.messages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(requestBody.stream).toBe(true);
    expect(requestBody.max_tokens).toBe(2048);
    expect(logs).toEqual([]);
  });

  it('caps.maxTokens 缺省回落 4096', () => {
    const { requestBody } = buildChatRequestBody({ ...baseArgs, caps: {} });
    expect(requestBody.max_tokens).toBe(4096);
  });

  it('requestTemperature 为 null 时不带 temperature', () => {
    const { requestBody } = buildChatRequestBody({ ...baseArgs, requestTemperature: null });
    expect('temperature' in requestBody).toBe(false);
  });

  it('requestTemperature 为数值时写入（含 0）', () => {
    expect(buildChatRequestBody({ ...baseArgs, requestTemperature: 0 }).requestBody.temperature).toBe(0);
    expect(buildChatRequestBody({ ...baseArgs, requestTemperature: 0.7 }).requestBody.temperature).toBe(0.7);
  });

  it('provider.supportsStreamOptions 为真时带 stream_options', () => {
    const { requestBody } = buildChatRequestBody({
      ...baseArgs,
      provider: { ...baseProvider, supportsStreamOptions: true },
    });
    expect(requestBody.stream_options).toEqual({ include_usage: true });
  });

  it('不注入工具时无 tools / tool_choice 字段', () => {
    const { requestBody } = buildChatRequestBody({ ...baseArgs, shouldInjectTools: false });
    expect('tools' in requestBody).toBe(false);
    expect('tool_choice' in requestBody).toBe(false);
  });

  it('注入工具：带 tools 与 tool_choice，沿用传入的 toolChoice', () => {
    const defs = [{ type: 'function', function: { name: 'web_search' } }];
    const { requestBody } = buildChatRequestBody({
      ...baseArgs,
      shouldInjectTools: true,
      toolDefinitions: defs,
      toolChoice: 'auto',
    });
    expect(requestBody.tools).toEqual(defs);
    expect(requestBody.tool_choice).toBe('auto');
  });

  it('forceFinalFromToolResults 时 tool_choice 强制为 none，并产出 info 日志', () => {
    const { requestBody, logs } = buildChatRequestBody({
      ...baseArgs,
      shouldInjectTools: true,
      toolDefinitions: [],
      forceFinalFromToolResults: true,
      toolChoice: 'auto',
      toolRound: 2,
    });
    expect(requestBody.tool_choice).toBe('none');
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('info');
    expect(logs[0].meta).toEqual({ turnId: 't1', toolRound: 2 });
  });

  it('对象形 tool_choice + provider 不支持指定函数 → 降级 auto，并产出 warn 日志', () => {
    const { requestBody, logs } = buildChatRequestBody({
      ...baseArgs,
      shouldInjectTools: true,
      toolDefinitions: [],
      provider: { ...baseProvider, supportsToolChoiceFunction: false },
      toolChoice: { type: 'function', function: { name: 'web_search' } },
    });
    expect(requestBody.tool_choice).toBe('auto');
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('warn');
  });

  it('对象形 tool_choice + provider 支持指定函数 → 原样保留，无 warn', () => {
    const objChoice = { type: 'function', function: { name: 'web_search' } };
    const { requestBody, logs } = buildChatRequestBody({
      ...baseArgs,
      shouldInjectTools: true,
      toolDefinitions: [],
      provider: { ...baseProvider, supportsToolChoiceFunction: true },
      toolChoice: objChoice,
    });
    expect(requestBody.tool_choice).toEqual(objChoice);
    expect(logs).toEqual([]);
  });
});
