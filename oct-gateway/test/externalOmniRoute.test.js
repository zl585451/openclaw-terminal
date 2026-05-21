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
    expect(snapshot.models['oct-plan']).toBe('combo/plan');
    expect(snapshot.models['oct-tool-safe']).toBe('combo/tool');
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

  it('resolves capability targets to external OmniRoute when configured', () => {
    values = {
      OCT_USE_EXTERNAL_OMNIROUTE: 'true',
      OMNIROUTE_BASE_URL: 'https://omni.example/v1',
      OMNIROUTE_API_KEY: 'sk-omni-live',
    };

    const target = externalOmniRoute.resolveCapabilityTarget('oct-chat');
    expect(target).toBeDefined();
    expect(target.providerId).toBe('external_omniroute');
    expect(target.baseUrl).toBe('https://omni.example/v1');
    expect(target.apiKey).toBe('sk-omni-live');
    expect(target.model).toBe('combo/chat'); // default alias
  });
});
