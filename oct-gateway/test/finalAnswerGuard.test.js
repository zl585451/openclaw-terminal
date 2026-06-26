'use strict';

const { describe, it, expect, beforeEach, afterEach } = globalThis;
const fs = require('fs');
const ai = require('../ai');
const config = require('../config');
const toolLoader = require('../tool_loader');
const ContextBuilder = require('../runtime/contextBuilder');
const {
  evaluateFinalAnswerGuard,
  appendFinalAnswerInstruction,
} = require('../runtime/finalAnswerGuard');

function sseResponse(events) {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    headers: new Headers({ 'Content-Type': 'text/event-stream' }),
  };
}

describe('final answer guard', () => {
  it('forces empty or short final text only after tool evidence', () => {
    expect(evaluateFinalAnswerGuard({
      text: '再补搜几个角度，确认今天最新动态。',
      hasToolEvidence: true,
    })).toMatchObject({ shouldForce: true, reason: 'too_short' });

    expect(evaluateFinalAnswerGuard({
      text: '短回答',
      hasToolEvidence: false,
    })).toMatchObject({ shouldForce: false, reason: 'no_tool_evidence' });

    expect(evaluateFinalAnswerGuard({
      text: '短回答',
      hasToolEvidence: true,
      toolChoice: 'none',
    })).toMatchObject({ shouldForce: false, reason: 'tool_choice_none' });
  });

  it('appends a final-answer instruction without mutating existing messages', () => {
    const messages = [{ role: 'user', content: 'question' }];
    const next = appendFinalAnswerInstruction(messages);
    expect(messages).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next[1].role).toBe('user');
    expect(next[1].content).toContain('直接输出完整的最终结论');
  });
});

describe('streamChat final answer guard integration', () => {
  const originals = {};

  beforeEach(() => {
    originals.fetch = globalThis.fetch;
    originals.getProviderConfig = config.getProviderConfig;
    originals.model = config.DASHSCOPE_MODEL;
    originals.executeTool = toolLoader.executeTool;
    originals.getDefinitions = toolLoader.getDefinitions;
    originals.appendFileSync = fs.appendFileSync;

    config.DASHSCOPE_MODEL = 'guard-test-model';
    config.getProviderConfig = () => ({
      id: 'guard-provider',
      name: 'Guard Provider',
      baseUrl: 'https://guard-provider.test/v1',
      apiKey: 'sk-guard',
      models: [{ id: 'guard-test-model', tools: true, thinking: false, maxTokens: 2048 }],
      supportsStreamOptions: false,
    });
    toolLoader.getDefinitions = () => [{
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Mock search.',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
    }];
    toolLoader.executeTool = async () => ({
      success: true,
      data: { results: [{ title: 'AI news', date: '2026-06-18' }] },
    });
    fs.appendFileSync = (file, ...args) => {
      if (String(file).endsWith('tool_results.jsonl')) return;
      return originals.appendFileSync.call(fs, file, ...args);
    };
  });

  afterEach(() => {
    globalThis.fetch = originals.fetch;
    config.getProviderConfig = originals.getProviderConfig;
    config.DASHSCOPE_MODEL = originals.model;
    toolLoader.executeTool = originals.executeTool;
    toolLoader.getDefinitions = originals.getDefinitions;
    fs.appendFileSync = originals.appendFileSync;
  });

  it('retries a short final answer after a tool round with tool_choice none', async () => {
    const requestBodies = [];
    let fetchCount = 0;
    globalThis.fetch = async (_url, options) => {
      fetchCount += 1;
      requestBodies.push(JSON.parse(options.body || '{}'));
      if (fetchCount === 1) {
        return sseResponse([
          { choices: [{ delta: { content: '我先搜一下。' } }] },
          {
            choices: [{
              delta: {
                tool_calls: [{
                  index: 0,
                  id: 'call_guard_search',
                  type: 'function',
                  function: { name: 'web_search', arguments: '{"query":"AI news today"}' },
                }],
              },
              finish_reason: 'tool_calls',
            }],
          },
        ]);
      }
      if (fetchCount === 2) {
        return sseResponse([
          { choices: [{ delta: { content: '再补搜几个角度，确认今天最新动态。' } }] },
          { choices: [{ delta: {}, finish_reason: 'stop' }] },
        ]);
      }
      return sseResponse([
        { choices: [{ delta: { content: '最终报告：今天的 AI 新闻要点包括政策更新、产品发布和行业应用进展。' } }] },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]);
    };

    const doneTexts = [];
    let resetCount = 0;
    await ai.streamChat({
      messages: [{ role: 'user', content: '帮我搜一下今天的 AI 新闻，整理成要点' }],
      onDelta: () => {},
      onDone: (text) => doneTexts.push(text),
      onError: (error) => { throw error; },
      onToolEvent: () => {},
      onRoundReset: () => { resetCount += 1; },
      _disableExternalOmniRoute: true,
    });

    expect(fetchCount).toBe(3);
    expect(resetCount).toBeGreaterThanOrEqual(2);
    expect(doneTexts).toEqual(['最终报告：今天的 AI 新闻要点包括政策更新、产品发布和行业应用进展。']);
    expect(requestBodies[2].tool_choice).toBe('none');
    expect(requestBodies[2].messages.at(-1).content).toContain('不要再写过渡句');
  });
});

describe('ContextBuilder authoritative date context', () => {
  it('injects current date as the authority for time-sensitive wording', async () => {
    const builder = new ContextBuilder({
      session: {
        addMessage: () => {},
        getHistory: () => [],
        getThinkMode: () => 'off',
      },
      memory: { isAlive: async () => false },
      memorySearch: { searchMemory: async () => ({ ok: false, data: null }) },
      memoryGovernor: { selectForInjection: () => [] },
      contextManager: {
        buildApiMessages: (_history, systemPrompt, lastUserMsg) => [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: lastUserMsg },
        ],
        summarize: () => ({}),
      },
      hypothesis: {},
      imageService: {},
      config: {
        DASHSCOPE_MODEL: 'guard-test-model',
        getProviderConfig: () => ({ id: 'guard-provider' }),
        ENABLE_BACKGROUND_TASK_DISPATCH: false,
        memory: { vectorRecall: { enabled: false } },
      },
      logger: { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} },
      helpers: {
        hasRecallIntent: () => false,
        isProjectAnalysisRequest: () => false,
        extractMemorySearchTerms: () => [],
        stripCotText: (text) => text,
      },
    });

    const { messages } = await builder.build({
      sessionKey: 'date-test',
      userMessage: '今天是什么日期？',
      attachments: [],
      workbenchContext: null,
      orchestratorResult: {},
      systemPrompt: 'base system',
      projectContext: null,
    });

    expect(messages[0].content).toContain('[当前时间]');
    expect(messages[0].content).toContain('[权威当前日期]');
    expect(messages[0].content).toContain('以本条系统注入日期为准');
    expect(messages[0].content).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
