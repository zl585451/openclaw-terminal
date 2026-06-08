/**
 * 设置页 beginner / advanced 共用的「主对话」API Key 展示辅助（字段映射、取值、显隐），不含保存与网关载荷。
 */
import type { ApiKeysState } from '../../hooks/settings/useApiKeys';

export type ChatProviderApiKeyField =
  | 'DASHSCOPE_API_KEY'
  | 'DEEPSEEK_API_KEY'
  | 'MINIMAX_API_KEY'
  | 'MOONSHOT_API_KEY'
  | 'GROQ_API_KEY'
  | 'CUSTOM_API_KEY'
  | 'GOOGLE_AI_API_KEY';

export function getChatProviderApiKeyField(providerId: string): ChatProviderApiKeyField {
  if (providerId === 'deepseek') return 'DEEPSEEK_API_KEY';
  if (providerId === 'minimax') return 'MINIMAX_API_KEY';
  if (providerId === 'moonshot') return 'MOONSHOT_API_KEY';
  if (providerId === 'groq') return 'GROQ_API_KEY';
  if (providerId === 'custom') return 'CUSTOM_API_KEY';
  if (providerId === 'google') return 'GOOGLE_AI_API_KEY';
  return 'DASHSCOPE_API_KEY';
}

export function getChatProviderApiKeyValue(state: ApiKeysState, providerId: string): string {
  const field = getChatProviderApiKeyField(providerId);
  return String(state[field] ?? '');
}

/** 高级页主 API Key 输入：任一关联 Key 字段为「可见」则用 text 类型 */
export function isAnyChatProviderKeyVisible(showApiKey: Record<string, boolean>): boolean {
  return !!(
    showApiKey.DASHSCOPE_API_KEY
    || showApiKey.DEEPSEEK_API_KEY
    || showApiKey.MINIMAX_API_KEY
    || showApiKey.MOONSHOT_API_KEY
    || showApiKey.GROQ_API_KEY
    || showApiKey.CUSTOM_API_KEY
    || showApiKey.GOOGLE_AI_API_KEY
  );
}

export function isChatProviderKeyVisible(showApiKey: Record<string, boolean>, providerId: string): boolean {
  const field = getChatProviderApiKeyField(providerId);
  return !!showApiKey[field];
}
