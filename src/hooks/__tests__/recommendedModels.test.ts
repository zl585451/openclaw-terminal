import { describe, expect, it } from 'vitest';
import { getFirstRecommendedModel, getRecommendedModels } from '../settings/recommendedModels';
import type { ProviderEntry } from '../../ui/settings/providerTypes';

function provider(overrides: Partial<ProviderEntry> = {}): ProviderEntry {
  return {
    id: 'bailian',
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyLink: '',
    keyPlaceholder: '',
    defaultModel: 'qwen-plus',
    models: [
      { id: 'qwen-plus', label: 'Qwen Plus', tools: true, thinking: true },
      { id: 'qwen-max', label: 'Qwen Max', tools: true, thinking: false },
      { id: 'qwen-turbo', label: 'Qwen Turbo', tools: true, thinking: false },
      { id: 'extra-model', label: 'Extra', tools: true, thinking: false },
    ],
    ...overrides,
  };
}

describe('beginner recommended models', () => {
  it('derives recommendations from provider metadata instead of a frontend model registry', () => {
    expect(getRecommendedModels(provider())).toEqual([
      'qwen-plus',
      'qwen-max',
      'qwen-turbo',
    ]);
  });

  it('falls back to provider default model when no model list is available', () => {
    const p = provider({ models: [], defaultModel: 'deepseek-v4-flash' });

    expect(getRecommendedModels(p)).toEqual(['deepseek-v4-flash']);
    expect(getFirstRecommendedModel(p)).toBe('deepseek-v4-flash');
  });
});
