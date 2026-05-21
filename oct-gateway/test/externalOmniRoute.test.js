'use strict';

const config = require('../config');
const externalOmniRoute = require('../runtime/externalOmniRoute');

describe('external OmniRoute baseline adapter', () => {
  const originalGetEnvOrConfig = config.getEnvOrConfig;
  let values = {};

  beforeEach(() => {
    values = {};
    config.getEnvOrConfig = (key) => values[key] ?? '';
  });

  afterEach(() => {
    config.getEnvOrConfig = originalGetEnvOrConfig;
  });

  it('reads external OmniRoute config and resolves capability aliases', () => {
    values = {
      OCT_USE_EXTERNAL_OMNIROUTE: 'true',
      OMNIROUTE_BASE_URL: 'https://omni.example/v1/',
      OMNIROUTE_API_KEY: 'sk-omni-test',
      OMNIROUTE_CHAT_MODEL: 'combo/chat',
      OMNIROUTE_PLAN_MODEL: 'combo/plan',
      OMNIROUTE_TOOL_MODEL: 'combo/tool',
    };

    const snapshot = externalOmniRoute.getExternalGatewayConfig();
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.baseUrl).toBe('https://omni.example/v1');
    expect(snapshot.configured).toBe(true);
    expect(snapshot.models['oct-chat']).toBe('combo/chat');

    const resolved = externalOmniRoute.resolveCapabilityTarget('oct-plan');
    expect(resolved).toEqual({
      providerId: 'external_omniroute',
      baseUrl: 'https://omni.example/v1',
      apiKey: 'sk-omni-test',
      model: 'combo/plan',
      source: 'external_omniroute_config',
      capability: 'oct-plan',
    });
  });

  it('returns disabled status without probing when external mode is off', async () => {
    const fetchMock = vi.fn();
    const result = await externalOmniRoute.checkConnectivity({ fetchImpl: fetchMock });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('probes /models using Bearer token when external mode is enabled', async () => {
    values = {
      OCT_USE_EXTERNAL_OMNIROUTE: 'true',
      OMNIROUTE_BASE_URL: 'https://omni.example/v1',
      OMNIROUTE_API_KEY: 'sk-omni-live',
      OMNIROUTE_CHAT_MODEL: 'combo/chat',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    });

    const result = await externalOmniRoute.checkConnectivity({ fetchImpl: fetchMock, timeoutMs: 50 });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://omni.example/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Authorization: 'Bearer sk-omni-live',
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.status).toBe('reachable');
    expect(result.httpStatus).toBe(200);
  });

  it('4. allows oct-tool-safe to switch to external OmniRoute', () => {
    values = {
      OCT_USE_EXTERNAL_OMNIROUTE: 'true',
      OMNIROUTE_BASE_URL: 'https://omni.example/v1/',
      OMNIROUTE_API_KEY: 'sk-omni-test',
      OMNIROUTE_CHAT_MODEL: 'combo/chat',
      OMNIROUTE_PLAN_MODEL: 'combo/plan',
      OMNIROUTE_TOOL_MODEL: 'combo/tool',
    };

    const resolvedChat = externalOmniRoute.resolveCapabilityTarget('oct-chat');
    expect(resolvedChat).not.toBeNull();
    expect(resolvedChat.model).toBe('combo/chat');

    const resolvedTool = externalOmniRoute.resolveCapabilityTarget('oct-tool-safe');
    expect(resolvedTool).not.toBeNull();
    expect(resolvedTool.model).toBe('combo/tool');
  });

  it('5. fallback when external OmniRoute config is incomplete or disabled', () => {
    values = {
      OCT_USE_EXTERNAL_OMNIROUTE: 'false',
      OMNIROUTE_BASE_URL: 'https://omni.example/v1/',
      OMNIROUTE_API_KEY: 'sk-omni-test',
      OMNIROUTE_CHAT_MODEL: 'combo/chat',
    };
    expect(externalOmniRoute.resolveCapabilityTarget('oct-chat')).toBeNull();

    values = {
      OCT_USE_EXTERNAL_OMNIROUTE: 'true',
      OMNIROUTE_BASE_URL: '',
      OMNIROUTE_API_KEY: 'sk-omni-test',
      OMNIROUTE_CHAT_MODEL: 'combo/chat',
    };
    expect(externalOmniRoute.resolveCapabilityTarget('oct-chat')).toBeNull();
  });

  describe('Integration with llmClient & streamChat', () => {
    const originalFetch = globalThis.fetch;
    const originalGetProviderConfig = config.getProviderConfig;
    let llmClient, ai;

    beforeEach(() => {
      llmClient = require('../services/llmClient');
      ai = require('../ai');
      globalThis.fetch = vi.fn();
      config.getProviderConfig = () => ({
        id: 'deepseek',
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-ds-key',
        model: 'deepseek-chat',
        models: [],
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      config.getProviderConfig = originalGetProviderConfig;
    });

    it('6. routes resolveProviderFor to external OmniRoute when active', () => {
      values = {
        OCT_USE_EXTERNAL_OMNIROUTE: 'true',
        OMNIROUTE_BASE_URL: 'https://omni.example/v1/',
        OMNIROUTE_API_KEY: 'sk-omni-test',
        OMNIROUTE_PLAN_MODEL: 'combo/plan',
      };

      const provider = llmClient.resolveProviderFor('script_adapter', 'oct-plan');
      expect(provider.baseUrl).toBe('https://omni.example/v1');
      expect(provider.apiKey).toBe('sk-omni-test');
      expect(provider.model).toBe('combo/plan');
      expect(provider.providerId).toBe('external_omniroute');
    });

    it('7. chatCompletion hits external OmniRoute and supports fallback on 503', async () => {
      values = {
        OCT_USE_EXTERNAL_OMNIROUTE: 'true',
        OMNIROUTE_BASE_URL: 'https://omni.example/v1/',
        OMNIROUTE_API_KEY: 'sk-omni-test',
        OMNIROUTE_CHAT_MODEL: 'combo/chat',
        DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
        DEEPSEEK_API_KEY: 'sk-ds-key',
      };

      const originalConsoleWarn = console.warn;
      console.warn = vi.fn();

      // First call fails with 503 (external), second call succeeds (fallback deepseek)
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'hello from deepseek' } }],
          }),
        });

      const response = await llmClient.chatCompletion({
        provider: {
          capability: 'oct-chat',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-ds-key',
          model: 'deepseek-chat',
        },
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0][0]).toBe('https://omni.example/v1/chat/completions');
      expect(fetch.mock.calls[1][0]).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(response.content).toBe('hello from deepseek');

      console.warn = originalConsoleWarn;
    });

    it('7.1 chatCompletion de-duplicates external OmniRoute before local fallback', async () => {
      values = {
        OCT_USE_EXTERNAL_OMNIROUTE: 'true',
        OMNIROUTE_BASE_URL: 'https://omni.example/v1/',
        OMNIROUTE_API_KEY: 'sk-omni-test',
        OMNIROUTE_CHAT_MODEL: 'combo/chat',
        DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
        DEEPSEEK_API_KEY: 'sk-ds-key',
      };

      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: 'hello from deepseek' } }],
          }),
        });

      const response = await llmClient.chatCompletion({
        provider: {
          capability: 'oct-chat',
          baseUrl: 'https://omni.example/v1',
          apiKey: 'sk-omni-test',
          model: 'combo/chat',
          providerId: 'external_omniroute',
        },
        messages: [{ role: 'user', content: 'hi' }],
      });

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fetch.mock.calls[0][0]).toBe('https://omni.example/v1/chat/completions');
      expect(fetch.mock.calls[1][0]).toBe('https://api.deepseek.com/v1/chat/completions');
      expect(response.content).toBe('hello from deepseek');
    });

    it('8. chatCompletion throws immediately on 401 without falling back', async () => {
      values = {
        OCT_USE_EXTERNAL_OMNIROUTE: 'true',
        OMNIROUTE_BASE_URL: 'https://omni.example/v1/',
        OMNIROUTE_API_KEY: 'sk-omni-test',
        OMNIROUTE_CHAT_MODEL: 'combo/chat',
      };

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(
        llmClient.chatCompletion({
          provider: { capability: 'oct-chat' },
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).rejects.toThrow('LLM_HTTP_401');

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('9. streamChat maps falsy capability to oct-chat without being confused by long system prompts', async () => {
      values = {
        OCT_USE_EXTERNAL_OMNIROUTE: 'true',
        OMNIROUTE_BASE_URL: 'https://omni.example/v1/',
        OMNIROUTE_API_KEY: 'sk-omni-test',
        OMNIROUTE_CHAT_MODEL: 'combo/chat',
        OMNIROUTE_PLAN_MODEL: 'combo/plan',
      };

      // We test mapping of undefined capability to oct-chat
      fetch.mockResolvedValue({
        ok: true,
        body: {
          getReader() {
            return {
              read: async () => ({ done: true }),
            };
          },
        },
      });

      const onDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();
      const noisySystemPrompt = `你是主系统提示词。\n${'记忆提炼规则。'.repeat(80)}`;

      await ai.streamChat({
        messages: [
          { role: 'system', content: noisySystemPrompt },
          { role: 'user', content: 'chat message' },
        ],
        onDelta,
        onDone,
        onError,
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      const calledUrl = fetch.mock.calls[0][0];
      const calledBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(calledUrl).toBe('https://omni.example/v1/chat/completions');
      expect(calledBody.model).toBe('combo/chat');
    });

    it('10. streamChat maps user planning request to oct-plan', async () => {
      values = {
        OCT_USE_EXTERNAL_OMNIROUTE: 'true',
        OMNIROUTE_BASE_URL: 'https://omni.example/v1/',
        OMNIROUTE_API_KEY: 'sk-omni-test',
        OMNIROUTE_CHAT_MODEL: 'combo/chat',
        OMNIROUTE_PLAN_MODEL: 'combo/plan',
      };

      fetch.mockResolvedValue({
        ok: true,
        body: {
          getReader() {
            return {
              read: async () => ({ done: true }),
            };
          },
        },
      });

      const onDelta = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await ai.streamChat({
        messages: [
          { role: 'system', content: '你是主聊天助手。' },
          { role: 'user', content: '请帮我提炼一下规律并总结重点。' }
        ],
        onDelta,
        onDone,
        onError,
      });

      expect(fetch).toHaveBeenCalledTimes(1);
      const calledUrl = fetch.mock.calls[0][0];
      const calledBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(calledUrl).toBe('https://omni.example/v1/chat/completions');
      expect(calledBody.model).toBe('combo/plan');
    });

    it('11. _disableExternalOmniRoute keeps oct-chat on local provider path', async () => {
      values = {
        OCT_USE_EXTERNAL_OMNIROUTE: 'true',
        OMNIROUTE_BASE_URL: 'https://omni.example/v1/',
        OMNIROUTE_API_KEY: 'sk-omni-test',
        OMNIROUTE_CHAT_MODEL: 'combo/chat',
      };

      const ProviderRouter = require('../runtime/providerRouter');
      const originalResolve = ProviderRouter.prototype.resolve;
      const originalProvider = config.currentProvider;
      const originalModel = config.DASHSCOPE_MODEL;

      ProviderRouter.prototype.resolve = function resolvePatched() {
        return {
          provider: { id: 'primary', name: 'primary' },
          apiKey: 'sk-primary',
          baseUrl: 'https://api.primary.com/v1',
          model: 'primary-model',
          caps: config.getModelCaps('primary-model'),
          fallback: { canFallbackToDeepseek: true, canFallbackToBailian: false },
        };
      };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: (async function* body() {
            const encoder = new TextEncoder();
            yield encoder.encode('data: [DONE]\n\n');
          })(),
          headers: new Headers({ 'Content-Type': 'text/event-stream' }),
        });

      const onDone = vi.fn();
      const onError = vi.fn();

      try {
        await ai.streamChat({
          capability: 'oct-chat',
          messages: [{ role: 'user', content: 'hi' }],
          onDelta: vi.fn(),
          onDone,
          onError,
          _disableExternalOmniRoute: true,
        });
      } finally {
        ProviderRouter.prototype.resolve = originalResolve;
        config.currentProvider = originalProvider;
        config.DASHSCOPE_MODEL = originalModel;
      }

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0][0]).toBe('https://api.primary.com/v1/chat/completions');
      expect(fetch.mock.calls.find((call) => String(call[0]).includes('omni.example'))).toBeUndefined();
      expect(onError).not.toHaveBeenCalled();
    });
  });
});
