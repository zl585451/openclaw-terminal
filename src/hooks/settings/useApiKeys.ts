import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inferProviderFromBaseUrl } from '../../utils/providerUtils';

export interface ApiKeysState {
  DASHSCOPE_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  MINIMAX_API_KEY: string;
  OPENCLAW_WS_URL: string;
  OPENCLAW_TOKEN: string;
  OCT_PROVIDER: string;
  OCT_MODEL: string;
  DASHSCOPE_BASE_URL: string;
  DEEPSEEK_BASE_URL: string;
  MINIMAX_BASE_URL: string;
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

export function useApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKeysState>({
    DASHSCOPE_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    MINIMAX_API_KEY: '',
    OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
    OPENCLAW_TOKEN: '',
    OCT_PROVIDER: '',
    OCT_MODEL: '',
    DASHSCOPE_BASE_URL: '',
    DEEPSEEK_BASE_URL: '',
    MINIMAX_BASE_URL: '',
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

  useEffect(() => {
    const api = (window as any).electronAPI;

    if (api?.getApiKeys) {
      api
        .getApiKeys()
        .then((result: any) => {
          if (result.success && result.data) {
            const data = result.data;
            searchKeysRef.current = {
              BRAVE_SEARCH_API_KEY: data.BRAVE_SEARCH_API_KEY ?? '',
              TAVILY_API_KEY: data.TAVILY_API_KEY ?? '',
            };
            setApiKeys((prev) => ({ ...prev, ...data }));
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
          searchKeysRef.current = {
            BRAVE_SEARCH_API_KEY: data.BRAVE_SEARCH_API_KEY ?? '',
            TAVILY_API_KEY: data.TAVILY_API_KEY ?? '',
          };
          setApiKeys((prev) => ({ ...prev, ...data }));
        }
      })
      .finally(() => setApiKeysRefreshing(false));
  }, []);

  const currentProviderId = useMemo(
    () => apiKeys.OCT_PROVIDER || inferProviderFromBaseUrl(apiKeys.DASHSCOPE_BASE_URL || apiKeys.DEEPSEEK_BASE_URL || ''),
    [apiKeys.OCT_PROVIDER, apiKeys.DASHSCOPE_BASE_URL, apiKeys.DEEPSEEK_BASE_URL],
  );

  const currentProvider = providers[currentProviderId];

  const saveGatewayAndReconnect = useCallback(() => {
    const api = (window as any).electronAPI;
    if (!api?.saveApiKeys) return;
    setGatewaySaveStatus('saving');
    const baseUrl = currentProviderId === 'deepseek' ? apiKeys.DEEPSEEK_BASE_URL : apiKeys.DASHSCOPE_BASE_URL;
    api
      .saveApiKeys({
        OPENCLAW_WS_URL: apiKeys.OPENCLAW_WS_URL || 'ws://127.0.0.1:18789',
        OPENCLAW_TOKEN: apiKeys.OPENCLAW_TOKEN || '',
        DASHSCOPE_API_KEY: apiKeys.DASHSCOPE_API_KEY || '',
        DEEPSEEK_API_KEY: apiKeys.DEEPSEEK_API_KEY || '',
        OCT_PROVIDER: currentProviderId || 'bailian-coding',
        OCT_MODEL: apiKeys.OCT_MODEL || currentProvider?.defaultModel || 'qwen3.5-plus',
        DASHSCOPE_BASE_URL: currentProviderId === 'deepseek' ? '' : (baseUrl || currentProvider?.baseUrl || ''),
        DEEPSEEK_BASE_URL: currentProviderId === 'deepseek' ? (baseUrl || currentProvider?.baseUrl || '') : '',
        BRAVE_SEARCH_API_KEY: searchKeysRef.current.BRAVE_SEARCH_API_KEY || apiKeys.BRAVE_SEARCH_API_KEY || '',
        TAVILY_API_KEY: searchKeysRef.current.TAVILY_API_KEY || apiKeys.TAVILY_API_KEY || '',
      })
      .then((result: any) => {
        setGatewaySaveStatus(result.success ? 'success' : 'idle');
        if (result.success) setTimeout(() => setGatewaySaveStatus('idle'), 2000);
      })
      .catch(() => setGatewaySaveStatus('idle'));
  }, [apiKeys, currentProviderId, currentProvider]);

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
    saveGatewayAndReconnect,
  };
}
