import { describe, expect, it, vi } from 'vitest';
import {
  OMNIROUTE_LIVE_ALIAS_UNKNOWN,
  formatLiveOmniRouteAlias,
  requestOmniRouteStatus,
} from '../../ui/settings/tabs/ConnectionTabView';

describe('OmniRoute settings diagnostics', () => {
  it('shows only live alias values reported by the gateway', () => {
    const externalGateway = {
      enabled: true,
      configured: true,
      baseUrl: 'http://localhost:20128/v1',
      hasApiKey: true,
      models: {
        'oct-chat': 'combo/chat-live',
      },
      connectivity: {
        ok: true,
        status: 'ok',
        httpStatus: 200,
        checkedUrl: 'http://127.0.0.1:18790/omniroute/status',
        error: null,
      },
    };

    expect(formatLiveOmniRouteAlias(externalGateway, 'oct-chat')).toBe('combo/chat-live');
  });

  it('does not treat missing live alias values as if draft/default values were active', () => {
    const externalGateway = {
      enabled: true,
      configured: true,
      baseUrl: 'http://localhost:20128/v1',
      hasApiKey: true,
      models: {},
      connectivity: {
        ok: true,
        status: 'ok',
        httpStatus: 200,
        checkedUrl: 'http://127.0.0.1:18790/omniroute/status',
        error: null,
      },
    };

    expect(formatLiveOmniRouteAlias(externalGateway, 'oct-plan')).toBe(OMNIROUTE_LIVE_ALIAS_UNKNOWN);
  });

  it('reads OmniRoute diagnostics through the Electron bridge instead of a direct hardcoded fetch', async () => {
    const getOmniRouteStatus = vi.fn().mockResolvedValue({
      success: true,
      data: {
        externalGateway: {
          enabled: true,
          configured: true,
          baseUrl: 'http://localhost:20128/v1',
          hasApiKey: true,
          models: {
            'oct-chat': 'combo/chat-live',
            'oct-plan': 'combo/plan-live',
            'oct-tool-safe': 'combo/tool-live',
          },
          connectivity: {
            ok: true,
            status: 'ok',
            httpStatus: 200,
            checkedUrl: 'http://127.0.0.1:18790/omniroute/status',
            error: null,
          },
        },
      },
    });

    const result = await requestOmniRouteStatus({ getOmniRouteStatus });

    expect(getOmniRouteStatus).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.data?.externalGateway?.models?.['oct-tool-safe']).toBe('combo/tool-live');
  });

  it('fails clearly when the Electron status bridge is unavailable', async () => {
    const result = await requestOmniRouteStatus({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Gateway 状态桥未就绪');
  });
});
