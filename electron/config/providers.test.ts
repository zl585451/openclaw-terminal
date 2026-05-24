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
    expect(providers['bailian-coding'].baseUrl).toBe('https://coding.dashscope.aliyuncs.com/v1');
    expect(providers.newapi.allowCustomModel).toBe(true);
    expect(providers.google.defaultModel).toBe('google/gemini-2.5-flash');
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
    expect(missing.providers['bailian-coding']).toBeTruthy();

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
    expect(resolveProviderId({ DASHSCOPE_BASE_URL: 'https://coding.dashscope.aliyuncs.com/v1' })).toBe('bailian-coding');
    expect(resolveProviderId({})).toBe('bailian');
  });

  it('projects AI connection settings from config and provider metadata', () => {
    const providers = getFallbackProviders();
    expect(resolveAiConnectionSettings({
      OCT_PROVIDER: 'newapi',
      OCT_MODEL: '__custom__',
      CUSTOM_MODEL: 'combo/free',
      NEWAPI_BASE_URL: 'http://127.0.0.1:20128/v1',
      NEWAPI_API_KEY: 'sk-new',
    }, providers)).toMatchObject({
      providerId: 'newapi',
      baseUrl: 'http://127.0.0.1:20128/v1',
      apiKey: 'sk-new',
      model: 'combo/free',
    });

    expect(resolveAiConnectionSettings({
      OCT_PROVIDER: 'google',
      GOOGLE_AI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai',
      GOOGLE_AI_API_KEY: 'AQ.test',
    }, providers)).toMatchObject({
      providerId: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      apiKey: 'AQ.test',
      model: 'google/gemini-2.5-flash',
    });
  });
});
