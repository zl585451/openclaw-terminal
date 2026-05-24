import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderEntry, ProvidersState } from '../../ui/settings/providerTypes';
import { inferProviderFromBaseUrl } from '../../utils/providerUtils';

export type SettingsMode = 'beginner' | 'advanced';

export interface ApiKeysState {
  DASHSCOPE_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  MINIMAX_API_KEY: string;
  MOONSHOT_API_KEY: string;
  NEWAPI_API_KEY: string;
  IMAGE_PROVIDER: string;
  IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY: boolean;
  IMAGE_API_KEY: string;
  IMAGE_BASE_URL: string;
  IMAGE_MODEL: string;
  IMAGE_MINIMAX_API_KEY: string;
  IMAGE_MINIMAX_BASE_URL: string;
  IMAGE_MINIMAX_MODEL: string;
  IMAGE_SILICONFLOW_API_KEY: string;
  IMAGE_SILICONFLOW_BASE_URL: string;
  IMAGE_SILICONFLOW_MODEL: string;
  IMAGE_OPENAI_API_KEY: string;
  IMAGE_OPENAI_BASE_URL: string;
  IMAGE_OPENAI_MODEL: string;
  IMAGE_GOOGLE_API_KEY: string;
  IMAGE_GOOGLE_BASE_URL: string;
  IMAGE_GOOGLE_MODEL: string;
  IMAGE_SIZE: string;
  TTS_MINIMAX_VOICE_ID: string;
  CUSTOM_API_KEY: string;
  OPENCLAW_WS_URL: string;
  OPENCLAW_TOKEN: string;
  OCT_SETTINGS_MODE: SettingsMode | '';
  OCT_PROVIDER: string;
  OCT_MODEL: string;
  SCRIPT_ADAPTER_REAL_AGENTS: string;
  CUSTOM_MODEL: string;
  DASHSCOPE_BASE_URL: string;
  DEEPSEEK_BASE_URL: string;
  MINIMAX_BASE_URL: string;
  MOONSHOT_BASE_URL: string;
  NEWAPI_BASE_URL: string;
  CUSTOM_BASE_URL: string;
  GOOGLE_AI_API_KEY: string;
  GOOGLE_AI_BASE_URL: string;
  /** 网关访问境外 API（如 Gemini）时的本地 HTTP 代理，例如 http://127.0.0.1:10809 */
  HTTPS_PROXY: string;
  HTTP_PROXY: string;
  BRAVE_SEARCH_API_KEY: string;
  TAVILY_API_KEY: string;
  VISION_API_KEY: string;
  VISION_BASE_URL: string;
  VISION_MODEL: string;
  OMNIROUTE_BASE_URL: string;
  OMNIROUTE_API_KEY: string;
  OMNIROUTE_MODEL: string;
  OCT_USE_EXTERNAL_OMNIROUTE: boolean;
}

function emergencyProvider(
  id: string,
  name: string,
  baseUrl: string,
  keyPlaceholder: string,
  keyLink: string,
  defaultModel: string,
  allowCustomModel = false,
): ProviderEntry {
  return {
    id,
    name,
    baseUrl,
    keyLink,
    keyPlaceholder,
    defaultModel,
    models: defaultModel
      ? [{ id: defaultModel, label: defaultModel, tools: true, thinking: false }]
      : [],
    allowCustomModel,
  };
}

const EMERGENCY_FALLBACK_PROVIDERS: ProvidersState = {
  'bailian-coding': emergencyProvider(
    'bailian-coding',
    '阿里云百炼 Coding Plan',
    'https://coding.dashscope.aliyuncs.com/v1',
    'sk-sp-xxxxxxxxxxxxxxxx',
    'https://bailian.console.aliyun.com/',
    'qwen3.5-plus',
  ),
  deepseek: emergencyProvider('deepseek', 'DeepSeek', 'https://api.deepseek.com/v1', 'sk-xxxxxxxxxxxxxxxx', 'https://platform.deepseek.com/', 'deepseek-v4-flash'),
  minimax: emergencyProvider('minimax', 'MiniMax', 'https://api.minimaxi.com/v1', 'sk-cp-xxxxxxxxxxxxxxxx', 'https://platform.minimaxi.com/docs/token-plan/intro', 'MiniMax-M2.7'),
  siliconflow: emergencyProvider('siliconflow', '硅基流动 SiliconFlow', 'https://api.siliconflow.cn/v1', 'sk-xxxxxxxxxxxxxxxx', 'https://cloud.siliconflow.cn/', 'Qwen/Qwen2.5-72B-Instruct'),
  moonshot: emergencyProvider('moonshot', 'Kimi 开放平台', 'https://api.moonshot.cn/v1', 'sk-xxxxxxxxxxxxxxxx', 'https://platform.kimi.com/', 'kimi-k2.6'),
  newapi: emergencyProvider('newapi', 'New API 外部分发网关', 'http://127.0.0.1:3000/v1', 'sk-xxxxxxxxxxxxxxxx', 'https://docs.newapi.ai/', '__custom__', true),
  google: emergencyProvider(
    'google',
    'Google Gemini（Vertex AI 原生）',
    'https://aiplatform.googleapis.com/v1beta1/projects/YOUR_PROJECT_ID/locations/us-central1/endpoints/openapi',
    'AQ.xxxxx 或绑定 Vertex 的 API Key',
    'https://console.cloud.google.com/vertex-ai/studio/settings/api-keys',
    'google/gemini-2.5-flash',
    true,
  ),
  custom: emergencyProvider('custom', '自定义 OpenAI 兼容服务', '', 'your-api-key', '', '__custom__', true),
};

type GatewayConfigPayload = {
  OPENCLAW_WS_URL: string;
  OPENCLAW_TOKEN: string;
  OCT_SETTINGS_MODE: string;
  DASHSCOPE_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  MINIMAX_API_KEY: string;
  MOONSHOT_API_KEY: string;
  NEWAPI_API_KEY: string;
  IMAGE_PROVIDER: string;
  IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY: boolean;
  IMAGE_API_KEY: string;
  IMAGE_BASE_URL: string;
  IMAGE_MODEL: string;
  IMAGE_MINIMAX_API_KEY: string;
  IMAGE_MINIMAX_BASE_URL: string;
  IMAGE_MINIMAX_MODEL: string;
  IMAGE_SILICONFLOW_API_KEY: string;
  IMAGE_SILICONFLOW_BASE_URL: string;
  IMAGE_SILICONFLOW_MODEL: string;
  IMAGE_OPENAI_API_KEY: string;
  IMAGE_OPENAI_BASE_URL: string;
  IMAGE_OPENAI_MODEL: string;
  IMAGE_GOOGLE_API_KEY: string;
  IMAGE_GOOGLE_BASE_URL: string;
  IMAGE_GOOGLE_MODEL: string;
  IMAGE_SIZE: string;
  TTS_MINIMAX_VOICE_ID: string;
  CUSTOM_API_KEY: string;
  OCT_PROVIDER: string;
  OCT_MODEL: string;
  SCRIPT_ADAPTER_REAL_AGENTS: string;
  CUSTOM_MODEL: string;
  DASHSCOPE_BASE_URL: string;
  DEEPSEEK_BASE_URL: string;
  MINIMAX_BASE_URL: string;
  MOONSHOT_BASE_URL: string;
  NEWAPI_BASE_URL: string;
  CUSTOM_BASE_URL: string;
  GOOGLE_AI_API_KEY: string;
  GOOGLE_AI_BASE_URL: string;
  HTTPS_PROXY: string;
  HTTP_PROXY: string;
  BRAVE_SEARCH_API_KEY: string;
  TAVILY_API_KEY: string;
  VISION_API_KEY: string;
  VISION_BASE_URL: string;
  VISION_MODEL: string;
  OMNIROUTE_BASE_URL: string;
  OMNIROUTE_API_KEY: string;
  OMNIROUTE_MODEL: string;
  OCT_USE_EXTERNAL_OMNIROUTE: boolean;
  /** 与 DASHSCOPE_API_KEY 同步写入，供网关 oct-gateway 读取 SILICONFLOW_API_KEY */
  SILICONFLOW_API_KEY: string;
};

type AiConnectionTestPayload = {
  OCT_PROVIDER: string;
  OCT_MODEL: string;
  DASHSCOPE_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  MINIMAX_API_KEY: string;
  MOONSHOT_API_KEY: string;
  CUSTOM_API_KEY: string;
  NEWAPI_API_KEY: string;
  GOOGLE_AI_API_KEY: string;
  DASHSCOPE_BASE_URL: string;
  DEEPSEEK_BASE_URL: string;
  MINIMAX_BASE_URL: string;
  MOONSHOT_BASE_URL: string;
  NEWAPI_BASE_URL: string;
  CUSTOM_BASE_URL: string;
  GOOGLE_AI_BASE_URL: string;
};

type ChatProviderBaseUrlPayload = Pick<
  AiConnectionTestPayload,
  | 'DASHSCOPE_BASE_URL'
  | 'DEEPSEEK_BASE_URL'
  | 'MINIMAX_BASE_URL'
  | 'MOONSHOT_BASE_URL'
  | 'NEWAPI_BASE_URL'
  | 'CUSTOM_BASE_URL'
  | 'GOOGLE_AI_BASE_URL'
>;

type ChatProviderBaseUrlField = keyof ChatProviderBaseUrlPayload;

function resolveProviderId(data: Partial<ApiKeysState>): string {
  if (data.OCT_PROVIDER && String(data.OCT_PROVIDER).trim()) {
    return String(data.OCT_PROVIDER).trim();
  }

  const hasCustomRoute =
    !!String(data.CUSTOM_BASE_URL || '').trim()
    || !!String(data.CUSTOM_API_KEY || '').trim()
    || !!String(data.CUSTOM_MODEL || '').trim();

  if (hasCustomRoute) return 'custom';

  if (
    !!String((data as Record<string, string>).NEWAPI_BASE_URL || '').trim()
    || !!String((data as Record<string, string>).NEWAPI_API_KEY || '').trim()
  ) {
    return 'newapi';
  }

  return inferProviderFromBaseUrl(
    data.GOOGLE_AI_BASE_URL
    || (data as Record<string, string>).NEWAPI_BASE_URL
    || data.MINIMAX_BASE_URL
    || data.DASHSCOPE_BASE_URL
    || data.DEEPSEEK_BASE_URL
    || '',
  );
}

function hasConfiguredKey(data: Partial<ApiKeysState>, providerId: string): boolean {
  if (providerId === 'deepseek') return !!String(data.DEEPSEEK_API_KEY || '').trim();
  if (providerId === 'minimax') return !!String(data.MINIMAX_API_KEY || '').trim();
  if (providerId === 'moonshot') return !!String((data as Record<string, string>).MOONSHOT_API_KEY || '').trim();
  if (providerId === 'newapi') return !!String((data as Record<string, string>).NEWAPI_API_KEY || '').trim();
  if (providerId === 'custom') return !!String(data.CUSTOM_API_KEY || '').trim();
  if (providerId === 'google') return !!String(data.GOOGLE_AI_API_KEY || '').trim();
  if (providerId === 'openai') return !!String((data as Record<string, string>).OPENAI_API_KEY || '').trim()
    || !!String(data.DASHSCOPE_API_KEY || '').trim();
  if (providerId === 'groq') return !!String((data as Record<string, string>).GROQ_API_KEY || '').trim()
    || !!String(data.DASHSCOPE_API_KEY || '').trim();
  if (providerId === 'ollama') return true;
  return !!String(data.DASHSCOPE_API_KEY || '').trim();
}

function normalizeLoadedApiKeys(
  data: Partial<ApiKeysState>,
  providerId: string,
  providers: ProvidersState,
  fallbackApiKeys: ApiKeysState,
): ApiKeysState {
  const nextApiKeys = { ...fallbackApiKeys, ...data };
  nextApiKeys.OMNIROUTE_MODEL = String(
    (data as Record<string, unknown>).OMNIROUTE_MODEL
    || (data as Record<string, unknown>).OMNIROUTE_CHAT_MODEL
    || ''
  ).trim();
  const externalOmniRouteRaw = (data as Record<string, unknown>).OCT_USE_EXTERNAL_OMNIROUTE;
  nextApiKeys.OCT_USE_EXTERNAL_OMNIROUTE =
    externalOmniRouteRaw === true
    || /^(1|true|yes|on)$/i.test(String(externalOmniRouteRaw ?? '').trim());
  const provider = providerSnapshotForBaseline(providerId, providers);
  const configuredModel = String(nextApiKeys.OCT_MODEL || '').trim();
  const customModel = String(nextApiKeys.CUSTOM_MODEL || '').trim();
  const knownModels = new Set((provider?.models || []).map((model) => model.id));

  if ((providerId === 'newapi' || providerId === 'google') && configuredModel) {
    const shouldUseCustomMode =
      configuredModel !== '__custom__'
      && !knownModels.has(configuredModel)
      && (!customModel || customModel === configuredModel);
    if (shouldUseCustomMode) {
      nextApiKeys.OCT_MODEL = '__custom__';
      nextApiKeys.CUSTOM_MODEL = configuredModel;
    }
  }

  if (providerId === 'custom' && configuredModel && !customModel) {
    nextApiKeys.CUSTOM_MODEL = configuredModel;
  }

  return nextApiKeys;
}

/** 与 useMemo(currentGatewayConfig) 一致：用于 savedGatewayConfig，避免 undefined provider 导致 JSON 对比失真、Apply 跳过保存 */
function providerSnapshotForBaseline(
  providerId: string,
  providers: ProvidersState,
): ProviderEntry | undefined {
  return providers[providerId] || EMERGENCY_FALLBACK_PROVIDERS[providerId];
}

export function buildGatewayPayload(
  apiKeys: ApiKeysState,
  currentProviderId: string,
  currentProvider: ProviderEntry | undefined,
  searchKeys: { BRAVE_SEARCH_API_KEY: string; TAVILY_API_KEY: string },
): GatewayConfigPayload {
  const baseUrl = resolveChatProviderBaseUrl(apiKeys, currentProviderId, currentProvider);
  const effectiveModel = resolveChatProviderModel(apiKeys, currentProviderId, currentProvider);
  const providerBaseUrls = buildChatProviderBaseUrlPayload(currentProviderId, baseUrl, currentProvider);

  return {
    OPENCLAW_WS_URL: apiKeys.OPENCLAW_WS_URL || 'ws://127.0.0.1:18789',
    OPENCLAW_TOKEN: apiKeys.OPENCLAW_TOKEN || '',
    OCT_SETTINGS_MODE: apiKeys.OCT_SETTINGS_MODE || '',
    DASHSCOPE_API_KEY: apiKeys.DASHSCOPE_API_KEY || '',
    DEEPSEEK_API_KEY: apiKeys.DEEPSEEK_API_KEY || '',
    MINIMAX_API_KEY: apiKeys.MINIMAX_API_KEY || '',
    MOONSHOT_API_KEY: apiKeys.MOONSHOT_API_KEY || '',
    NEWAPI_API_KEY: apiKeys.NEWAPI_API_KEY || '',
    IMAGE_PROVIDER: apiKeys.IMAGE_PROVIDER || 'minimax',
    IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY: !!apiKeys.IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY,
    IMAGE_API_KEY: apiKeys.IMAGE_API_KEY || '',
    IMAGE_BASE_URL: apiKeys.IMAGE_BASE_URL || '',
    IMAGE_MODEL: apiKeys.IMAGE_MODEL || '',
    IMAGE_MINIMAX_API_KEY: apiKeys.IMAGE_MINIMAX_API_KEY || '',
    IMAGE_MINIMAX_BASE_URL: apiKeys.IMAGE_MINIMAX_BASE_URL || '',
    IMAGE_MINIMAX_MODEL: apiKeys.IMAGE_MINIMAX_MODEL || '',
    IMAGE_SILICONFLOW_API_KEY: apiKeys.IMAGE_SILICONFLOW_API_KEY || '',
    IMAGE_SILICONFLOW_BASE_URL: apiKeys.IMAGE_SILICONFLOW_BASE_URL || '',
    IMAGE_SILICONFLOW_MODEL: apiKeys.IMAGE_SILICONFLOW_MODEL || '',
    IMAGE_OPENAI_API_KEY: apiKeys.IMAGE_OPENAI_API_KEY || '',
    IMAGE_OPENAI_BASE_URL: apiKeys.IMAGE_OPENAI_BASE_URL || '',
    IMAGE_OPENAI_MODEL: apiKeys.IMAGE_OPENAI_MODEL || '',
    IMAGE_GOOGLE_API_KEY: apiKeys.IMAGE_GOOGLE_API_KEY || '',
    IMAGE_GOOGLE_BASE_URL: apiKeys.IMAGE_GOOGLE_BASE_URL || '',
    IMAGE_GOOGLE_MODEL: apiKeys.IMAGE_GOOGLE_MODEL || '',
    IMAGE_SIZE: apiKeys.IMAGE_SIZE || '1024x1024',
    TTS_MINIMAX_VOICE_ID: apiKeys.TTS_MINIMAX_VOICE_ID || 'male-qn-qingse',
    CUSTOM_API_KEY: apiKeys.CUSTOM_API_KEY || '',
    OCT_PROVIDER: currentProviderId || 'bailian-coding',
    OCT_MODEL: effectiveModel,
    SCRIPT_ADAPTER_REAL_AGENTS: apiKeys.SCRIPT_ADAPTER_REAL_AGENTS || '',
    CUSTOM_MODEL: apiKeys.CUSTOM_MODEL || '',
    ...providerBaseUrls,
    GOOGLE_AI_API_KEY: apiKeys.GOOGLE_AI_API_KEY || '',
    HTTPS_PROXY: apiKeys.HTTPS_PROXY || '',
    HTTP_PROXY: apiKeys.HTTP_PROXY || '',
    BRAVE_SEARCH_API_KEY: searchKeys.BRAVE_SEARCH_API_KEY || apiKeys.BRAVE_SEARCH_API_KEY || '',
    TAVILY_API_KEY: searchKeys.TAVILY_API_KEY || apiKeys.TAVILY_API_KEY || '',
    VISION_API_KEY: apiKeys.VISION_API_KEY || '',
    VISION_BASE_URL: apiKeys.VISION_BASE_URL || '',
    VISION_MODEL: apiKeys.VISION_MODEL || '',
    OMNIROUTE_BASE_URL: apiKeys.OMNIROUTE_BASE_URL || '',
    OMNIROUTE_API_KEY: apiKeys.OMNIROUTE_API_KEY || '',
    OMNIROUTE_MODEL: apiKeys.OMNIROUTE_MODEL || '',
    OCT_USE_EXTERNAL_OMNIROUTE: !!apiKeys.OCT_USE_EXTERNAL_OMNIROUTE,
    SILICONFLOW_API_KEY:
      currentProviderId === 'siliconflow' ? (apiKeys.DASHSCOPE_API_KEY || '') : '',
  };
}

function buildChatProviderBaseUrlPayload(
  currentProviderId: string,
  baseUrl: string,
  currentProvider: ProviderEntry | undefined,
): ChatProviderBaseUrlPayload {
  const resolvedBaseUrl = baseUrl || currentProvider?.baseUrl || '';
  const isDashScopeScopedProvider =
    currentProviderId !== 'deepseek'
    && currentProviderId !== 'custom'
    && currentProviderId !== 'minimax'
    && currentProviderId !== 'google'
    && currentProviderId !== 'moonshot'
    && currentProviderId !== 'newapi';

  return {
    DASHSCOPE_BASE_URL: isDashScopeScopedProvider ? resolvedBaseUrl : '',
    DEEPSEEK_BASE_URL: currentProviderId === 'deepseek' ? resolvedBaseUrl : '',
    MINIMAX_BASE_URL: currentProviderId === 'minimax' ? resolvedBaseUrl : '',
    MOONSHOT_BASE_URL: currentProviderId === 'moonshot' ? resolvedBaseUrl : '',
    NEWAPI_BASE_URL: currentProviderId === 'newapi' ? resolvedBaseUrl : '',
    CUSTOM_BASE_URL: currentProviderId === 'custom' ? resolvedBaseUrl : '',
    GOOGLE_AI_BASE_URL: currentProviderId === 'google' ? resolvedBaseUrl : '',
  };
}

function getChatProviderBaseUrlField(providerId: string): ChatProviderBaseUrlField {
  if (providerId === 'deepseek') return 'DEEPSEEK_BASE_URL';
  if (providerId === 'minimax') return 'MINIMAX_BASE_URL';
  if (providerId === 'moonshot') return 'MOONSHOT_BASE_URL';
  if (providerId === 'newapi') return 'NEWAPI_BASE_URL';
  if (providerId === 'custom') return 'CUSTOM_BASE_URL';
  if (providerId === 'google') return 'GOOGLE_AI_BASE_URL';
  return 'DASHSCOPE_BASE_URL';
}

export function readChatProviderBaseUrl(apiKeys: ApiKeysState, providerId: string): string {
  return String(apiKeys[getChatProviderBaseUrlField(providerId)] || '');
}

export function writeChatProviderBaseUrl(
  apiKeys: ApiKeysState,
  providerId: string,
  baseUrl: string,
): ApiKeysState {
  return {
    ...apiKeys,
    [getChatProviderBaseUrlField(providerId)]: baseUrl,
  };
}

export function applyChatProviderSelection(
  apiKeys: ApiKeysState,
  providerId: string,
  provider: ProviderEntry | undefined,
): ApiKeysState {
  const next = {
    ...apiKeys,
    OCT_PROVIDER: providerId,
    OCT_MODEL: provider?.defaultModel || apiKeys.OCT_MODEL,
  };
  if (!provider?.baseUrl) return next;
  return writeChatProviderBaseUrl(next, providerId, provider.baseUrl);
}

function resolveChatProviderBaseUrl(
  apiKeys: ApiKeysState,
  currentProviderId: string,
  currentProvider: ProviderEntry | undefined,
): string {
  let baseUrl = '';
  if (currentProviderId === 'deepseek') {
    baseUrl = apiKeys.DEEPSEEK_BASE_URL;
  } else if (currentProviderId === 'minimax') {
    baseUrl = apiKeys.MINIMAX_BASE_URL;
  } else if (currentProviderId === 'moonshot') {
    baseUrl = apiKeys.MOONSHOT_BASE_URL;
  } else if (currentProviderId === 'newapi') {
    baseUrl = apiKeys.NEWAPI_BASE_URL;
  } else if (currentProviderId === 'custom') {
    baseUrl = apiKeys.CUSTOM_BASE_URL;
  } else if (currentProviderId === 'google') {
    baseUrl = apiKeys.GOOGLE_AI_BASE_URL;
  } else if (currentProviderId === 'siliconflow') {
    const u = (apiKeys.DASHSCOPE_BASE_URL || '').toLowerCase();
    baseUrl = u.includes('siliconflow')
      ? apiKeys.DASHSCOPE_BASE_URL
      : (currentProvider?.baseUrl || 'https://api.siliconflow.cn/v1');
  } else {
    baseUrl = apiKeys.DASHSCOPE_BASE_URL;
  }
  return baseUrl || '';
}

function resolveChatProviderModel(
  apiKeys: ApiKeysState,
  currentProviderId: string,
  currentProvider: ProviderEntry | undefined,
): string {
  let effectiveModel = apiKeys.OCT_MODEL || currentProvider?.defaultModel || 'qwen3.5-plus';
  if (currentProviderId === 'custom' && apiKeys.CUSTOM_MODEL) {
    effectiveModel = apiKeys.CUSTOM_MODEL;
  }
  if (currentProviderId === 'newapi' && apiKeys.OCT_MODEL === '__custom__' && apiKeys.CUSTOM_MODEL) {
    effectiveModel = apiKeys.CUSTOM_MODEL;
  }
  if (currentProviderId === 'google' && apiKeys.OCT_MODEL === '__custom__' && apiKeys.CUSTOM_MODEL) {
    effectiveModel = apiKeys.CUSTOM_MODEL;
  }
  return effectiveModel;
}

export function buildAiConnectionTestPayload(
  apiKeys: ApiKeysState,
  currentProviderId: string,
  currentProvider: ProviderEntry | undefined,
  modelOverride?: string,
): AiConnectionTestPayload {
  const baseUrl = resolveChatProviderBaseUrl(apiKeys, currentProviderId, currentProvider);
  const effectiveModel = modelOverride
    || resolveChatProviderModel(apiKeys, currentProviderId, currentProvider);
  const providerBaseUrls = buildChatProviderBaseUrlPayload(currentProviderId, baseUrl, currentProvider);
  return {
    OCT_PROVIDER: currentProviderId || 'bailian-coding',
    OCT_MODEL: effectiveModel,
    DASHSCOPE_API_KEY: apiKeys.DASHSCOPE_API_KEY || '',
    DEEPSEEK_API_KEY: apiKeys.DEEPSEEK_API_KEY || '',
    MINIMAX_API_KEY: apiKeys.MINIMAX_API_KEY || '',
    MOONSHOT_API_KEY: apiKeys.MOONSHOT_API_KEY || '',
    NEWAPI_API_KEY: apiKeys.NEWAPI_API_KEY || '',
    CUSTOM_API_KEY: apiKeys.CUSTOM_API_KEY || '',
    ...providerBaseUrls,
    GOOGLE_AI_API_KEY: apiKeys.GOOGLE_AI_API_KEY || '',
  };
}

export function useApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKeysState>({
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
    TTS_MINIMAX_VOICE_ID: 'male-qn-qingse',
    CUSTOM_API_KEY: '',
    OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
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
  });

  const searchKeysRef = useRef({ BRAVE_SEARCH_API_KEY: '', TAVILY_API_KEY: '' });
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [providers, setProviders] = useState<ProvidersState>({});
  const [testConnectionStatus, setTestConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testConnectionError, setTestConnectionError] = useState('');
  const [gatewaySaveStatus, setGatewaySaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [apiKeysRefreshing, setApiKeysRefreshing] = useState(false);
  const [savedGatewayConfig, setSavedGatewayConfig] = useState<GatewayConfigPayload | null>(null);
  const [settingsMode, setSettingsMode] = useState<SettingsMode>('beginner');

  useEffect(() => {
    const api = (window as any).electronAPI;

    if (api?.getApiKeys) {
      api
        .getApiKeys()
        .then((result: any) => {
          if (result.success && result.data) {
            const data = result.data;
            const nextSearchKeys = {
              BRAVE_SEARCH_API_KEY: data.BRAVE_SEARCH_API_KEY ?? '',
              TAVILY_API_KEY: data.TAVILY_API_KEY ?? '',
            };
            searchKeysRef.current = nextSearchKeys;
            const persistedMode = data.OCT_SETTINGS_MODE === 'advanced' || data.OCT_SETTINGS_MODE === 'beginner'
              ? data.OCT_SETTINGS_MODE
              : '';
            const providerId = resolveProviderId(data);
            const nextApiKeys = normalizeLoadedApiKeys(data, providerId, {}, apiKeys);
            setApiKeys(nextApiKeys);
            const inferredMode: SettingsMode = persistedMode
              || (providerId && hasConfiguredKey(data, providerId) ? 'advanced' : 'beginner');
            setSettingsMode(inferredMode);
            const snap = providerSnapshotForBaseline(providerId, {});
            setSavedGatewayConfig(buildGatewayPayload({ ...nextApiKeys, OCT_SETTINGS_MODE: inferredMode }, providerId, snap, nextSearchKeys));
          }
          setApiKeysLoaded(true);
        })
        .catch((err: any) => {
          console.error('[Settings] getApiKeys 错误:', err);
          setApiKeysLoaded(true);
        });
    } else {
      setApiKeysLoaded(true);
    }

    if (api?.getProviderList) {
      api
        .getProviderList()
        .then((result: any) => {
          if (result.success && result.data && Object.keys(result.data).length > 0) {
            setProviders(result.data || {});
          } else {
            setProviders(EMERGENCY_FALLBACK_PROVIDERS);
          }
        })
        .catch(() => {
          setProviders(EMERGENCY_FALLBACK_PROVIDERS);
        });
    } else {
      setProviders(EMERGENCY_FALLBACK_PROVIDERS);
    }
  }, []);

  const refetchApiKeys = useCallback(() => {
    const api = (window as any).electronAPI;
    if (!api?.getApiKeys) return;
    setApiKeysRefreshing(true);
    api
      .getApiKeys()
      .then((result: any) => {
        if (result.success && result.data) {
          const data = result.data;
          const nextSearchKeys = {
            BRAVE_SEARCH_API_KEY: data.BRAVE_SEARCH_API_KEY ?? '',
            TAVILY_API_KEY: data.TAVILY_API_KEY ?? '',
          };
          searchKeysRef.current = nextSearchKeys;
          const persistedMode = data.OCT_SETTINGS_MODE === 'advanced' || data.OCT_SETTINGS_MODE === 'beginner'
            ? data.OCT_SETTINGS_MODE
            : '';
          const providerId = resolveProviderId(data);
          const nextApiKeys = normalizeLoadedApiKeys(data, providerId, providers, apiKeys);
          setApiKeys(nextApiKeys);
          const inferredMode: SettingsMode = persistedMode
            || (providerId && hasConfiguredKey(data, providerId) ? 'advanced' : 'beginner');
          setSettingsMode(inferredMode);
          const snap = providerSnapshotForBaseline(providerId, providers);
          setSavedGatewayConfig(buildGatewayPayload({ ...nextApiKeys, OCT_SETTINGS_MODE: inferredMode }, providerId, snap, nextSearchKeys));
        }
      })
      .finally(() => setApiKeysRefreshing(false));
  }, [apiKeys, providers]);

  const currentProviderId = useMemo(
    () => resolveProviderId(apiKeys),
    [
      apiKeys.OCT_PROVIDER,
      apiKeys.CUSTOM_BASE_URL,
      apiKeys.CUSTOM_API_KEY,
      apiKeys.CUSTOM_MODEL,
      apiKeys.NEWAPI_API_KEY,
      apiKeys.MINIMAX_BASE_URL,
      apiKeys.MOONSHOT_BASE_URL,
      apiKeys.NEWAPI_BASE_URL,
      apiKeys.DASHSCOPE_BASE_URL,
      apiKeys.DEEPSEEK_BASE_URL,
      apiKeys.GOOGLE_AI_BASE_URL,
    ],
  );

  const currentProvider = providers[currentProviderId];
  const settingsApiKeys = useMemo<ApiKeysState>(
    () => ({ ...apiKeys, OCT_SETTINGS_MODE: settingsMode }),
    [apiKeys, settingsMode],
  );
  const currentGatewayConfig = useMemo(
    () => buildGatewayPayload(settingsApiKeys, currentProviderId, currentProvider, {
      BRAVE_SEARCH_API_KEY: settingsApiKeys.BRAVE_SEARCH_API_KEY || searchKeysRef.current.BRAVE_SEARCH_API_KEY,
      TAVILY_API_KEY: settingsApiKeys.TAVILY_API_KEY || searchKeysRef.current.TAVILY_API_KEY,
    }),
    [settingsApiKeys, currentProviderId, currentProvider],
  );
  const hasGatewayConfigChanges = useMemo(
    () => {
      if (!apiKeysLoaded) return false;
      if (!savedGatewayConfig) return true;
      return JSON.stringify(currentGatewayConfig) !== JSON.stringify(savedGatewayConfig);
    },
    [apiKeysLoaded, currentGatewayConfig, savedGatewayConfig],
  );

  const saveGatewayAndReconnect = useCallback(async () => {
    const api = (window as any).electronAPI;
    if (!api?.saveApiKeys) return false;
    setGatewaySaveStatus('saving');
    try {
      const result = await api.saveApiKeys(currentGatewayConfig);
      if (!result?.success) {
        setGatewaySaveStatus('idle');
        return false;
      }
      setSavedGatewayConfig(currentGatewayConfig);
      setGatewaySaveStatus('success');
      setTimeout(() => setGatewaySaveStatus('idle'), 2000);
      return true;
    } catch {
      setGatewaySaveStatus('idle');
      return false;
    }
  }, [currentGatewayConfig]);

  return {
    apiKeys,
    setApiKeys,
    searchKeysRef,
    apiKeysLoaded,
    showApiKey,
    setShowApiKey,
    providers,
    testConnectionStatus,
    setTestConnectionStatus,
    testConnectionError,
    setTestConnectionError,
    gatewaySaveStatus,
    apiKeysRefreshing,
    refetchApiKeys,
    currentProviderId,
    currentProvider,
    settingsMode,
    setSettingsMode,
    hasGatewayConfigChanges,
    saveGatewayAndReconnect,
  };
}

export type { BeginnerProviderId } from './recommendedModels';
export {
  BEGINNER_PROVIDER_CARD_SUBTITLE,
  BEGINNER_PROVIDER_IDS,
  getFirstRecommendedModel,
  getRecommendedModels,
  isBeginnerProviderId,
} from './recommendedModels';
