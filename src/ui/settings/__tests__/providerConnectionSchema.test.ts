import { describe, expect, it } from 'vitest';
import {
  buildChatProviderConnectionPayload,
  getChatProviderBaseUrlField,
  getChatProviderViewSchema,
  resolveChatProviderModel,
  shouldHideAdvancedBaseUrl,
  shouldUseFreeTextModelInput,
} from '../providerConnectionSchema';

const baseState = {
  DASHSCOPE_API_KEY: 'dash',
  DEEPSEEK_API_KEY: 'deep',
  MINIMAX_API_KEY: 'mini',
  MOONSHOT_API_KEY: 'moon',
  NEWAPI_API_KEY: 'new',
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
  IMAGE_SIZE: '1024x1024',
  TTS_MINIMAX_VOICE_ID: '',
  CUSTOM_API_KEY: 'custom',
  OPENCLAW_WS_URL: '',
  OPENCLAW_TOKEN: '',
  OCT_SETTINGS_MODE: 'advanced' as const,
  OCT_PROVIDER: 'custom',
  OCT_MODEL: '__custom__',
  SCRIPT_ADAPTER_REAL_AGENTS: '',
  CUSTOM_MODEL: 'google/gemini-2.5-pro',
  DASHSCOPE_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
  MINIMAX_BASE_URL: 'https://api.minimaxi.com/v1',
  MOONSHOT_BASE_URL: 'https://api.moonshot.cn/v1',
  NEWAPI_BASE_URL: 'http://127.0.0.1:3000/v1',
  CUSTOM_BASE_URL: 'https://api.siliconflow.cn/v1',
  GOOGLE_AI_API_KEY: 'google',
  GOOGLE_AI_BASE_URL: 'https://aiplatform.googleapis.com/v1beta1/projects/demo/locations/us-central1/endpoints/openapi',
  HTTPS_PROXY: '',
  HTTP_PROXY: '',
  BRAVE_SEARCH_API_KEY: '',
  TAVILY_API_KEY: '',
  VISION_API_KEY: '',
  VISION_BASE_URL: '',
  VISION_MODEL: '',
};

describe('providerConnectionSchema', () => {
  it('maps provider ids to the correct base url field', () => {
    expect(getChatProviderBaseUrlField('google')).toBe('GOOGLE_AI_BASE_URL');
    expect(getChatProviderBaseUrlField('deepseek')).toBe('DEEPSEEK_BASE_URL');
    expect(getChatProviderBaseUrlField('bailian-coding')).toBe('DASHSCOPE_BASE_URL');
  });

  it('resolves custom model payload through schema rules', () => {
    expect(resolveChatProviderModel(baseState, 'custom')).toBe('google/gemini-2.5-pro');
    expect(resolveChatProviderModel(baseState, 'google')).toBe('google/gemini-2.5-pro');
  });

  it('builds connection payload with only the active base url populated', () => {
    const payload = buildChatProviderConnectionPayload(baseState, 'google');
    expect(payload.OCT_MODEL).toBe('google/gemini-2.5-pro');
    expect(payload.GOOGLE_AI_BASE_URL).toContain('aiplatform.googleapis.com');
    expect(payload.CUSTOM_BASE_URL).toBe('');
    expect(payload.DASHSCOPE_BASE_URL).toBe('');
  });

  it('exposes provider view schema for model mode and advanced base url visibility', () => {
    expect(shouldUseFreeTextModelInput('siliconflow')).toBe(true);
    expect(shouldHideAdvancedBaseUrl('custom')).toBe(true);
    expect(getChatProviderViewSchema('minimax').notice?.segments.length).toBeGreaterThan(0);
  });
});
