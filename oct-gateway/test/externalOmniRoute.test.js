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
});
