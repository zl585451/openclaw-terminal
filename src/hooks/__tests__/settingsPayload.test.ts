import { describe, expect, it } from 'vitest';
import {
  applyChatProviderSelection,
  buildAiConnectionTestPayload,
  buildGatewayPayload,
  readChatProviderBaseUrl,
  type ApiKeysState,
  writeChatProviderBaseUrl,
} from '../settings/useApiKeys';
import type { ProviderEntry } from '../../ui/settings/providerTypes';

function baseApiKeys(overrides: Partial<ApiKeysState> = {}): ApiKeysState {
  return {
    DASHSCOPE_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    MINIMAX_API_KEY: '',
    MOONSHOT_API_KEY: '',
    NEWAPI_API_KEY: '',
    IMAGE_PROVIDER: 'minimax',
    IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY: false,
    IMAGE_API_KEY: '',
    IMAGE_BASE_URL: '',
    IMAGE_MODEL: '',
    IMAGE_MINIMAX_API_KEY: '',
    IMAGE_MINIMAX_BASE_URL: '',
    IMAGE_MINIMAX_MODEL: '',
    IMAGE_SILICONFLOW_API_KEY: '',
    IMAGE_SILICONFLOW_BASE_URL: '',
    IMAGE_SILICONFLOW_MODEL: '',
    IMAGE_OPENAI_API_KEY: '',
    IMAGE_OPENAI_BASE_URL: '',
    IMAGE_OPENAI_MODEL: '',
    IMAGE_GOOGLE_API_KEY: '',
    IMAGE_GOOGLE_BASE_URL: '',
    IMAGE_GOOGLE_MODEL: '',
    IMAGE_SIZE: '1024x1024',
    TTS_MINIMAX_VOICE_ID: '',
    CUSTOM_API_KEY: '',
    OPENCLAW_WS_URL: '',
    OPENCLAW_TOKEN: '',
    OCT_SETTINGS_MODE: '',
    OCT_PROVIDER: '',
    OCT_MODEL: '',
    SCRIPT_ADAPTER_REAL_AGENTS: '',
    CUSTOM_MODEL: '',
    DASHSCOPE_BASE_URL: '',
    DEEPSEEK_BASE_URL: '',
    MINIMAX_BASE_URL: '',
    MOONSHOT_BASE_URL: '',
    NEWAPI_BASE_URL: '',
    CUSTOM_BASE_URL: '',
    GOOGLE_AI_API_KEY: '',
    GOOGLE_AI_BASE_URL: '',
    HTTPS_PROXY: '',
    HTTP_PROXY: '',
    BRAVE_SEARCH_API_KEY: '',
    TAVILY_API_KEY: '',
    VISION_API_KEY: '',
    VISION_BASE_URL: '',
    VISION_MODEL: '',
    OMNIROUTE_BASE_URL: '',
    OMNIROUTE_API_KEY: '',
    OMNIROUTE_MODEL: '',
    OCT_USE_EXTERNAL_OMNIROUTE: false,
    ...overrides,
  };
}

describe('settings gateway payload boundary', () => {
  it('persists OmniRoute fields and custom NewAPI model without leaking base URLs across providers', () => {
    const provider: ProviderEntry = {
      id: 'newapi',
      name: 'New API',
      baseUrl: 'http://127.0.0.1:3000/v1',
      keyLink: '',
      keyPlaceholder: '',
      defaultModel: '__custom__',
      models: [],
    };

    const payload = buildGatewayPayload(
      baseApiKeys({
        NEWAPI_API_KEY: 'sk-newapi',
        NEWAPI_BASE_URL: 'http://127.0.0.1:20128/v1',
        OCT_MODEL: '__custom__',
        CUSTOM_MODEL: 'combo/chat-live',
        OMNIROUTE_BASE_URL: 'http://127.0.0.1:20128/v1',
        OMNIROUTE_API_KEY: 'sk-omni',
        OMNIROUTE_MODEL: 'combo/free',
        OCT_USE_EXTERNAL_OMNIROUTE: true,
      }),
      'newapi',
      provider,
      { BRAVE_SEARCH_API_KEY: '', TAVILY_API_KEY: '' },
    );

    expect(payload.OCT_PROVIDER).toBe('newapi');
    expect(payload.OCT_MODEL).toBe('combo/chat-live');
    expect(payload.NEWAPI_BASE_URL).toBe('http://127.0.0.1:20128/v1');
    expect(payload.DASHSCOPE_BASE_URL).toBe('');
    expect(payload.OMNIROUTE_BASE_URL).toBe('http://127.0.0.1:20128/v1');
    expect(payload.OMNIROUTE_API_KEY).toBe('sk-omni');
    expect(payload.OMNIROUTE_MODEL).toBe('combo/free');
    expect(payload.OCT_USE_EXTERNAL_OMNIROUTE).toBe(true);
  });

  it('keeps frontend payload as a settings projection while runtime provider resolution remains gateway-owned', () => {
    const provider: ProviderEntry = {
      id: 'google',
      name: 'Google',
      baseUrl: 'https://aiplatform.googleapis.com/v1beta1/projects/test/locations/us-central1/endpoints/openapi',
      keyLink: '',
      keyPlaceholder: '',
      defaultModel: 'google/gemini-2.5-flash',
      models: [],
    };

    const payload = buildGatewayPayload(
      baseApiKeys({
        GOOGLE_AI_API_KEY: 'AQ.test',
        GOOGLE_AI_BASE_URL: provider.baseUrl,
        OCT_MODEL: 'google/gemini-2.5-flash',
        DASHSCOPE_BASE_URL: 'https://should-not-leak.example/v1',
      }),
      'google',
      provider,
      { BRAVE_SEARCH_API_KEY: 'brave', TAVILY_API_KEY: 'tavily' },
    );

    expect(payload.OCT_PROVIDER).toBe('google');
    expect(payload.GOOGLE_AI_BASE_URL).toBe(provider.baseUrl);
    expect(payload.GOOGLE_AI_API_KEY).toBe('AQ.test');
    expect(payload.DASHSCOPE_BASE_URL).toBe('');
    expect(payload.BRAVE_SEARCH_API_KEY).toBe('brave');
    expect(payload.TAVILY_API_KEY).toBe('tavily');
  });

  it('reuses the same chat provider projection for advanced connection tests', () => {
    const provider: ProviderEntry = {
      id: 'google',
      name: 'Google',
      baseUrl: 'https://aiplatform.googleapis.com/v1beta1/projects/test/locations/us-central1/endpoints/openapi',
      keyLink: '',
      keyPlaceholder: '',
      defaultModel: 'google/gemini-2.5-flash',
      models: [],
    };

    const payload = buildAiConnectionTestPayload(
      baseApiKeys({
        GOOGLE_AI_API_KEY: 'AQ.test',
        GOOGLE_AI_BASE_URL: provider.baseUrl,
        OCT_MODEL: '__custom__',
        CUSTOM_MODEL: 'google/gemini-custom',
        DASHSCOPE_BASE_URL: 'https://should-not-leak.example/v1',
      }),
      'google',
      provider,
    );

    expect(payload).toMatchObject({
      OCT_PROVIDER: 'google',
      OCT_MODEL: 'google/gemini-custom',
      GOOGLE_AI_API_KEY: 'AQ.test',
      GOOGLE_AI_BASE_URL: provider.baseUrl,
      DASHSCOPE_BASE_URL: '',
    });
  });

  it('lets beginner connection tests override the selected model while preserving provider-scoped key and URL', () => {
    const provider: ProviderEntry = {
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      keyLink: '',
      keyPlaceholder: '',
      defaultModel: 'deepseek-v4-flash',
      models: [],
    };

    const payload = buildAiConnectionTestPayload(
      baseApiKeys({
        DEEPSEEK_API_KEY: 'sk-deepseek',
        DEEPSEEK_BASE_URL: '',
        OCT_MODEL: 'deepseek-v4-pro',
      }),
      'deepseek',
      provider,
      'deepseek-v4-flash',
    );

    expect(payload).toMatchObject({
      OCT_PROVIDER: 'deepseek',
      OCT_MODEL: 'deepseek-v4-flash',
      DEEPSEEK_API_KEY: 'sk-deepseek',
      DEEPSEEK_BASE_URL: provider.baseUrl,
      DASHSCOPE_BASE_URL: '',
    });
  });

  it('uses shared helpers for provider selection and editable base URL fields', () => {
    const provider: ProviderEntry = {
      id: 'moonshot',
      name: 'Moonshot',
      baseUrl: 'https://api.moonshot.cn/v1',
      keyLink: '',
      keyPlaceholder: '',
      defaultModel: 'kimi-k2.6',
      models: [],
    };

    const selected = applyChatProviderSelection(
      baseApiKeys({
        DASHSCOPE_BASE_URL: 'https://coding.dashscope.aliyuncs.com/v1',
        MOONSHOT_BASE_URL: '',
      }),
      'moonshot',
      provider,
    );

    expect(selected.OCT_PROVIDER).toBe('moonshot');
    expect(selected.OCT_MODEL).toBe('kimi-k2.6');
    expect(readChatProviderBaseUrl(selected, 'moonshot')).toBe(provider.baseUrl);
    expect(selected.DASHSCOPE_BASE_URL).toBe('https://coding.dashscope.aliyuncs.com/v1');

    const edited = writeChatProviderBaseUrl(selected, 'moonshot', 'https://moonshot.example/v1');
    expect(edited.MOONSHOT_BASE_URL).toBe('https://moonshot.example/v1');
    expect(edited.DASHSCOPE_BASE_URL).toBe('https://coding.dashscope.aliyuncs.com/v1');
  });
});
