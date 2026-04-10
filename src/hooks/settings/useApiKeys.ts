import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inferProviderFromBaseUrl } from '../../utils/providerUtils';

export interface ApiKeysState {
  DASHSCOPE_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  MINIMAX_API_KEY: string;
  TTS_MINIMAX_VOICE_ID: string;
  CUSTOM_API_KEY: string;
  OPENCLAW_WS_URL: string;
  OPENCLAW_TOKEN: string;
  OCT_PROVIDER: string;
  OCT_MODEL: string;
  CUSTOM_MODEL: string;
  DASHSCOPE_BASE_URL: string;
  DEEPSEEK_BASE_URL: string;
  MINIMAX_BASE_URL: string;
  CUSTOM_BASE_URL: string;
  BRAVE_SEARCH_API_KEY: string;
  TAVILY_API_KEY: string;
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

type GatewayConfigPayload = {
  OPENCLAW_WS_URL: string;
  OPENCLAW_TOKEN: string;
  DASHSCOPE_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  MINIMAX_API_KEY: string;
  TTS_MINIMAX_VOICE_ID: string;
  CUSTOM_API_KEY: string;
  OCT_PROVIDER: string;
  OCT_MODEL: string;
  CUSTOM_MODEL: string;
  DASHSCOPE_BASE_URL: string;
  DEEPSEEK_BASE_URL: string;
  MINIMAX_BASE_URL: string;
  CUSTOM_BASE_URL: string;
  BRAVE_SEARCH_API_KEY: string;
  TAVILY_API_KEY: string;
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
    data.MINIMAX_BASE_URL
    || data.DASHSCOPE_BASE_URL
    || data.DEEPSEEK_BASE_URL
    || '',
  );
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
  } else if (currentProviderId === 'custom') {
    baseUrl = apiKeys.CUSTOM_BASE_URL;
  } else {
    baseUrl = apiKeys.DASHSCOPE_BASE_URL;
  }

  let effectiveModel = apiKeys.OCT_MODEL || currentProvider?.defaultModel || 'qwen3.5-plus';
  if (currentProviderId === 'custom' && apiKeys.CUSTOM_MODEL) {
    effectiveModel = apiKeys.CUSTOM_MODEL;
  }

  return {
    OPENCLAW_WS_URL: apiKeys.OPENCLAW_WS_URL || 'ws://127.0.0.1:18789',
    OPENCLAW_TOKEN: apiKeys.OPENCLAW_TOKEN || '',
    DASHSCOPE_API_KEY: apiKeys.DASHSCOPE_API_KEY || '',
    DEEPSEEK_API_KEY: apiKeys.DEEPSEEK_API_KEY || '',
    MINIMAX_API_KEY: apiKeys.MINIMAX_API_KEY || '',
    TTS_MINIMAX_VOICE_ID: apiKeys.TTS_MINIMAX_VOICE_ID || 'male-qn-qingse',
    CUSTOM_API_KEY: apiKeys.CUSTOM_API_KEY || '',
    OCT_PROVIDER: currentProviderId || 'bailian-coding',
    OCT_MODEL: effectiveModel,
    CUSTOM_MODEL: apiKeys.CUSTOM_MODEL || '',
    DASHSCOPE_BASE_URL:
      currentProviderId === 'deepseek' || currentProviderId === 'custom' || currentProviderId === 'minimax'
        ? ''
        : (baseUrl || currentProvider?.baseUrl || ''),
    DEEPSEEK_BASE_URL: currentProviderId === 'deepseek' ? (baseUrl || currentProvider?.baseUrl || '') : '',
    MINIMAX_BASE_URL: currentProviderId === 'minimax' ? (baseUrl || currentProvider?.baseUrl || '') : '',
    CUSTOM_BASE_URL: currentProviderId === 'custom' ? (baseUrl || currentProvider?.baseUrl || '') : '',
    BRAVE_SEARCH_API_KEY: searchKeys.BRAVE_SEARCH_API_KEY || apiKeys.BRAVE_SEARCH_API_KEY || '',
    TAVILY_API_KEY: searchKeys.TAVILY_API_KEY || apiKeys.TAVILY_API_KEY || '',
  };
}

export function useApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKeysState>({
    DASHSCOPE_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    MINIMAX_API_KEY: '',
    TTS_MINIMAX_VOICE_ID: 'male-qn-qingse',
    CUSTOM_API_KEY: '',
    OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
    OPENCLAW_TOKEN: '',
    OCT_PROVIDER: '',
    OCT_MODEL: '',
    CUSTOM_MODEL: '',
    DASHSCOPE_BASE_URL: '',
    DEEPSEEK_BASE_URL: '',
    MINIMAX_BASE_URL: '',
    CUSTOM_BASE_URL: '',
    BRAVE_SEARCH_API_KEY: '',
    TAVILY_API_KEY: '',
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
            const providerId = resolveProviderId(data);
            setSavedGatewayConfig(buildGatewayPayload(nextApiKeys, providerId, undefined, nextSearchKeys));
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
          if (result.success && result.data) setProviders(result.data || {});
        })
        .catch(() => {});
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
          const providerId = resolveProviderId(data);
          setSavedGatewayConfig(buildGatewayPayload(nextApiKeys, providerId, undefined, nextSearchKeys));
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
      apiKeys.DASHSCOPE_BASE_URL,
      apiKeys.DEEPSEEK_BASE_URL,
    ],
  );

  const currentProvider = providers[currentProviderId];
  const currentGatewayConfig = useMemo(
    () => buildGatewayPayload(apiKeys, currentProviderId, currentProvider, {
      BRAVE_SEARCH_API_KEY: apiKeys.BRAVE_SEARCH_API_KEY || searchKeysRef.current.BRAVE_SEARCH_API_KEY,
      TAVILY_API_KEY: apiKeys.TAVILY_API_KEY || searchKeysRef.current.TAVILY_API_KEY,
    }),
    [apiKeys, currentProviderId, currentProvider],
  );
  const hasGatewayConfigChanges = useMemo(
    () => apiKeysLoaded && !!savedGatewayConfig && JSON.stringify(currentGatewayConfig) !== JSON.stringify(savedGatewayConfig),
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
    hasGatewayConfigChanges,
    saveGatewayAndReconnect,
  };
}
