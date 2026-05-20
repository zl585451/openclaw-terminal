'use strict';

const { describe, it, expect, beforeEach, afterEach } = globalThis;
const omniRoute = require('../runtime/omniRoute');
const config = require('../config');

describe('OmniRoute Governance Core', () => {
  const originalEnv = {};
  const envVars = [
    'DASHSCOPE_API_KEY',
    'DASHSCOPE_BASE_URL',
    'DEEPSEEK_API_KEY',
    'DEEPSEEK_BASE_URL',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
  ];

  let originalGetProviderConfig;
  let originalGetEnvOrConfig;

  beforeEach(() => {
    envVars.forEach((k) => {
      originalEnv[k] = process.env[k];
    });
    envVars.forEach((k) => {
      delete process.env[k];
    });

    originalGetProviderConfig = config.getProviderConfig;
    originalGetEnvOrConfig = config.getEnvOrConfig;

    config.getEnvOrConfig = (key) => {
      return process.env[key] || '';
    };

    config.getProviderConfig = () => {
      return {
        id: 'bailian-coding',
        provider: 'bailian-coding',
        baseUrl: process.env.DASHSCOPE_BASE_URL || 'https://orig.api/v1',
        apiKey: process.env.DASHSCOPE_API_KEY || 'orig-key',
        model: process.env.DASHSCOPE_MODEL || 'qwen3.5-plus',
        models: [
          { id: 'qwen3.5-plus', tools: true },
          { id: 'deepseek-v4-flash', tools: true },
          { id: 'gpt-4o', tools: true },
          { id: 'orig-model', tools: true }
        ],
      };
    };
  });

  afterEach(() => {
    envVars.forEach((k) => {
      if (originalEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = originalEnv[k];
      }
    });
    config.getProviderConfig = originalGetProviderConfig;
    config.getEnvOrConfig = originalGetEnvOrConfig;
  });

  it('1. returns null for unknown capability', () => {
    const res = omniRoute.resolveCapability('unknown-cap');
    expect(res).toBeNull();
  });

  it('2. listCapabilities and isCapabilityAlias returns correctly', () => {
    expect(omniRoute.isCapabilityAlias('oct-chat')).toBe(true);
    expect(omniRoute.isCapabilityAlias('oct-plan')).toBe(true);
    expect(omniRoute.isCapabilityAlias('oct-tool-safe')).toBe(true);
    expect(omniRoute.isCapabilityAlias('unknown')).toBe(false);

    const list = omniRoute.listCapabilities();
    expect(list).toContain('oct-chat');
    expect(list).toContain('oct-plan');
    expect(list).toContain('oct-tool-safe');
  });

  it('3. skips candidates with missing config and falls back to original Resolve', () => {
    let calledOriginal = false;
    const context = {
      originalResolve: () => {
        calledOriginal = true;
        return { id: 'bailian-coding', baseUrl: 'https://orig.api', apiKey: 'orig-key', model: 'orig-model' };
      }
    };

    const res = omniRoute.resolveCapability('oct-chat', context);
    expect(res).toBeDefined();
    expect(calledOriginal).toBe(true);
    expect(res.baseUrl).toBe('https://orig.api');
    expect(res.apiKey).toBe('orig-key');
  });

  it('4. returns null if all candidates and originalResolve are unavailable', () => {
    const res = omniRoute.resolveCapability('oct-chat');
    expect(res).toBeNull();
  });

  it('5. resolves candidate provider successfully when credentials are provided', () => {
    process.env.DEEPSEEK_BASE_URL = 'https://ds-test.api/v1';
    process.env.DEEPSEEK_API_KEY = 'ds-key-test';

    const res = omniRoute.resolveCapability('oct-chat');
    expect(res).toBeDefined();
    expect(res.providerId).toBe('deepseek');
    expect(res.baseUrl).toBe('https://ds-test.api/v1');
    expect(res.apiKey).toBe('ds-key-test');
    expect(res.model).toBe('deepseek-v4-flash');
  });

  it('6. ai.js streamChat uses oct-chat capability and overrides to oct-tool-safe in tool loop', async () => {
    const { streamChat } = require('../ai');
    const ProviderRouter = require('../runtime/providerRouter');

    let mockOriginalResolveResult = {
      provider: { id: 'bailian-coding', name: 'bailian-coding' },
      apiKey: 'orig-key',
      baseUrl: 'https://orig.api/v1',
      model: 'qwen3.5-plus',
      caps: config.getModelCaps('qwen3.5-plus'),
      fallback: { canFallbackToDeepseek: false, canFallbackToBailian: false }
    };

    const originalResolve = ProviderRouter.prototype.resolve;
    ProviderRouter.prototype.resolve = function() {
      return mockOriginalResolveResult;
    };
    
    process.env.DEEPSEEK_BASE_URL = 'https://ds-test.api/v1';
    process.env.DEEPSEEK_API_KEY = 'ds-key-test';

    process.env.OPENAI_BASE_URL = 'https://openai-test.api/v1';
    process.env.OPENAI_API_KEY = 'openai-key-test';

    const originalFetch = globalThis.fetch;
    let requestOptions = null;
    globalThis.fetch = async (url, options) => {
      requestOptions = JSON.parse(options.body || '{}');
      
      const encoder = new TextEncoder();
      const mockChunk = `data: ${JSON.stringify({
        choices: [{
          delta: { content: 'test chunk' },
          index: 0,
          finish_reason: null
        }]
      })}\n\ndata: [DONE]\n\n`;

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(mockChunk));
          controller.close();
        }
      });

      return {
        ok: true,
        body: stream,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      };
    };

    try {
      await streamChat({
        messages: [{ role: 'user', content: 'test' }],
        onDelta: () => {},
        onDone: () => {},
        onError: () => {},
      });
      expect(requestOptions.model).toBe('qwen3.5-plus');

      mockOriginalResolveResult = null;
      await streamChat({
        messages: [{ role: 'user', content: 'test' }],
        capability: 'oct-chat',
        onDelta: () => {},
        onDone: () => {},
        onError: () => {},
      });
      expect(requestOptions.model).toBe('deepseek-v4-flash');

      await streamChat({
        messages: [{ role: 'user', content: 'test' }],
        preserveToolChain: true,
        onDelta: () => {},
        onDone: () => {},
        onError: () => {},
      });
      expect(requestOptions.model).toBe('gpt-4o');
    } finally {
      globalThis.fetch = originalFetch;
      ProviderRouter.prototype.resolve = originalResolve;
    }
  });

  it('7. ToolLoop passes capability="oct-tool-safe" to streamChat', async () => {
    const ToolLoop = require('../runtime/toolLoop');
    let streamChatOpts = null;
    const mockStreamChat = async (opts) => {
      streamChatOpts = opts;
      opts.onDone('reply', {}, 'model');
    };

    const loop = new ToolLoop({
      toolLoader: {
        getDefinitions: () => [],
        executeTool: async () => 'tool result'
      },
      log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      streamChat: mockStreamChat,
      buildToolSignature: () => 'test_sig',
    });

    await loop.handleToolCalls({
      toolCalls: [{ id: '1', function: { name: 'test_tool', arguments: '{}' } }],
      toolRound: 0,
      toolSignatures: [],
      truncatedMessages: [],
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
    });

    expect(streamChatOpts).toBeDefined();
    expect(streamChatOpts.capability).toBe('oct-tool-safe');
  });

  it('8. agent_runner resolves using oct-tool-safe when allowedTools is non-empty', async () => {
    process.env.OPENAI_BASE_URL = 'https://openai-test.api/v1';
    process.env.OPENAI_API_KEY = 'openai-key-test';

    const originalFetch = globalThis.fetch;
    let fetchedUrl = null;
    let requestBody = null;
    globalThis.fetch = async (url, options) => {
      fetchedUrl = url;
      requestBody = JSON.parse(options.body || '{}');
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'agent reply' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
    };

    try {
      const agentRunner = require('../agents/agent_runner');
      const agentMock = {
        name: 'testAgent',
        model: 'agent-custom-model',
        systemPrompt: 'System',
        allowedTools: ['read_file'],
        formatUserMessage: (task) => 'mock prompt',
        maxTurns: 1,
        timeoutMs: 10000,
      };
      
      await agentRunner.runAgent({
        agent: agentMock,
        task: { taskId: 'task-123' },
      });

      expect(fetchedUrl).toBe('https://openai-test.api/v1/chat/completions');
      expect(requestBody.model).toBe('gpt-4o');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('9. agent_runner does NOT resolve using oct-tool-safe when allowedTools is empty', async () => {
    process.env.OPENAI_BASE_URL = 'https://openai-test.api/v1';
    process.env.OPENAI_API_KEY = 'openai-key-test';

    const originalFetch = globalThis.fetch;
    let fetchedUrl = null;
    let requestBody = null;
    globalThis.fetch = async (url, options) => {
      fetchedUrl = url;
      requestBody = JSON.parse(options.body || '{}');
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'agent reply' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
    };

    try {
      const agentRunner = require('../agents/agent_runner');
      const agentMock = {
        name: 'testAgent',
        model: 'agent-custom-model',
        systemPrompt: 'System',
        allowedTools: [],
        formatUserMessage: (task) => 'mock prompt',
        maxTurns: 1,
        timeoutMs: 10000,
      };
      
      await agentRunner.runAgent({
        agent: agentMock,
        task: { taskId: 'task-123' },
      });

      expect(fetchedUrl).toBe('https://orig.api/v1/chat/completions');
      expect(requestBody.model).toBe('agent-custom-model');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('10. ai.js streamChat preserves full original resolve object and fallback properties for current/current candidate', async () => {
    const { streamChat } = require('../ai');
    const ProviderRouter = require('../runtime/providerRouter');

    const originalResolve = ProviderRouter.prototype.resolve;
    ProviderRouter.prototype.resolve = function() {
      return {
        provider: { id: 'bailian-coding', name: 'bailian-coding' },
        apiKey: 'orig-key',
        baseUrl: 'https://orig.api/v1',
        model: 'qwen3.5-plus',
        caps: config.getModelCaps('qwen3.5-plus'),
        fallback: {
          canFallbackToDeepseek: true,
          canFallbackToBailian: true,
        }
      };
    };

    const originalFetch = globalThis.fetch;
    let requestOptions = null;
    globalThis.fetch = async (url, options) => {
      requestOptions = JSON.parse(options.body || '{}');
      
      const encoder = new TextEncoder();
      const mockChunk = `data: ${JSON.stringify({
        choices: [{
          delta: { content: 'test chunk' },
          index: 0,
          finish_reason: null
        }]
      })}\n\ndata: [DONE]\n\n`;

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(mockChunk));
          controller.close();
        }
      });

      return {
        ok: true,
        body: stream,
        headers: new Headers({ 'Content-Type': 'text/event-stream' }),
      };
    };

    try {
      await streamChat({
        messages: [{ role: 'user', content: 'test' }],
        capability: 'oct-chat',
        onDelta: () => {},
        onDone: (text, usage, model, resolvedUsed) => {},
        onError: () => {},
      });
      
      expect(requestOptions.model).toBe('qwen3.5-plus');
    } finally {
      globalThis.fetch = originalFetch;
      ProviderRouter.prototype.resolve = originalResolve;
    }
  });
});
