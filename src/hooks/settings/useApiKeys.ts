import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inferProviderFromBaseUrl } from '../../utils/providerUtils';

export type SettingsMode = 'beginner' | 'advanced';

export interface ApiKeysState {
  DASHSCOPE_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  MINIMAX_API_KEY: string;
  MOONSHOT_API_KEY: string;
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
  IMAGE_SIZE: string;
  TTS_MINIMAX_VOICE_ID: string;
  CUSTOM_API_KEY: string;
  OPENCLAW_WS_URL: string;
  OPENCLAW_TOKEN: string;
  OCT_SETTINGS_MODE: SettingsMode | '';
  OCT_PROVIDER: string;
  OCT_MODEL: string;
  CUSTOM_MODEL: string;
  DASHSCOPE_BASE_URL: string;
  DEEPSEEK_BASE_URL: string;
  MINIMAX_BASE_URL: string;
  MOONSHOT_BASE_URL: string;
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
}

export interface ProviderEntry {
  id: string;
  name: string;
  baseUrl: string;
  keyLink: string;
  keyPlaceholder: string;
  defaultModel: string;
  models: Array<{ id: string; label: string; tools: boolean; thinking: boolean }>;
}

export type ProvidersState = Record<string, ProviderEntry>;

const FALLBACK_PROVIDERS: ProvidersState = {
  'bailian-coding': {
    id: 'bailian-coding',
    name: '阿里云百炼 Coding Plan',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    keyLink: 'https://bailian.console.aliyun.com/',
    keyPlaceholder: 'sk-sp-xxxxxxxxxxxxxxxx',
    defaultModel: 'qwen3.5-plus',
    models: [
      { id: 'qwen3.5-plus', label: 'Qwen 3.5 Plus（推荐）', tools: true, thinking: true },
      { id: 'qwen3-coder-next', label: 'Qwen 3 Coder Next（代码）', tools: true, thinking: false },
      { id: 'kimi-k2.5', label: 'Kimi K2.5（月之暗面）', tools: true, thinking: false },
      { id: 'MiniMax-M2.5', label: 'MiniMax M2.5', tools: true, thinking: false },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    keyLink: 'https://platform.deepseek.com/',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    defaultModel: 'deepseek-chat',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat（通用）', tools: true, thinking: false },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner（推理）', tools: false, thinking: true },
    ],
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    keyLink: 'https://platform.minimaxi.com/docs/token-plan/intro',
    keyPlaceholder: 'sk-cp-xxxxxxxxxxxxxxxx',
    defaultModel: 'MiniMax-M2.7',
    models: [
      { id: 'MiniMax-M2.7', label: 'MiniMax M2.7（最新，自我迭代）', tools: true, thinking: false },
      { id: 'MiniMax-M2.5', label: 'MiniMax M2.5（顶尖性能）', tools: true, thinking: false },
      { id: 'MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 极速版（100tps）', tools: true, thinking: false },
    ],
  },
  siliconflow: {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    keyLink: 'https://cloud.siliconflow.cn/',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    models: [
      { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B（免费）', tools: true, thinking: false },
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3', tools: false, thinking: false },
      { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1（推理）', tools: false, thinking: true },
    ],
  },
  moonshot: {
    id: 'moonshot',
    name: 'Kimi 开放平台',
    baseUrl: 'https://api.moonshot.cn/v1',
    keyLink: 'https://platform.kimi.com/',
    keyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
    defaultModel: 'kimi-k2.6',
    models: [
      { id: 'kimi-k2.6', label: 'Kimi K2.6（官方最新）', tools: true, thinking: false },
      { id: 'kimi-k2.5', label: 'Kimi K2.5（稳定）', tools: true, thinking: false },
      { id: 'kimi-k2-turbo-preview', label: 'Kimi K2 Turbo（高速）', tools: true, thinking: false },
      { id: 'moonshot-v1-128k', label: 'Moonshot V1 128K（兼容）', tools: true, thinking: false },
    ],
  },
  google: {
    id: 'google',
    name: 'Google Gemini（Vertex AI Studio API 密钥）',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyLink: 'https://console.cloud.google.com/vertex-ai/studio/settings/api-keys',
    keyPlaceholder: 'Vertex AI Studio 创建的 API 密钥',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash（稳定，推荐）', tools: false, thinking: true },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', tools: false, thinking: true },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', tools: false, thinking: true },
      { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash（预览）', tools: false, thinking: true },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro（预览）', tools: false, thinking: true },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash（将弃用）', tools: false, thinking: false },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', tools: false, thinking: false },
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', tools: false, thinking: false },
    ],
  },
  custom: {
    id: 'custom',
    name: '自定义 OpenAI 兼容服务',
    baseUrl: '',
    keyLink: '',
    keyPlaceholder: 'your-api-key',
    defaultModel: '__custom__',
    models: [{ id: '__custom__', label: '✏️ 自定义模型（手动输入）', tools: true, thinking: false }],
  },
};

type GatewayConfigPayload = {
  OPENCLAW_WS_URL: string;
  OPENCLAW_TOKEN: string;
  OCT_SETTINGS_MODE: string;
  DASHSCOPE_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  MINIMAX_API_KEY: string;
  MOONSHOT_API_KEY: string;
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
  IMAGE_SIZE: string;
  TTS_MINIMAX_VOICE_ID: string;
  CUSTOM_API_KEY: string;
  OCT_PROVIDER: string;
  OCT_MODEL: string;
  CUSTOM_MODEL: string;
  DASHSCOPE_BASE_URL: string;
  DEEPSEEK_BASE_URL: string;
  MINIMAX_BASE_URL: string;
  MOONSHOT_BASE_URL: string;
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
  /** 与 DASHSCOPE_API_KEY 同步写入，供网关 oct-gateway 读取 SILICONFLOW_API_KEY */
  SILICONFLOW_API_KEY: string;
};

function resolveProviderId(data: Partial<ApiKeysState>): string {
  if (data.OCT_PROVIDER && String(data.OCT_PROVIDER).trim()) {
    return String(data.OCT_PROVIDER).trim();
  }

  const hasCustomRoute =
    !!String(data.CUSTOM_BASE_URL || '').trim()
    || !!String(data.CUSTOM_API_KEY || '').trim()
    || !!String(data.CUSTOM_MODEL || '').trim();

  if (hasCustomRoute) return 'custom';

  return inferProviderFromBaseUrl(
    data.GOOGLE_AI_BASE_URL
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
  if (providerId === 'custom') return !!String(data.CUSTOM_API_KEY || '').trim();
  if (providerId === 'google') return !!String(data.GOOGLE_AI_API_KEY || '').trim();
  if (providerId === 'openai') return !!String((data as Record<string, string>).OPENAI_API_KEY || '').trim()
    || !!String(data.DASHSCOPE_API_KEY || '').trim();
  if (providerId === 'groq') return !!String((data as Record<string, string>).GROQ_API_KEY || '').trim()
    || !!String(data.DASHSCOPE_API_KEY || '').trim();
  if (providerId === 'ollama') return true;
  return !!String(data.DASHSCOPE_API_KEY || '').trim();
}

/** 与 useMemo(currentGatewayConfig) 一致：用于 savedGatewayConfig，避免 undefined provider 导致 JSON 对比失真、Apply 跳过保存 */
function providerSnapshotForBaseline(
  providerId: string,
  providers: ProvidersState,
): ProviderEntry | undefined {
  return providers[providerId] || FALLBACK_PROVIDERS[providerId];
}

function buildGatewayPayload(
  apiKeys: ApiKeysState,
  currentProviderId: string,
  currentProvider: ProviderEntry | undefined,
  searchKeys: { BRAVE_SEARCH_API_KEY: string; TAVILY_API_KEY: string },
): GatewayConfigPayload {
  let baseUrl = '';
  if (currentProviderId === 'deepseek') {
    baseUrl = apiKeys.DEEPSEEK_BASE_URL;
  } else if (currentProviderId === 'minimax') {
    baseUrl = apiKeys.MINIMAX_BASE_URL;
  } else if (currentProviderId === 'moonshot') {
    baseUrl = apiKeys.MOONSHOT_BASE_URL;
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

  let effectiveModel = apiKeys.OCT_MODEL || currentProvider?.defaultModel || 'qwen3.5-plus';
  if (currentProviderId === 'custom' && apiKeys.CUSTOM_MODEL) {
    effectiveModel = apiKeys.CUSTOM_MODEL;
  }
  if (currentProviderId === 'google' && apiKeys.OCT_MODEL === '__custom__' && apiKeys.CUSTOM_MODEL) {
    effectiveModel = apiKeys.CUSTOM_MODEL;
  }

  return {
    OPENCLAW_WS_URL: apiKeys.OPENCLAW_WS_URL || 'ws://127.0.0.1:18789',
    OPENCLAW_TOKEN: apiKeys.OPENCLAW_TOKEN || '',
    OCT_SETTINGS_MODE: apiKeys.OCT_SETTINGS_MODE || '',
    DASHSCOPE_API_KEY: apiKeys.DASHSCOPE_API_KEY || '',
    DEEPSEEK_API_KEY: apiKeys.DEEPSEEK_API_KEY || '',
    MINIMAX_API_KEY: apiKeys.MINIMAX_API_KEY || '',
    MOONSHOT_API_KEY: apiKeys.MOONSHOT_API_KEY || '',
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
    IMAGE_SIZE: apiKeys.IMAGE_SIZE || '1024x1024',
    TTS_MINIMAX_VOICE_ID: apiKeys.TTS_MINIMAX_VOICE_ID || 'male-qn-qingse',
    CUSTOM_API_KEY: apiKeys.CUSTOM_API_KEY || '',
    OCT_PROVIDER: currentProviderId || 'bailian-coding',
    OCT_MODEL: effectiveModel,
    CUSTOM_MODEL: apiKeys.CUSTOM_MODEL || '',
    DASHSCOPE_BASE_URL:
      currentProviderId === 'deepseek' || currentProviderId === 'custom' || currentProviderId === 'minimax'
      || currentProviderId === 'google' || currentProviderId === 'moonshot'
        ? ''
        : (baseUrl || currentProvider?.baseUrl || ''),
    DEEPSEEK_BASE_URL: currentProviderId === 'deepseek' ? (baseUrl || currentProvider?.baseUrl || '') : '',
    MINIMAX_BASE_URL: currentProviderId === 'minimax' ? (baseUrl || currentProvider?.baseUrl || '') : '',
    MOONSHOT_BASE_URL: currentProviderId === 'moonshot' ? (baseUrl || currentProvider?.baseUrl || '') : '',
    CUSTOM_BASE_URL: currentProviderId === 'custom' ? (baseUrl || currentProvider?.baseUrl || '') : '',
    GOOGLE_AI_BASE_URL: currentProviderId === 'google' ? (baseUrl || currentProvider?.baseUrl || '') : '',
    GOOGLE_AI_API_KEY: apiKeys.GOOGLE_AI_API_KEY || '',
    HTTPS_PROXY: apiKeys.HTTPS_PROXY || '',
    HTTP_PROXY: apiKeys.HTTP_PROXY || '',
    BRAVE_SEARCH_API_KEY: searchKeys.BRAVE_SEARCH_API_KEY || apiKeys.BRAVE_SEARCH_API_KEY || '',
    TAVILY_API_KEY: searchKeys.TAVILY_API_KEY || apiKeys.TAVILY_API_KEY || '',
    VISION_API_KEY: apiKeys.VISION_API_KEY || '',
    VISION_BASE_URL: apiKeys.VISION_BASE_URL || '',
    VISION_MODEL: apiKeys.VISION_MODEL || '',
    SILICONFLOW_API_KEY:
      currentProviderId === 'siliconflow' ? (apiKeys.DASHSCOPE_API_KEY || '') : '',
  };
}

export function useApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKeysState>({
    DASHSCOPE_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    MINIMAX_API_KEY: '',
    MOONSHOT_API_KEY: '',
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
    TTS_MINIMAX_VOICE_ID: 'male-qn-qingse',
    CUSTOM_API_KEY: '',
    OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
    OPENCLAW_TOKEN: '',
    OCT_SETTINGS_MODE: '',
    OCT_PROVIDER: '',
    OCT_MODEL: '',
    CUSTOM_MODEL: '',
    DASHSCOPE_BASE_URL: '',
    DEEPSEEK_BASE_URL: '',
    MINIMAX_BASE_URL: '',
    MOONSHOT_BASE_URL: '',
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
            const nextApiKeys = { ...apiKeys, ...data };
            setApiKeys((prev) => ({ ...prev, ...data }));
            const persistedMode = data.OCT_SETTINGS_MODE === 'advanced' || data.OCT_SETTINGS_MODE === 'beginner'
              ? data.OCT_SETTINGS_MODE
              : '';
            const providerId = resolveProviderId(data);
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
            setProviders(FALLBACK_PROVIDERS);
          }
        })
        .catch(() => {
          setProviders(FALLBACK_PROVIDERS);
        });
    } else {
      setProviders(FALLBACK_PROVIDERS);
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
          const nextApiKeys = { ...apiKeys, ...data };
          setApiKeys((prev) => ({ ...prev, ...data }));
          const persistedMode = data.OCT_SETTINGS_MODE === 'advanced' || data.OCT_SETTINGS_MODE === 'beginner'
            ? data.OCT_SETTINGS_MODE
            : '';
          const providerId = resolveProviderId(data);
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
      apiKeys.MINIMAX_BASE_URL,
      apiKeys.MOONSHOT_BASE_URL,
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
