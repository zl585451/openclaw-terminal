import { describe, expect, it } from 'vitest';
import {
  getFallbackProviders,
  loadProviderList,
  resolveAiConnectionSettings,
  resolveProviderId,
} from './providers';

describe('electron provider config helpers', () => {
  it('provides the fallback provider list used by Settings UI', () => {
    const providers = getFallbackProviders();
    expect(providers['bailian'].baseUrl).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    expect(Object.keys(providers)).not.toContain(['new', 'api'].join(''));
    expect(providers.google.defaultModel).toBe('google/gemini-3.5-flash');
    expect(providers.groq.defaultModel).toBe('llama-3.3-70b-versatile');
    expect(providers.groq.models.map((model) => model.id)).not.toContain('mixtral-8x7b-32768');
  });

  it('loads gateway providers when available and falls back on missing or failed module', () => {
    const customProviders = {
      custom: {
        id: 'custom',
        name: 'Custom',
        baseUrl: 'http://local/v1',
        keyPlaceholder: '',
        keyLink: '',
        defaultModel: 'm',
        models: [],
      },
    };

    expect(loadProviderList({
      providersPath: 'providers.js',
      existsSync: () => true,
      requireModule: () => ({ PROVIDERS: customProviders }),
    }).providers).toBe(customProviders);

    const missing = loadProviderList({
      providersPath: 'missing.js',
      existsSync: () => false,
      requireModule: () => {
        throw new Error('should not load');
      },
    });
    expect(missing.providers['bailian']).toBeTruthy();

    const failed = loadProviderList({
      providersPath: 'bad.js',
      existsSync: () => true,
      requireModule: () => {
        throw new Error('boom');
      },
    });
    expect(failed.error).toBe('boom');
    expect(failed.providers.deepseek).toBeTruthy();
  });

  it('resolves provider id from explicit provider, custom config, or dashscope coding URL', () => {
    expect(resolveProviderId({ OCT_PROVIDER: 'deepseek' })).toBe('deepseek');
    expect(resolveProviderId({ CUSTOM_MODEL: 'local-model' })).toBe('custom');
    expect(resolveProviderId({ DASHSCOPE_BASE_URL: 'https://coding.dashscope.aliyuncs.com/v1' })).toBe('bailian');
    expect(resolveProviderId({})).toBe('bailian');
  });

  it('projects AI connection settings from config and provider metadata', () => {
    const providers = getFallbackProviders();
    expect(resolveAiConnectionSettings({
      OCT_PROVIDER: 'google',
      OCT_MODEL: '__custom__',
      CUSTOM_MODEL: 'google/gemini-custom',
      GOOGLE_AI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      GOOGLE_AI_API_KEY: 'AQ.test',
    }, providers)).toMatchObject({
      providerId: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: 'AQ.test',
      model: 'google/gemini-custom',
    });
  });

  it('resolves Groq through Groq-scoped config with legacy DashScope fallback', () => {
    const providers = getFallbackProviders();

    expect(resolveAiConnectionSettings({
      OCT_PROVIDER: 'groq',
      GROQ_API_KEY: 'gsk-test',
      GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
    }, providers)).toMatchObject({
      providerId: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk-test',
      model: 'llama-3.3-70b-versatile',
    });

    expect(resolveAiConnectionSettings({
      OCT_PROVIDER: 'groq',
      DASHSCOPE_API_KEY: 'gsk-legacy',
      DASHSCOPE_BASE_URL: 'https://api.groq.com/openai/v1',
    }, providers)).toMatchObject({
      providerId: 'groq',
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk-legacy',
    });
  });
});
