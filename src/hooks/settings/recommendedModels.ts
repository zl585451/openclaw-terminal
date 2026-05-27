import type { ProviderEntry } from '../../ui/settings/providerTypes';

/** 新手模式展示的 provider 顺序。模型列表来自 Electron/gateway provider metadata。 */
export const BEGINNER_PROVIDER_IDS = ['bailian', 'deepseek', 'minimax'] as const;

export type BeginnerProviderId = (typeof BEGINNER_PROVIDER_IDS)[number];

export function isBeginnerProviderId(id: string): id is BeginnerProviderId {
  return (BEGINNER_PROVIDER_IDS as readonly string[]).includes(id);
}

/** 新手卡片副标题（与服务商卡片一一对应） */
export const BEGINNER_PROVIDER_CARD_SUBTITLE: Record<BeginnerProviderId, string> = {
  'bailian': '推荐新手',
  deepseek: '便宜够用',
  minimax: '自研 M2.7',
};

export function getRecommendedModels(provider: ProviderEntry | undefined, maxItems = 3): string[] {
  const modelIds = (provider?.models || [])
    .map((model) => String(model?.id || '').trim())
    .filter(Boolean);
  if (modelIds.length > 0) return modelIds.slice(0, maxItems);
  return provider?.defaultModel ? [provider.defaultModel] : [];
}

/** 当前 provider 的第一条推荐模型 ID，无配置时为空串 */
export function getFirstRecommendedModel(provider: ProviderEntry | undefined): string {
  const list = getRecommendedModels(provider, 1);
  return list[0] || '';
}
