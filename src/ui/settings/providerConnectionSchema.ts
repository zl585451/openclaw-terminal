import type { ApiKeysState } from '../../hooks/settings/useApiKeys';
import type { ProviderEntry } from './providerTypes';

export const CHAT_PROVIDER_BASE_URL_FIELD_MAP = {
  deepseek: 'DEEPSEEK_BASE_URL',
  minimax: 'MINIMAX_BASE_URL',
  moonshot: 'MOONSHOT_BASE_URL',
  newapi: 'NEWAPI_BASE_URL',
  custom: 'CUSTOM_BASE_URL',
  google: 'GOOGLE_AI_BASE_URL',
} as const satisfies Record<string, keyof ApiKeysState>;

export function getChatProviderBaseUrlField(providerId: string): keyof ApiKeysState {
  return CHAT_PROVIDER_BASE_URL_FIELD_MAP[providerId as keyof typeof CHAT_PROVIDER_BASE_URL_FIELD_MAP] || 'DASHSCOPE_BASE_URL';
}

export function getChatProviderBaseUrlValue(state: ApiKeysState, providerId: string): string {
  const value = state[getChatProviderBaseUrlField(providerId)];
  return typeof value === 'string' ? value : '';
}

export function applyChatProviderSelection(
  state: ApiKeysState,
  providerId: string,
  provider?: ProviderEntry,
): ApiKeysState {
  const baseUrlField = getChatProviderBaseUrlField(providerId);
  return {
    ...state,
    OCT_PROVIDER: providerId,
    OCT_MODEL: provider?.defaultModel || state.OCT_MODEL,
    [baseUrlField]: provider?.baseUrl || '',
  };
}

export function resolveChatProviderModel(
  state: ApiKeysState,
  providerId: string,
  provider?: ProviderEntry,
): string {
  let model = state.OCT_MODEL || provider?.defaultModel || 'qwen3.5-plus';
  const shouldUseCustomModel = (
    providerId === 'custom'
    || providerId === 'newapi'
    || providerId === 'google'
  ) && model === '__custom__' && state.CUSTOM_MODEL;

  if (providerId === 'custom' && state.CUSTOM_MODEL) {
    model = state.CUSTOM_MODEL;
  } else if (shouldUseCustomModel) {
    model = state.CUSTOM_MODEL;
  }

  return model;
}

export function buildChatProviderConnectionPayload(
  state: ApiKeysState,
  providerId: string,
  provider?: ProviderEntry,
) {
  const baseUrlField = getChatProviderBaseUrlField(providerId);
  const fieldValue = state[baseUrlField];
  const resolvedBaseUrl = (typeof fieldValue === 'string' ? fieldValue : '') || provider?.baseUrl || '';

  return {
    OCT_PROVIDER: providerId,
    OCT_MODEL: resolveChatProviderModel(state, providerId, provider),
    DASHSCOPE_API_KEY: state.DASHSCOPE_API_KEY,
    DEEPSEEK_API_KEY: state.DEEPSEEK_API_KEY,
    MINIMAX_API_KEY: state.MINIMAX_API_KEY,
    MOONSHOT_API_KEY: state.MOONSHOT_API_KEY,
    CUSTOM_API_KEY: state.CUSTOM_API_KEY,
    NEWAPI_API_KEY: state.NEWAPI_API_KEY,
    GOOGLE_AI_API_KEY: state.GOOGLE_AI_API_KEY,
    DASHSCOPE_BASE_URL: baseUrlField === 'DASHSCOPE_BASE_URL' ? resolvedBaseUrl : '',
    DEEPSEEK_BASE_URL: baseUrlField === 'DEEPSEEK_BASE_URL' ? resolvedBaseUrl : '',
    MINIMAX_BASE_URL: baseUrlField === 'MINIMAX_BASE_URL' ? resolvedBaseUrl : '',
    MOONSHOT_BASE_URL: baseUrlField === 'MOONSHOT_BASE_URL' ? resolvedBaseUrl : '',
    NEWAPI_BASE_URL: baseUrlField === 'NEWAPI_BASE_URL' ? resolvedBaseUrl : '',
    CUSTOM_BASE_URL: baseUrlField === 'CUSTOM_BASE_URL' ? resolvedBaseUrl : '',
    GOOGLE_AI_BASE_URL: baseUrlField === 'GOOGLE_AI_BASE_URL' ? resolvedBaseUrl : '',
  };
}
