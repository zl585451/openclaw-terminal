import type { ApiKeysState } from '../../hooks/settings/useApiKeys';
import type { ProviderEntry } from './providerTypes';

export type ConnectionTextSegment =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; value: string };

export interface ChatProviderNoticeSchema {
  segments: ConnectionTextSegment[];
}

export interface ChatProviderModelUiSchema {
  mode: 'text' | 'select';
  textPlaceholder?: string;
  hintSegments?: ConnectionTextSegment[];
  hintLink?: { label: string; href: string };
}

export interface ChatProviderViewSchema {
  notice?: ChatProviderNoticeSchema;
  model: ChatProviderModelUiSchema;
  showCustomProviderExtras?: boolean;
  hideAdvancedBaseUrl?: boolean;
  customModelExamples?: string[];
}

export const CHAT_PROVIDER_BASE_URL_FIELD_MAP = {
  deepseek: 'DEEPSEEK_BASE_URL',
  minimax: 'MINIMAX_BASE_URL',
  moonshot: 'MOONSHOT_BASE_URL',
  newapi: 'NEWAPI_BASE_URL',
  custom: 'CUSTOM_BASE_URL',
  google: 'GOOGLE_AI_BASE_URL',
} as const satisfies Record<string, keyof ApiKeysState>;

const DEFAULT_CHAT_PROVIDER_VIEW_SCHEMA: ChatProviderViewSchema = {
  model: { mode: 'select' },
};

const CHAT_PROVIDER_VIEW_SCHEMA_MAP: Record<string, ChatProviderViewSchema> = {
  minimax: {
    model: { mode: 'select' },
    notice: {
      segments: [
        { type: 'text', value: 'MiniMax M2.7 现在建议使用 Token Plan 专属 API Key，通常以 ' },
        { type: 'code', value: 'sk-cp-' },
        { type: 'text', value: ' 开头；大陆区 Base URL 保持 ' },
        { type: 'code', value: 'https://api.minimaxi.com/v1' },
        { type: 'text', value: ' 即可。' },
      ],
    },
  },
  google: {
    model: { mode: 'select' },
    notice: {
      segments: [
        { type: 'text', value: '默认走 Google 官方 ' },
        { type: 'strong', value: '@google/genai / Vertex AI 原生 SDK' },
        { type: 'text', value: '。建议把 Base URL 填成 ' },
        { type: 'code', value: 'https://aiplatform.googleapis.com/v1beta1/projects/你的PROJECT_ID/locations/us-central1/endpoints/openapi' },
        { type: 'text', value: '，这样网关能自动识别项目与区域；计费直接落到你的 GCP 项目，工具调用与多轮兼容性也会比 OpenAI 兼容层更稳。' },
      ],
    },
  },
  newapi: {
    model: { mode: 'select' },
    notice: {
      segments: [
        { type: 'text', value: 'New API 建议作为外部分发网关单独部署；这里填写 New API 里创建的令牌，Base URL 通常是 ' },
        { type: 'code', value: 'http://127.0.0.1:3000/v1' },
        { type: 'text', value: ' 或你的公网网关地址。' },
      ],
    },
  },
  siliconflow: {
    model: {
      mode: 'text',
      textPlaceholder: 'Qwen/Qwen2.5-72B-Instruct（与硅基模型广场 ID 一致）',
      hintSegments: [
        { type: 'text', value: '硅基流动模型较多且更新快，请直接填写官方模型 ID（与 OpenAI 兼容字段 ' },
        { type: 'code', value: 'model' },
        { type: 'text', value: ' 一致）。' },
      ],
      hintLink: {
        label: '文档与模型广场 →',
        href: 'https://docs.siliconflow.cn/cn/userguide/quickstart',
      },
    },
  },
  custom: {
    model: { mode: 'select' },
    showCustomProviderExtras: true,
    hideAdvancedBaseUrl: true,
    customModelExamples: [
      'Qwen/Qwen2.5-72B-Instruct',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'Pro/Qwen/Qwen2.5-7B-Instruct',
    ],
  },
};

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

export function getChatProviderViewSchema(providerId: string): ChatProviderViewSchema {
  return CHAT_PROVIDER_VIEW_SCHEMA_MAP[providerId] || DEFAULT_CHAT_PROVIDER_VIEW_SCHEMA;
}

export function shouldUseFreeTextModelInput(providerId: string): boolean {
  return getChatProviderViewSchema(providerId).model.mode === 'text';
}

export function shouldShowCustomProviderExtras(providerId: string): boolean {
  return !!getChatProviderViewSchema(providerId).showCustomProviderExtras;
}

export function shouldHideAdvancedBaseUrl(providerId: string): boolean {
  return !!getChatProviderViewSchema(providerId).hideAdvancedBaseUrl;
}

export function shouldShowCustomModelInput(state: ApiKeysState, provider?: ProviderEntry): boolean {
  return state.OCT_MODEL === '__custom__' || !!provider?.allowCustomModel;
}
