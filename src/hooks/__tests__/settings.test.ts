import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApiKeys } from '../settings/useApiKeys';
import {
  OMNIROUTE_LIVE_ALIAS_UNKNOWN,
  formatLiveOmniRouteAlias,
  getOmniRouteModelOptions,
  requestOmniRouteStatus,
} from '../../ui/settings/tabs/ConnectionTabView';

describe('OmniRoute settings diagnostics', () => {
  it('shows only live alias values reported by the gateway', () => {
    const externalGateway = {
      enabled: true,
      configured: true,
      baseUrl: 'http://localhost:20128/v1',
      hasApiKey: true,
      model: 'combo/chat-live',
      models: {
        default: 'combo/chat-live',
      },
      connectivity: {
        ok: true,
        status: 'ok',
        httpStatus: 200,
        checkedUrl: 'http://127.0.0.1:18790/omniroute/status',
        error: null,
      },
    };

    expect(formatLiveOmniRouteAlias(externalGateway)).toBe('combo/chat-live');
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

    expect(formatLiveOmniRouteAlias(externalGateway)).toBe(OMNIROUTE_LIVE_ALIAS_UNKNOWN);
  });

  it('builds selectable OmniRoute models from draft, live outlet, and /models data', () => {
    const externalGateway = {
      enabled: true,
      configured: true,
      baseUrl: 'http://localhost:20128/v1',
      hasApiKey: true,
      model: 'combo/chat-live',
      models: {
        default: 'combo/chat-live',
      },
      availableModels: ['combo/free', 'combo/chat-live'],
      connectivity: {
        ok: true,
        status: 'ok',
        httpStatus: 200,
        checkedUrl: 'http://127.0.0.1:18790/omniroute/status',
        error: null,
      },
    };

    expect(getOmniRouteModelOptions(externalGateway, 'gemini')).toEqual([
      'gemini',
      'combo/chat-live',
      'combo/free',
    ]);
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
          model: 'combo/chat-live',
          models: {
            default: 'combo/chat-live',
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
    expect(result.data?.externalGateway?.model).toBe('combo/chat-live');
  });

  it('fails clearly when the Electron status bridge is unavailable', async () => {
    const result = await requestOmniRouteStatus({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Gateway 状态桥未就绪');
  });
});

describe('Settings provider metadata loading', () => {
  it('uses gateway/Electron provider metadata when getProviderList succeeds', async () => {
    const providerList = {
      custom: {
        id: 'custom',
        name: 'Custom Gateway Provider',
        baseUrl: 'http://gateway.example/v1',
        keyLink: '',
        keyPlaceholder: 'sk-custom',
        defaultModel: 'gateway-model',
        models: [
          { id: 'gateway-model', label: 'Gateway Model', tools: true, thinking: false },
          { id: 'gateway-model-2', label: 'Gateway Model 2', tools: true, thinking: false },
        ],
      },
    };
    (window as any).electronAPI = {
      getProviderList: vi.fn().mockResolvedValue({ success: true, data: providerList }),
    };

    const { result } = renderHook(() => useApiKeys());

    await waitFor(() => {
      expect(result.current.providers.custom?.name).toBe('Custom Gateway Provider');
    });
    expect(result.current.providers.custom.models).toHaveLength(2);
  });

  it('falls back to minimal emergency provider metadata when getProviderList is unavailable', async () => {
    (window as any).electronAPI = {};

    const { result } = renderHook(() => useApiKeys());

    await waitFor(() => {
      expect(result.current.providers['bailian']?.baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    });
    expect(result.current.providers['bailian'].models).toEqual([
      { id: 'qwen-plus', label: 'qwen-plus', tools: true, thinking: false },
    ]);
    expect(result.current.providers.deepseek.defaultModel).toBe('deepseek-v4-flash');
  });
});
