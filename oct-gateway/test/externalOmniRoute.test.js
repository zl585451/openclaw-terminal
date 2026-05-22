'use strict';

const { describe, it, expect, beforeEach, afterEach, vi } = globalThis;
const config = require('../config');
const externalOmniRoute = require('../runtime/externalOmniRoute');
const llmClient = require('../services/llmClient');
const ai = require('../ai');

describe('external OmniRoute baseline adapter (Phase 5)', () => {
  const originalGetEnvOrConfig = config.getEnvOrConfig;
  let values = {};

  beforeEach(() => {
    values = {};
    config.getEnvOrConfig = (key) => values[key] ?? '';
  });

  afterEach(() => {
    config.getEnvOrConfig = originalGetEnvOrConfig;
  });

  it('reads external OmniRoute config as a single model outlet', () => {
    values = {
      OCT_USE_EXTERNAL_OMNIROUTE: 'true',
      OMNIROUTE_BASE_URL: 'https://omni.example/v1/',
      OMNIROUTE_API_KEY: 'sk-omni-test',
      OMNIROUTE_MODEL: 'combo/chat',
    };

    const snapshot = externalOmniRoute.getExternalGatewayConfig();
    expect(snapshot.enabled).toBe(true);
    expect(snapshot.baseUrl).toBe('https://omni.example/v1');
    expect(snapshot.configured).toBe(true);
    expect(snapshot.model).toBe('combo/chat');
    expect(snapshot.models.default).toBe('combo/chat');
  });

  it('returns disabled status without probing when external mode is off', async () => {
    values = { OCT_USE_EXTERNAL_OMNIROUTE: 'false' };
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
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await externalOmniRoute.checkConnectivity({ fetchImpl: fetchMock });
    expect(result.ok).toBe(true);
    expect(result.status).toBe('reachable');
    expect(fetchMock).toHaveBeenCalledWith('https://omni.example/v1/models', {
      method: 'GET',
      headers: { Authorization: 'Bearer sk-omni-live' },
      signal: expect.any(AbortSignal),
    });
  });

  it('parses OpenAI-compatible /models results for settings model selection', async () => {
    values = {
      OCT_USE_EXTERNAL_OMNIROUTE: 'true',
      OMNIROUTE_BASE_URL: 'https://omni.example/v1',
      OMNIROUTE_API_KEY: 'sk-omni-live',
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          { id: 'combo/chat' },
          { id: 'deepseek/deepseek-v4-flash' },
          { id: 'combo/chat' },
        ],
      }),
    });

    const result = await externalOmniRoute.checkConnectivity({ fetchImpl: fetchMock });
    expect(result.availableModels).toEqual(['combo/chat', 'deepseek/deepseek-v4-flash']);

    const status = await externalOmniRoute.inspectExternalGateway({ fetchImpl: fetchMock });
    expect(status.availableModels).toEqual(['combo/chat', 'deepseek/deepseek-v4-flash']);
  });

  it('resolves all legacy capability targets to the same external OmniRoute outlet when configured', () => {
    values = {
      OCT_USE_EXTERNAL_OMNIROUTE: 'true',
      OMNIROUTE_BASE_URL: 'https://omni.example/v1',
      OMNIROUTE_API_KEY: 'sk-omni-live',
    };

    const target = externalOmniRoute.resolveCapabilityTarget('oct-tool-safe');
    expect(target).toBeDefined();
    expect(target.providerId).toBe('external_omniroute');
    expect(target.baseUrl).toBe('https://omni.example/v1');
    expect(target.apiKey).toBe('sk-omni-live');
    expect(target.model).toBe('combo/chat'); // default alias
    expect(target.capability).toBe('default');
  });

  it('ignores legacy plan/tool overrides and keeps one configured outlet', () => {
    values = {
      OCT_USE_EXTERNAL_OMNIROUTE: 'true',
      OMNIROUTE_BASE_URL: 'https://omni.example/v1',
      OMNIROUTE_API_KEY: 'sk-omni-live',
      OMNIROUTE_MODEL: 'free',
      OMNIROUTE_PLAN_MODEL: 'plan-should-not-apply',
      OMNIROUTE_TOOL_MODEL: 'tool-should-not-apply',
    };

    const snapshot = externalOmniRoute.getExternalGatewayConfig();
    expect(snapshot.model).toBe('free');
    expect(snapshot.models.default).toBe('free');
  });

  it('supports legacy OMNIROUTE_CHAT_MODEL as a read-only fallback during migration', () => {
    values = {
      OCT_USE_EXTERNAL_OMNIROUTE: 'true',
      OMNIROUTE_BASE_URL: 'https://omni.example/v1',
      OMNIROUTE_API_KEY: 'sk-omni-live',
      OMNIROUTE_CHAT_MODEL: 'legacy-chat',
    };

    const snapshot = externalOmniRoute.getExternalGatewayConfig();
    expect(snapshot.model).toBe('legacy-chat');
    expect(snapshot.models.default).toBe('legacy-chat');
  });
});
