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

  it('12. extractAllPseudoToolCalls filters unregistered tool names and keeps registered ones', () => {
    const ai = require('../ai');
    const extract = ai._internals.extractAllPseudoToolCalls;

    // XML-like pseudo tool call
    const textWithMix = 
      '<tool_call><function=read_file><parameter-file_path>test.txt</parameter></tool_call>\n' +
      '<tool_call><function=unregistered_fake_tool><parameter-foo>bar</parameter></tool_call>';

    const calls = extract(textWithMix);
    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('read_file');
  });

  it('13. extractAllPseudoToolCalls filters faked tool calls with invalid JSON arguments', () => {
    const ai = require('../ai');
    const extract = ai._internals.extractAllPseudoToolCalls;

    // Bracket-style tool call with malformed/invalid JSON parameter
    const textWithMalformed = 
      '[read_file] <tool_code>\n' +
      '{ "file_path": "invalid_json_missing_quotes \n' +
      '</tool_code>';

    const calls = extract(textWithMalformed);
    expect(calls).toHaveLength(0);
  });

  it('14. ToolLoop handleToolCalls intercepts unregistered tool execution and returns clean error block', async () => {
    const ToolLoop = require('../runtime/toolLoop');
    let executeToolCalled = false;
    let streamChatOpts = null;

    const mockStreamChat = async (opts) => {
      streamChatOpts = opts;
      opts.onDone('reply', {}, 'model');
    };

    const loop = new ToolLoop({
      toolLoader: {
        getDefinitions: () => [
          { type: 'function', function: { name: 'canvas', description: 'canvas tool' } }
        ],
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
      toolCalls: [
        { id: 'tc_1', function: { name: 'canvas', arguments: '{"action":"create"}' } },
        { id: 'tc_2', function: { name: 'unregistered_fake_tool', arguments: '{"foo":"bar"}' } }
      ],
      toolRound: 0,
      toolSignatures: [],
      truncatedMessages: [],
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
    });

    // Assert executeTool was called (for canvas) but not for unregistered_fake_tool
    expect(executeToolCalled).toBe(true);

    // Assert the faked/unregistered tool results contain clean local interception message
    expect(streamChatOpts).toBeDefined();
    const toolResults = streamChatOpts.messages.filter(m => m.role === 'tool');
    expect(toolResults).toHaveLength(2);

    const fakeToolRes = toolResults.find(m => m.tool_name === 'unregistered_fake_tool' || m.name === 'unregistered_fake_tool');
    expect(fakeToolRes).toBeDefined();
    expect(fakeToolRes.content).toContain('not registered or allowed');
  });

  it('15. extractAllPseudoToolCalls rejects fake mcp-prefixed tool names when not actually registered', () => {
    const ai = require('../ai');
    const extract = ai._internals.extractAllPseudoToolCalls;

    const fakeMcpText =
      '<tool_call><function=mcp_fake_server_read_file><parameter-file_path>secret.txt</parameter></tool_call>';

    const calls = extract(fakeMcpText);
    expect(calls).toHaveLength(0);
  });

  it('16. stripPseudoToolResidue removes blocked pseudo tool markup from final reply text', () => {
    const ai = require('../ai');
    const strip = ai._internals.stripPseudoToolResidue;
    const hasResidue = ai._internals.hasPseudoToolResidue;

    const source =
      '先看一下结果。\n\n<tool_call><function=unregistered_fake_tool><parameter-foo>bar</parameter></tool_call>\n\n继续正文。';

    expect(hasResidue(source)).toBe(true);
    const stripped = strip(source);
    expect(stripped).toContain('先看一下结果。');
    expect(stripped).toContain('继续正文。');
    expect(stripped).not.toContain('<tool_call>');
    expect(stripped).not.toContain('unregistered_fake_tool');
  });

  it('17. ToolLoop also intercepts fake mcp-prefixed tool names that are not in registered definitions', async () => {
    const ToolLoop = require('../runtime/toolLoop');
    let executeToolCalled = false;
    let streamChatOpts = null;

    const mockStreamChat = async (opts) => {
      streamChatOpts = opts;
      opts.onDone('reply', {}, 'model');
    };

    const loop = new ToolLoop({
      toolLoader: {
        getDefinitions: () => [
          { type: 'function', function: { name: 'mcp_realserver_read_file', description: 'real mcp tool' } }
        ],
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
      toolCalls: [
        { id: 'tc_1', function: { name: 'mcp_fake_server_read_file', arguments: '{"path":"secret.txt"}' } }
      ],
      toolRound: 0,
      toolSignatures: [],
      truncatedMessages: [],
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
    });

    expect(executeToolCalled).toBe(false);
    const toolResults = streamChatOpts.messages.filter(m => m.role === 'tool');
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].name).toBe('mcp_fake_server_read_file');
    expect(toolResults[0].content).toContain('not registered or allowed');
  });

  it('18. extractAllPseudoToolCalls parses bracket tag web_search syntax into a real tool call', () => {
    const ai = require('../ai');
    const extract = ai._internals.extractAllPseudoToolCalls;

    const source = '[web_search] query: AI news May 22 2026 [/web_search]';
    const calls = extract(source);

    expect(calls).toHaveLength(1);
    expect(calls[0].function.name).toBe('web_search');
    expect(JSON.parse(calls[0].function.arguments)).toEqual({
      query: 'AI news May 22 2026',
    });
  });

  it('19. stripPseudoToolResidue removes bracket tag pseudo tool markup from final reply text', () => {
    const ai = require('../ai');
    const strip = ai._internals.stripPseudoToolResidue;
    const hasResidue = ai._internals.hasPseudoToolResidue;

    const source = '先搜索一下。\n\n[web_search] query: AI news May 22 2026 [/web_search]\n\n继续正文。';
    expect(hasResidue(source)).toBe(true);

    const stripped = strip(source);
    expect(stripped).toContain('先搜索一下。');
    expect(stripped).toContain('继续正文。');
    expect(stripped).not.toContain('[web_search]');
    expect(stripped).not.toContain('AI news May 22 2026');
  });

  it('20. agent_runner no longer blocks registered tools when allowedTools is empty', async () => {
    const agentRunner = require('../agents/agent_runner');
    const toolLoader = require('../tool_loader');

    const originalExecuteTool = toolLoader.executeTool;
    let executeToolCalled = false;
    toolLoader.executeTool = async () => {
      executeToolCalled = true;
      return 'mock tool result';
    };

    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    globalThis.fetch = async () => {
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
                    arguments: '{"path":"README.md"}'
                  }
                }]
              },
              finish_reason: 'tool_calls'
            }],
            usage: {},
          })
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: 'done'
            },
            finish_reason: 'stop'
          }],
          usage: {},
        })
      };
    };

    try {
      const agentMock = {
        name: 'testAgent',
        model: 'agent-custom-model',
        systemPrompt: 'System',
        allowedTools: [],
        formatUserMessage: () => 'mock prompt',
        maxTurns: 2,
        timeoutMs: 10000,
      };

      const result = await agentRunner.runAgent({
        agent: agentMock,
        task: { taskId: 'task-allowedtools-empty' },
      });

      expect(executeToolCalled).toBe(true);
      expect(result.result).toBe('done');
    } finally {
      toolLoader.executeTool = originalExecuteTool;
      globalThis.fetch = originalFetch;
    }
  });

  it('21. inferDefaultCapability returns the single default outlet for search-first requests', () => {
    const ai = require('../ai');
    const infer = ai._internals.inferDefaultCapability;

    const capability = infer([
      { role: 'user', content: '搜索 DeepSeek 最新模型，如果价格低于 $10/M 就写总结' },
    ]);

    expect(capability).toBe('default');
  });

  it('22. inferDefaultCapability returns the single default outlet for summarization requests', () => {
    const ai = require('../ai');
    const infer = ai._internals.inferDefaultCapability;

    const capability = infer([
      { role: 'user', content: '把上面的内容总结成 5 条要点' },
    ]);

    expect(capability).toBe('default');
  });

  it('23. ToolLoop stops after request_clarify waiting_user_reply instead of continuing generation', async () => {
    const ToolLoop = require('../runtime/toolLoop');
    let streamChatCalled = false;
    let donePayload = null;

    const loop = new ToolLoop({
      toolLoader: {
        getDefinitions: () => [
          { type: 'function', function: { name: 'request_clarify', description: 'clarify tool' } }
        ],
        getToolMeta: () => ({ timeoutMs: 1000 }),
        executeTool: async () => ({
          status: 'waiting_user_reply',
          message: '澄清询问器已展示给用户。请停止继续生成。',
        }),
      },
      log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      streamChat: async () => {
        streamChatCalled = true;
      },
      buildToolSignature: () => 'clarify_sig',
      maxToolRounds: 8,
      maxIdenticalToolSignatures: 2,
    });

    await loop.handleToolCalls({
      toolCalls: [{ id: 'tc_clarify', function: { name: 'request_clarify', arguments: '{"fields":[]}' } }],
      toolRound: 0,
      toolSignatures: [],
      fullText: '',
      totalUsage: { input_tokens: 1, output_tokens: 1 },
      responseModel: 'test-model',
      truncatedMessages: [{ role: 'user', content: '帮我先问几个问题' }],
      onDelta: () => {},
      onDone: (text, usage, model) => {
        donePayload = { text, usage, model };
      },
      onError: () => {},
      onToolEvent: () => {},
      flushThinkAtEnd: () => {},
      turnId: 'turn-clarify',
    });

    expect(streamChatCalled).toBe(false);
    expect(donePayload).toEqual({
      text: '',
      usage: { input_tokens: 1, output_tokens: 1 },
      model: 'test-model',
    });
  });

  it('24. ToolLoop finalizes completed workflow results directly instead of feeding raw status objects back into continuation', async () => {
    const ToolLoop = require('../runtime/toolLoop');
    let streamChatCalled = false;
    let donePayload = null;

    const loop = new ToolLoop({
      toolLoader: {
        getDefinitions: () => [
          { type: 'function', function: { name: 'video_plan', description: 'video plan tool' } }
        ],
        getToolMeta: () => ({ timeoutMs: 1000 }),
        executeTool: async () => ({
          status: 'completed',
          message: '短视频创作方案已生成。请根据下方脚本与分镜表进行制作。',
          extra: { shouldNotLeak: true },
        }),
      },
      log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      streamChat: async () => {
        streamChatCalled = true;
      },
      buildToolSignature: () => 'video_sig',
      maxToolRounds: 8,
      maxIdenticalToolSignatures: 2,
    });

    await loop.handleToolCalls({
      toolCalls: [{ id: 'tc_video', function: { name: 'video_plan', arguments: '{}' } }],
      toolRound: 0,
      toolSignatures: [],
      fullText: '',
      totalUsage: null,
      responseModel: 'test-model',
      truncatedMessages: [{ role: 'user', content: '给我一个短视频方案' }],
      onDelta: () => {},
      onDone: (text, usage, model) => {
        donePayload = { text, usage, model };
      },
      onError: () => {},
      onToolEvent: () => {},
      flushThinkAtEnd: () => {},
      turnId: 'turn-video',
    });

    expect(streamChatCalled).toBe(false);
    expect(donePayload).toEqual({
      text: '短视频创作方案已生成。请根据下方脚本与分镜表进行制作。',
      usage: null,
      model: 'test-model',
    });
  });
});
