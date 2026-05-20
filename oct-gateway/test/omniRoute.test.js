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
    'NEWAPI_API_KEY',
    'NEWAPI_BASE_URL',
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
          { id: 'deepseek-v4-pro', tools: true },
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

  it('11. inspectCapability lists status without leaking API Key', () => {
    process.env.OPENAI_API_KEY = 'sk-super-secret-key-99999';
    process.env.OPENAI_BASE_URL = 'https://openai.api/v1';

    const status = omniRoute.inspectCapability('oct-tool-safe');
    expect(status).toBeDefined();
    expect(status.capability).toBe('oct-tool-safe');

    const openaiCandidate = status.candidates.find((c) => c.provider === 'openai');
    expect(openaiCandidate).toBeDefined();
    expect(openaiCandidate.available).toBe(true);
    expect(openaiCandidate.hasApiKey).toBe(true);

    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('sk-super-secret-key-99999');
  });

  it('12. /omniroute/status API handler returns capability status when requested locally', async () => {
    const handleHttpRequest = require('../transport/httpRoutes')({
      memory: {},
      memoryManagementAgent: {},
      reviewQueueActions: {},
      toolLoader: {},
      mcpManager: {},
    });

    let headers = null;
    let responseBody = null;
    const res = {
      writeHead: (status, h) => {
        headers = h;
      },
      end: (data) => {
        responseBody = JSON.parse(data);
      }
    };

    process.env.OPENAI_API_KEY = 'sk-extremely-secret-key-12345';
    process.env.OPENAI_BASE_URL = 'https://openai.api/v1';

    const req = {
      method: 'GET',
      url: '/omniroute/status',
      socket: { remoteAddress: '127.0.0.1' },
    };

    const handled = await handleHttpRequest(req, res);
    expect(handled).toBe(true);
    expect(responseBody).toBeDefined();
    expect(responseBody.capabilities).toBeDefined();

    const toolSafe = responseBody.capabilities.find(c => c.capability === 'oct-tool-safe');
    expect(toolSafe).toBeDefined();
    const openaiCandidate = toolSafe.candidates.find(cand => cand.provider === 'openai');
    expect(openaiCandidate).toBeDefined();
    expect(openaiCandidate.available).toBe(true);
    expect(openaiCandidate.hasApiKey).toBe(true);

    const rawString = JSON.stringify(responseBody);
    expect(rawString).not.toContain('sk-extremely-secret-key-12345');
  });

  it('13. /omniroute/status API handler rejects with 403 when requested non-locally', async () => {
    const handleHttpRequest = require('../transport/httpRoutes')({
      memory: {},
      memoryManagementAgent: {},
      reviewQueueActions: {},
      toolLoader: {},
      mcpManager: {},
    });

    let httpStatus = null;
    let responseBody = null;
    const res = {
      writeHead: (status, h) => {
        httpStatus = status;
      },
      end: (data) => {
        responseBody = JSON.parse(data);
      }
    };

    const req = {
      method: 'GET',
      url: '/omniroute/status',
      socket: { remoteAddress: '192.168.1.100' },
    };

    const handled = await handleHttpRequest(req, res);
    expect(handled).toBe(true);
    expect(httpStatus).toBe(403);
    expect(responseBody).toBeDefined();
    expect(responseBody.ok).toBe(false);
    expect(responseBody.error).toBe('internal_endpoint_local_only');
    expect(responseBody.capabilities).toBeUndefined();
  });

  it('14. isRetryableError classifies可恢复/不可恢复错误 correctly', () => {
    const { isRetryableError } = require('../runtime/omniRoute');
    const { LlmClientHttpError, LlmClientTimeoutError } = require('../services/llmClient');

    expect(isRetryableError(new LlmClientHttpError(429, 'Rate Limit'))).toBe(true);
    expect(isRetryableError(new LlmClientHttpError(500, 'Server Error'))).toBe(true);
    expect(isRetryableError(new LlmClientHttpError(503, 'Service Unavailable'))).toBe(true);

    expect(isRetryableError(new LlmClientHttpError(401, 'Unauthorized'))).toBe(false);
    expect(isRetryableError(new LlmClientHttpError(403, 'Forbidden'))).toBe(false);
    expect(isRetryableError(new LlmClientHttpError(400, 'Bad Request'))).toBe(false);

    expect(isRetryableError(new LlmClientTimeoutError('Timeout'))).toBe(true);
    const abortErr = new Error('The user aborted a request.');
    abortErr.name = 'AbortError';
    expect(isRetryableError(abortErr)).toBe(true);

    const fetchErr = new TypeError('fetch failed');
    expect(isRetryableError(fetchErr)).toBe(true);
    const connRefused = new Error('connection refused');
    connRefused.code = 'ECONNREFUSED';
    expect(isRetryableError(connRefused)).toBe(true);
  });

  it('15. chatCompletion retries candidate providers on 429/5xx and throws on 401 immediately', async () => {
    const { chatCompletion } = require('../services/llmClient');

    process.env.DEEPSEEK_BASE_URL = 'https://ds-fallback.api/v1';
    process.env.DEEPSEEK_API_KEY = 'ds-key-fallback';

    process.env.NEWAPI_BASE_URL = 'https://newapi-fallback.api/v1';
    process.env.NEWAPI_API_KEY = 'newapi-key-fallback';

    const originalFetch = globalThis.fetch;
    let requestCount = 0;
    const requestedUrls = [];

    globalThis.fetch = async (url, options) => {
      requestCount++;
      requestedUrls.push(url);
      if (url.includes('newapi-fallback.api')) {
        return {
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable',
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'successful fallback summary' } }]
        }),
      };
    };

    try {
      const res = await chatCompletion({
        provider: {
          capability: 'oct-plan', // skips current/current since it is unconfigured
        },
        messages: [{ role: 'user', content: 'test-summary' }],
      });

      expect(res.content).toBe('successful fallback summary');
      expect(requestCount).toBe(2);
      expect(requestedUrls[0]).toBe('https://newapi-fallback.api/v1/chat/completions');
      expect(requestedUrls[1]).toBe('https://ds-fallback.api/v1/chat/completions');

      requestCount = 0;
      requestedUrls.length = 0;
      globalThis.fetch = async (url, options) => {
        requestCount++;
        requestedUrls.push(url);
        return {
          ok: false,
          status: 401,
          text: async () => 'Unauthorized',
        };
      };

      await expect(chatCompletion({
        provider: {
          capability: 'oct-plan',
        },
        messages: [{ role: 'user', content: 'test-summary' }],
      })).rejects.toThrow('LLM_HTTP_401');

      expect(requestCount).toBe(1);
      expect(requestedUrls[0]).toBe('https://newapi-fallback.api/v1/chat/completions');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('16. streamChat retries candidate providers on 503 and respects delta cutoff', async () => {
    const { streamChat } = require('../ai');
    const ProviderRouter = require('../runtime/providerRouter');

    const originalResolve = ProviderRouter.prototype.resolve;
    ProviderRouter.prototype.resolve = function() {
      return null; // skips current/current
    };

    process.env.DEEPSEEK_BASE_URL = 'https://ds-test.api/v1';
    process.env.DEEPSEEK_API_KEY = 'ds-key-test';

    process.env.DASHSCOPE_BASE_URL = 'https://bailian-test.api/v1';
    process.env.DASHSCOPE_API_KEY = 'bailian-key-test';

    const originalFetch = globalThis.fetch;
    const requestedUrls = [];

    globalThis.fetch = async (url, options) => {
      requestedUrls.push(url);

      if (url.includes('ds-test.api')) {
        return {
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable',
        };
      }

      const encoder = new TextEncoder();
      const mockChunk = `data: ${JSON.stringify({
        choices: [{
          delta: { content: 'bailian candidate stream content' },
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
      let resultText = '';
      await streamChat({
        messages: [{ role: 'user', content: 'test-stream' }],
        capability: 'oct-chat',
        onDelta: (delta) => {
          resultText += delta;
        },
        onDone: () => {},
        onError: () => {},
      });

      expect(resultText).toBe('bailian candidate stream content');
      expect(requestedUrls).toContain('https://ds-test.api/v1/chat/completions');
      expect(requestedUrls).toContain('https://bailian-test.api/v1/chat/completions');
    } finally {
      globalThis.fetch = originalFetch;
      ProviderRouter.prototype.resolve = originalResolve;
    }
  });

  describe('Phase 7: Credential Vault and Configuration Convergence', () => {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const omniConfig = require('../runtime/omniRoute.config');
    const tempConfigPath = path.join(os.tmpdir(), `omniRoute.config.test.${process.pid}.${Date.now()}.json`);

    beforeEach(() => {
      process.env.OMNIROUTE_CONFIG_FILE = tempConfigPath;
      omniConfig.clearCache();
      if (fs.existsSync(tempConfigPath)) {
        try { fs.unlinkSync(tempConfigPath); } catch (_) {}
      }
    });

    afterEach(() => {
      delete process.env.OMNIROUTE_CONFIG_FILE;
      omniConfig.clearCache();
      if (fs.existsSync(tempConfigPath)) {
        try { fs.unlinkSync(tempConfigPath); } catch (_) {}
      }
    });

    it('17. gets correct config path and writes default structure if file not exists', () => {
      expect(omniConfig.getConfigPath()).toBe(tempConfigPath);
      const loaded = omniConfig.loadConfig();
      expect(loaded).toEqual({ routes: {}, credentials: {} });
    });

    it('18. saves and loads routes and credentials correctly', () => {
      const successRoute = omniConfig.updateRouteCandidates('oct-chat', [
        { provider: 'deepseek', model: 'deepseek-v4-flash' }
      ]);
      expect(successRoute).toBe(true);

      const successCred = omniConfig.updateCredential('deepseek', {
        apiKey: 'sk-vault-test-12345',
        baseUrl: 'https://vault.deepseek.api/v1'
      });
      expect(successCred).toBe(true);

      omniConfig.clearCache();

      const loaded = omniConfig.loadConfig();
      expect(loaded.routes['oct-chat'].candidates).toEqual([
        { provider: 'deepseek', model: 'deepseek-v4-flash' }
      ]);
      expect(loaded.credentials['deepseek']).toEqual({
        apiKey: 'sk-vault-test-12345',
        baseUrl: 'https://vault.deepseek.api/v1'
      });
    });

    it('19. prioritizes dynamic route candidates from omniRoute.config.json', () => {
      omniConfig.updateRouteCandidates('oct-chat', [
        { provider: 'newapi', model: 'custom-model-from-vault' }
      ]);

      const res = omniRoute.resolveCapability('oct-chat');
      // Default oct-chat would try current, deepseek, etc.
      // But now it should only resolve using custom candidates override.
      // Let's configure custom credentials for newapi to make it resolve successfully.
      process.env.NEWAPI_BASE_URL = 'https://newapi.vault.api/v1';
      process.env.NEWAPI_API_KEY = 'newapi-vault-key';

      const resolved = omniRoute.resolveCapability('oct-chat');
      expect(resolved).toBeDefined();
      expect(resolved.providerId).toBe('newapi');
      expect(resolved.model).toBe('custom-model-from-vault');
      expect(resolved.baseUrl).toBe('https://newapi.vault.api/v1');
    });

    it('20. prioritizes credentials from omniRoute.config.json and reports source as omniroute_vault_<provider>', () => {
      omniConfig.updateCredential('deepseek', {
        apiKey: 'sk-vault-secret-key-98765',
        baseUrl: 'https://vault-endpoint.deepseek.com/v1'
      });

      // Even if environment variable is set differently, vault takes priority
      process.env.DEEPSEEK_BASE_URL = 'https://env-endpoint.deepseek.com/v1';
      process.env.DEEPSEEK_API_KEY = 'sk-env-secret-key';

      const resolved = omniRoute.resolveCapability('oct-chat');
      expect(resolved).toBeDefined();
      expect(resolved.providerId).toBe('deepseek');
      expect(resolved.baseUrl).toBe('https://vault-endpoint.deepseek.com/v1');
      expect(resolved.apiKey).toBe('sk-vault-secret-key-98765');
      expect(resolved.source).toBe('omniroute_vault_deepseek');
    });

    it('21. falls back to legacy credentials/config when vault entry is empty', () => {
      process.env.DEEPSEEK_BASE_URL = 'https://env-endpoint.deepseek.com/v1';
      process.env.DEEPSEEK_API_KEY = 'sk-env-secret-key';

      // Load config will return empty since no file exists
      const resolved = omniRoute.resolveCapability('oct-chat');
      expect(resolved).toBeDefined();
      expect(resolved.providerId).toBe('deepseek');
      expect(resolved.baseUrl).toBe('https://env-endpoint.deepseek.com/v1');
      expect(resolved.apiKey).toBe('sk-env-secret-key');
      expect(resolved.source).toBe('omniroute_candidate_deepseek');
    });

    it('22. status endpoint does not leak dynamic vault credentials', async () => {
      omniConfig.updateCredential('deepseek', {
        apiKey: 'sk-vault-secret-key-leak-check',
        baseUrl: 'https://vault.deepseek.api/v1'
      });

      const status = omniRoute.inspectCapability('oct-chat');
      expect(status).toBeDefined();
      const deepseekCand = status.candidates.find((c) => c.provider === 'deepseek');
      expect(deepseekCand).toBeDefined();
      expect(deepseekCand.available).toBe(true);
      expect(deepseekCand.hasApiKey).toBe(true);

      const serialized = JSON.stringify(status);
      expect(serialized).not.toContain('sk-vault-secret-key-leak-check');
    });

    it('23. malformed or invalid json in config file does not crash loadConfig() and returns default empty structure', () => {
      fs.writeFileSync(tempConfigPath, 'INVALID_JSON_HERE_NO_PARSE', 'utf-8');
      omniConfig.clearCache();
      const loaded = omniConfig.loadConfig();
      expect(loaded).toEqual({ routes: {}, credentials: {} });
    });

    it('24. filters out malformed or invalid candidate entries in routes, preserving valid ones', () => {
      const rawWithBadCandidates = {
        routes: {
          'oct-chat': {
            candidates: [
              { provider: 'deepseek', model: 'deepseek-chat' }, // valid
              { provider: '', model: 'valid-model' }, // invalid provider
              { provider: 'valid-provider', model: 123 }, // invalid model type
              'not-an-object-candidate', // invalid candidate type
              null, // null candidate
            ]
          }
        }
      };

      const validated = omniConfig.normalizeAndValidate(rawWithBadCandidates);
      expect(validated.routes['oct-chat']).toBeDefined();
      expect(validated.routes['oct-chat'].candidates).toEqual([
        { provider: 'deepseek', model: 'deepseek-chat' }
      ]);
    });

    it('25. returns null for route candidates when all candidates in capability definition are filtered out', () => {
      const rawAllBad = {
        routes: {
          'oct-chat': {
            candidates: [
              { provider: '', model: '' },
              { provider: 'only-provider' }, // missing model
            ]
          }
        }
      };

      const validated = omniConfig.normalizeAndValidate(rawAllBad);
      // Since all candidates are invalid, the entire capability key in routes is filtered out
      expect(validated.routes['oct-chat']).toBeUndefined();

      // getRouteCandidates should return null
      fs.writeFileSync(tempConfigPath, JSON.stringify(rawAllBad), 'utf-8');
      omniConfig.clearCache();
      const res = omniConfig.getRouteCandidates('oct-chat');
      expect(res).toBeNull();
    });

    it('26. filters out malformed credential blocks when credentials or specific entry is not an object', () => {
      const rawBadCredentials = {
        credentials: {
          'deepseek': 'not-an-object-credential', // invalid entry
          'bailian': null, // null entry
          'openai': { apiKey: 'sk-123', baseUrl: 'https://api.openai.com' } // valid
        }
      };

      const validated = omniConfig.normalizeAndValidate(rawBadCredentials);
      expect(validated.credentials['deepseek']).toBeUndefined();
      expect(validated.credentials['bailian']).toBeUndefined();
      expect(validated.credentials['openai']).toEqual({ apiKey: 'sk-123', baseUrl: 'https://api.openai.com' });
    });

    it('27. normalizes credential properties to empty string if apiKey/baseUrl are not strings', () => {
      const rawBadTypes = {
        credentials: {
          'deepseek': { apiKey: 12345, baseUrl: true } // invalid property types
        }
      };

      const validated = omniConfig.normalizeAndValidate(rawBadTypes);
      expect(validated.credentials['deepseek']).toEqual({ apiKey: '', baseUrl: '' });
    });
  });
});
