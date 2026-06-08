'use strict';

const { describe, it, expect, beforeEach, afterEach, vi } = globalThis;
const omniRoute = require('../runtime/omniRoute');
const config = require('../config');
const externalOmniRoute = require('../runtime/externalOmniRoute');
const llmClient = require('../services/llmClient');
const ai = require('../ai');

describe('OmniRoute Governance Core (Phase 5)', () => {
  const originalEnv = {};
  const originalGetEnvOrConfig = config.getEnvOrConfig;
  const envVars = [
    'OMNIROUTE_MODEL',
    'OMNIROUTE_BASE_URL',
    'OMNIROUTE_API_KEY',
    'OMNIROUTE_CHAT_MODEL',
    'OCT_USE_EXTERNAL_OMNIROUTE',
    'SUMMARIZER_BASE_URL',
    'SUMMARIZER_API_KEY',
    'SUMMARIZER_MODEL',
  ];

  beforeEach(() => {
    envVars.forEach((k) => {
      originalEnv[k] = process.env[k];
    });
    envVars.forEach((k) => {
      delete process.env[k];
    });
    config.getEnvOrConfig = (key) => process.env[key] || '';
  });

  afterEach(() => {
    envVars.forEach((k) => {
      if (originalEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = originalEnv[k];
      }
    });
    config.getEnvOrConfig = originalGetEnvOrConfig;
  });

  it('1. returns null for unknown capability', () => {
    const res = omniRoute.resolveCapability('unknown-cap');
    expect(res).toBeNull();
  });

  it('2. listCapabilities exposes one runtime outlet while legacy aliases remain compatible', () => {
    expect(omniRoute.isCapabilityAlias('oct-chat')).toBe(true);
    expect(omniRoute.isCapabilityAlias('oct-plan')).toBe(true);
    expect(omniRoute.isCapabilityAlias('oct-tool-safe')).toBe(true);
    expect(omniRoute.isCapabilityAlias('unknown')).toBe(false);

    const list = omniRoute.listCapabilities();
    expect(list).toEqual(['default']);
  });

  it('3. resolves capability strictly using external OmniRoute target', () => {
    process.env.OCT_USE_EXTERNAL_OMNIROUTE = 'true';
    process.env.OMNIROUTE_BASE_URL = 'https://omni-test.api/v1';
    process.env.OMNIROUTE_API_KEY = 'sk-omni-secret';
    process.env.OMNIROUTE_MODEL = 'my-chat-combo';

    const res = omniRoute.resolveCapability('oct-chat');
    expect(res).toBeDefined();
    expect(res.providerId).toBe('external_omniroute');
    expect(res.baseUrl).toBe('https://omni-test.api/v1');
    expect(res.apiKey).toBe('sk-omni-secret');
    expect(res.model).toBe('my-chat-combo');
  });

  it('4. returns null for resolveCapability if OmniRoute is not configured', () => {
    const res = omniRoute.resolveCapability('oct-chat');
    expect(res).toBeNull();
  });

  it('5. resolveAllCandidates returns single OmniRoute list or empty', () => {
    expect(omniRoute.resolveAllCandidates('oct-chat')).toEqual([]);

    process.env.OCT_USE_EXTERNAL_OMNIROUTE = 'true';
    process.env.OMNIROUTE_BASE_URL = 'https://omni-test.api/v1';
    process.env.OMNIROUTE_API_KEY = 'sk-omni-secret';

    const list = omniRoute.resolveAllCandidates('oct-chat');
    expect(list.length).toBe(1);
    expect(list[0].providerId).toBe('external_omniroute');
  });

  it('6. inspectCapability and listCapabilityStatus return correct non-leaking status', () => {
    process.env.OCT_USE_EXTERNAL_OMNIROUTE = 'true';
    process.env.OMNIROUTE_BASE_URL = 'https://omni-test.api/v1';
    process.env.OMNIROUTE_API_KEY = 'sk-omni-secret';

    const status = omniRoute.inspectCapability('oct-chat');
    expect(status).toBeDefined();
    expect(status.capability).toBe('default');
    expect(status.status).toBe('healthy');
    expect(status.candidates[0].hasApiKey).toBe(true);
    expect(status.candidates[0].apiKey).toBeUndefined(); // strictly no leak
  });

  it('7. isRetryableError classifies error correctly', () => {
    const { LlmClientHttpError, LlmClientTimeoutError } = require('../services/llmClient');

    expect(omniRoute.isRetryableError(new LlmClientHttpError(429, 'Rate Limit'))).toBe(true);
    expect(omniRoute.isRetryableError(new LlmClientHttpError(500, 'Server Error'))).toBe(true);
    expect(omniRoute.isRetryableError(new LlmClientHttpError(503, 'Service Unavailable'))).toBe(true);
    expect(omniRoute.isRetryableError(new LlmClientHttpError(401, 'Unauthorized'))).toBe(false);

    expect(omniRoute.isRetryableError(new LlmClientTimeoutError('Timeout'))).toBe(true);
    const fetchErr = new TypeError('fetch failed');
    expect(omniRoute.isRetryableError(fetchErr)).toBe(true);
  });

  it('8. chatCompletion throws LLM_NOT_CONFIGURED if external OmniRoute is unconfigured', async () => {
    await expect(llmClient.chatCompletion({
      provider: { capability: 'oct-chat' },
      messages: [{ role: 'user', content: 'hi' }]
    })).rejects.toThrow('LLM_NOT_CONFIGURED');
  });

  it('9. streamChat keeps the same model outlet during tool loop', async () => {
    process.env.OCT_USE_EXTERNAL_OMNIROUTE = 'true';
    process.env.OMNIROUTE_BASE_URL = 'https://omni-test.api/v1';
    process.env.OMNIROUTE_API_KEY = 'sk-omni-secret';
    process.env.OMNIROUTE_MODEL = 'combo-chat';

    const originalFetch = globalThis.fetch;
    let requestModel = null;

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body || '{}');
      requestModel = body.model;
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'chunk' } }] })}\n\ndata: [DONE]\n\n`));
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
      await ai.streamChat({
        messages: [{ role: 'user', content: 'hi' }],
        onDelta: () => {},
        onDone: () => {},
        onError: () => {},
      });
      expect(requestModel).toBe('combo-chat');

      await ai.streamChat({
        messages: [{ role: 'user', content: 'hi' }],
        preserveToolChain: true,
        onDelta: () => {},
        onDone: () => {},
        onError: () => {},
      });
      expect(requestModel).toBe('combo-chat');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('10. resolveProviderFor supports developer overrides when OmniRoute is unconfigured', () => {
    process.env.SUMMARIZER_BASE_URL = 'https://summarizer.api/v1';
    process.env.SUMMARIZER_API_KEY = 'sk-sum-secret';
    process.env.SUMMARIZER_MODEL = 'sum-model-dev';

    const resolved = llmClient.resolveProviderFor('general', 'oct-plan');
    expect(resolved.baseUrl).toBe('https://summarizer.api/v1');
    expect(resolved.apiKey).toBe('sk-sum-secret');
    expect(resolved.model).toBe('sum-model-dev');
  });

  it('11. streamChat uses the local provider when external OmniRoute mode is disabled', async () => {
    process.env.OCT_USE_EXTERNAL_OMNIROUTE = 'false';
    const originalFetch = globalThis.fetch;
    const originalGetProviderConfig = config.getProviderConfig;
    const originalModel = config.DASHSCOPE_MODEL;
    let fetchedUrl = null;
    let requestModel = null;

    config.DASHSCOPE_MODEL = 'local-test-model';
    config.getProviderConfig = () => ({
      id: 'bailian',
      name: 'Local Provider',
      baseUrl: 'https://local-provider.test/v1',
      apiKey: 'sk-local-secret',
      models: [{ id: 'local-test-model', tools: false, thinking: false }],
      supportsStreamOptions: false,
    });
    globalThis.fetch = async (url, options) => {
      fetchedUrl = url;
      requestModel = JSON.parse(options.body || '{}').model;
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'local' } }] })}\n\ndata: [DONE]\n\n`));
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
      await ai.streamChat({
        messages: [{ role: 'user', content: 'hi' }],
        onDelta: () => {},
        onDone: () => {},
        onError: () => {},
      });

      expect(fetchedUrl).toBe('https://local-provider.test/v1/chat/completions');
      expect(requestModel).toBe('local-test-model');
    } finally {
      globalThis.fetch = originalFetch;
      config.getProviderConfig = originalGetProviderConfig;
      config.DASHSCOPE_MODEL = originalModel;
    }
  });
});
