import { describe, expect, it } from 'vitest';
import { getFirstRecommendedModel, getRecommendedModels } from '../settings/recommendedModels';
import type { ProviderEntry } from '../../ui/settings/providerTypes';

function provider(overrides: Partial<ProviderEntry> = {}): ProviderEntry {
  return {
    id: 'bailian-coding',
    name: '阿里云百炼 Coding Plan',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    keyLink: '',
    keyPlaceholder: '',
    defaultModel: 'qwen3.5-plus',
    models: [
      { id: 'qwen3.5-plus', label: 'Qwen 3.5 Plus', tools: true, thinking: true },
      { id: 'qwen3-max-2026-01-23', label: 'Qwen 3 Max', tools: true, thinking: false },
      { id: 'qwen3-coder-next', label: 'Qwen 3 Coder Next', tools: true, thinking: false },
      { id: 'extra-model', label: 'Extra', tools: true, thinking: false },
    ],
    ...overrides,
  };
}

describe('beginner recommended models', () => {
  it('derives recommendations from provider metadata instead of a frontend model registry', () => {
    expect(getRecommendedModels(provider())).toEqual([
      'qwen3.5-plus',
      'qwen3-max-2026-01-23',
      'qwen3-coder-next',
    ]);
  });

  it('falls back to provider default model when no model list is available', () => {
    const p = provider({ models: [], defaultModel: 'deepseek-v4-flash' });

    expect(getRecommendedModels(p)).toEqual(['deepseek-v4-flash']);
    expect(getFirstRecommendedModel(p)).toBe('deepseek-v4-flash');
  });
});
