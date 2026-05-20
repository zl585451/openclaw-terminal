'use strict';

const { describe, it, expect } = globalThis;
const toolAdapter = require('../runtime/toolAdapter');

describe('ToolAdapter format governance and safe parsing', () => {

  it('1. cleans Markdown code fence blocks (```json ... ```)', () => {
    const raw = '```json\n{"path": "docs/readme.md", "content": "hello"}\n```';
    const parsed = toolAdapter.cleanAndParseArguments(raw);
    expect(parsed).toEqual({ path: 'docs/readme.md', content: 'hello' });
  });

  it('2. cleans raw Markdown code fence blocks without json prefix (``` ... ```)', () => {
    const raw = '```\n{"id": "123", "dryRun": true}\n```';
    const parsed = toolAdapter.cleanAndParseArguments(raw);
    expect(parsed).toEqual({ id: '123', dryRun: true });
  });

  it('3. repairs trailing commas in JSON object and arrays', () => {
    const raw = '{"name": "test", "values": [1, 2, 3, ], }';
    const parsed = toolAdapter.cleanAndParseArguments(raw);
    expect(parsed).toEqual({ name: 'test', values: [1, 2, 3] });
  });

  it('4. throws clear TOOL_PARAMS_PARSE_FAILED error on truncated JSON with open brackets and braces', () => {
    const raw = '{"query": "searching", "limit": 10, "filters": ["active", "new';
    expect(() => toolAdapter.cleanAndParseArguments(raw)).toThrow(/TOOL_PARAMS_PARSE_FAILED.*truncated_or_malformed_json/);
  });

  it('5. throws clear TOOL_PARAMS_PARSE_FAILED error on truncated JSON with deeply nested structures', () => {
    const raw = '{"user": {"profile": {"name": "alice", "age": 30';
    expect(() => toolAdapter.cleanAndParseArguments(raw)).toThrow(/TOOL_PARAMS_PARSE_FAILED.*truncated_or_malformed_json/);
  });

  it('6. returns empty object for empty or whitespace-only inputs', () => {
    expect(toolAdapter.cleanAndParseArguments('')).toEqual({});
    expect(toolAdapter.cleanAndParseArguments('   ')).toEqual({});
    expect(toolAdapter.cleanAndParseArguments(null)).toEqual({});
  });

  it('7. throws clear TOOL_PARAMS_PARSE_FAILED error on unresolvably malformed JSON', () => {
    const raw = '{"name": "test", INVALID_JSON_NO_REPAIR';
    expect(() => toolAdapter.cleanAndParseArguments(raw)).toThrow(/TOOL_PARAMS_PARSE_FAILED/);
  });

  it('8. throws clear TOOL_PARAMS_PARSE_FAILED error on truncated JSON string terminating precisely with trailing backslashes', () => {
    const raw = '{"message": "Hello\\';
    expect(() => toolAdapter.cleanAndParseArguments(raw)).toThrow(/TOOL_PARAMS_PARSE_FAILED.*truncated_or_malformed_json/);
  });

  it('9. detectTruncatedJson correctly identifies truncated structures', () => {
    expect(toolAdapter.detectTruncatedJson('{"query": "searching", "limit": 10, "filters": ["active", "new')).toBe(true);
    expect(toolAdapter.detectTruncatedJson('{"user": {"profile": {"name": "alice", "age": 30')).toBe(true);
    expect(toolAdapter.detectTruncatedJson('{"message": "Hello\\')).toBe(true);
    expect(toolAdapter.detectTruncatedJson('{"name": "test"}')).toBe(false);
  });

  it('10. ToolLoop prevents tool execution and returns error result on truncated or malformed arguments', async () => {
    const ToolLoop = require('../runtime/toolLoop');
    let executeToolCalled = false;
    let streamChatOpts = null;

    const mockStreamChat = async (opts) => {
      streamChatOpts = opts;
      opts.onDone('reply', {}, 'model');
    };

    const loop = new ToolLoop({
      toolLoader: {
        getDefinitions: () => [],
        executeTool: async () => {
          executeToolCalled = true;
          return 'tool result';
        }
      },
      log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      streamChat: mockStreamChat,
      buildToolSignature: () => 'test_sig',
    });

    await loop.handleToolCalls({
      toolCalls: [{ id: 'tc_1', function: { name: 'test_tool', arguments: '{"query": "searching", "limit": 10, "filters": ["active", "new' } }],
      toolRound: 0,
      toolSignatures: [],
      truncatedMessages: [],
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
    });

    // Assert executeTool was NOT called
    expect(executeToolCalled).toBe(false);

    // Assert streamChat was called with the error tool result
    expect(streamChatOpts).toBeDefined();
    const lastToolMessage = streamChatOpts.messages.find(m => m.role === 'tool');
    expect(lastToolMessage).toBeDefined();
    expect(lastToolMessage.content).toContain('TOOL_PARAMS_PARSE_FAILED');
    expect(lastToolMessage.content).toContain('truncated_or_malformed_json');
  });

  it('11. agent_runner prevents tool execution and returns error result on truncated arguments', async () => {
    const agentRunner = require('../agents/agent_runner');
    const toolLoader = require('../tool_loader');

    const originalExecuteTool = toolLoader.executeTool;
    let executeToolCalled = false;
    toolLoader.executeTool = async () => {
      executeToolCalled = true;
      return 'success';
    };

    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = async (url, options) => {
      fetchCount++;
      if (fetchCount === 1) {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [{
                  id: 'tc_1',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path": "truncated_path\\'
                  }
                }]
              },
              finish_reason: 'tool_calls'
            }],
            usage: {},
          })
        };
      } else {
        return {
          ok: true,
          json: async () => ({
            choices: [{
              message: {
                role: 'assistant',
                content: 'I failed to parse arguments, so I stop.'
              },
              finish_reason: 'stop'
            }],
            usage: {},
          })
        };
      }
    };

    try {
      const agentMock = {
        name: 'testAgent',
        model: 'agent-custom-model',
        systemPrompt: 'System',
        allowedTools: ['read_file'],
        formatUserMessage: () => 'mock prompt',
        maxTurns: 2,
        timeoutMs: 10000,
      };

      await agentRunner.runAgent({
        agent: agentMock,
        task: { taskId: 'task-123' },
      });

      expect(executeToolCalled).toBe(false);
    } finally {
      toolLoader.executeTool = originalExecuteTool;
      globalThis.fetch = originalFetch;
    }
  });
});
