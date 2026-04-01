import { useState, useEffect, useRef } from 'react';
import { inferProviderFromBaseUrl } from '../../utils/providerUtils';

export interface ApiKeysState {
  DASHSCOPE_API_KEY: string;
  DEEPSEEK_API_KEY: string;
  OPENCLAW_WS_URL: string;
  OPENCLAW_TOKEN: string;
  OCT_PROVIDER: string;
  OCT_MODEL: string;
  DASHSCOPE_BASE_URL: string;
  DEEPSEEK_BASE_URL: string;
  BRAVE_SEARCH_API_KEY: string;
  TAVILY_API_KEY: string;
}

export interface ProvidersState {
  [key: string]: {
    id: string;
    name: string;
    baseUrl: string;
    keyLink: string;
    keyPlaceholder: string;
    defaultModel: string;
    models: Array<{
      id: string;
      label: string;
      tools: boolean;
      thinking: boolean;
    }>;
  };
}

export interface UseApiKeysReturn {
  apiKeys: ApiKeysState;
  setApiKeys: React.Dispatch<React.SetStateAction<ApiKeysState>>;
  providers: ProvidersState;
  apiKeysLoaded: boolean;
  searchKeysRef: React.MutableRefObject<{ BRAVE_SEARCH_API_KEY: string; TAVILY_API_KEY: string }>;
  
  // Actions
  refreshApiKeys: () => Promise<void>;
  saveApiKeys: (keys: Partial<ApiKeysState>) => Promise<{ success: boolean; error?: string }>;
  testConnection: (providerId: string, model: string) => Promise<{ success: boolean; error?: string }>;
  
  // Status
  testConnectionStatus: 'idle' | 'testing' | 'success' | 'error';
  testConnectionError: string;
  gatewaySaveStatus: 'idle' | 'saving' | 'success';
  applyStatus: 'idle' | 'saving' | 'success' | 'error';
  applyError: string;
  apiKeysRefreshing: boolean;
}

export function useApiKeys(): UseApiKeysReturn {
  const [apiKeys, setApiKeys] = useState<ApiKeysState>({
    DASHSCOPE_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
    OPENCLAW_TOKEN: '',
    OCT_PROVIDER: '',
    OCT_MODEL: '',
    DASHSCOPE_BASE_URL: '',
    DEEPSEEK_BASE_URL: '',
    BRAVE_SEARCH_API_KEY: '',
    TAVILY_API_KEY: '',
  });
  
  const searchKeysRef = useRef({ BRAVE_SEARCH_API_KEY: '', TAVILY_API_KEY: '' });
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
  const [providers, setProviders] = useState<ProvidersState>({});
  const [testConnectionStatus, setTestConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testConnectionError, setTestConnectionError] = useState<string>('');
  const [gatewaySaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [applyStatus, setApplyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [applyError, setApplyError] = useState<string>('');
  const [apiKeysRefreshing, setApiKeysRefreshing] = useState(false);

  // Load initial data
  useEffect(() => {
    const api = (window as any).electronAPI;
    
    // Load API keys
    if (api?.getApiKeys) {
      api.getApiKeys().then((result: any) => {
        if (result.success && result.data) {
          const data = result.data;
          searchKeysRef.current = {
            BRAVE_SEARCH_API_KEY: data.BRAVE_SEARCH_API_KEY ?? '',
            TAVILY_API_KEY: data.TAVILY_API_KEY ?? '',
          };
          setApiKeys((prev) => {
            const merged = { ...prev, ...data };
            return merged;
          });
        }
        setApiKeysLoaded(true);
      }).catch((err: any) => {
        console.error('[Settings] getApiKeys 错误:', err);
        setApiKeysLoaded(true);
      });
    } else {
      setApiKeysLoaded(true);
    }

    // Load provider list
    if (api?.getProviderList) {
      api.getProviderList().then((result: any) => {
        if (result.success && result.data) setProviders(result.data || {});
      }).catch(() => {});
    }
  }, []);

  const refreshApiKeys = async () => {
    const api = (window as any).electronAPI;
    if (!api?.getApiKeys) return;
    
    setApiKeysRefreshing(true);
    try {
      const result = await api.getApiKeys();
      if (result.success && result.data) {
        const data = result.data;
        searchKeysRef.current = {
          BRAVE_SEARCH_API_KEY: data.BRAVE_SEARCH_API_KEY ?? '',
          TAVILY_API_KEY: data.TAVILY_API_KEY ?? '',
        };
        setApiKeys((prev) => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('[Settings] refreshApiKeys 错误:', err);
    } finally {
      setApiKeysRefreshing(false);
    }
  };

  const saveApiKeys = async (keys: Partial<ApiKeysState>) => {
    const api = (window as any).electronAPI;
    if (!api?.saveApiKeys) return { success: false, error: 'API not available' };

    setApplyStatus('saving');
    setApplyError('');

    try {
      const keysToSave = { ...keys };
      
      // Auto-infer provider from base URL if not explicitly set
      if (keysToSave.DASHSCOPE_BASE_URL && !keysToSave.OCT_PROVIDER) {
        keysToSave.OCT_PROVIDER = inferProviderFromBaseUrl(keysToSave.DASHSCOPE_BASE_URL);
      } else if (keysToSave.DEEPSEEK_BASE_URL && !keysToSave.OCT_PROVIDER) {
        keysToSave.OCT_PROVIDER = inferProviderFromBaseUrl(keysToSave.DEEPSEEK_BASE_URL);
      }

      const result = await api.saveApiKeys(keysToSave);
      if (result.success) {
        setApplyStatus('success');
        setTimeout(() => setApplyStatus('idle'), 2000);
        return { success: true };
      } else {
        setApplyStatus('error');
        setApplyError(result.error || '保存失败');
        return { success: false, error: result.error || '保存失败' };
      }
    } catch (err: any) {
      setApplyStatus('error');
      setApplyError(err.message || '保存失败');
      return { success: false, error: err.message || '保存失败' };
    }
  };

  const testConnection = async (providerId: string, model: string) => {
    const api = (window as any).electronAPI;
    if (!api?.testAIConnection) return { success: false, error: 'API not available' };

    setTestConnectionStatus('testing');
    setTestConnectionError('');

    try {
      const result = await api.testAIConnection({
        ...apiKeys,
        OCT_PROVIDER: providerId,
        OCT_MODEL: model,
      });

      if (result.success) {
        setTestConnectionStatus('success');
        setTimeout(() => setTestConnectionStatus('idle'), 3000);
        return { success: true };
      } else {
        setTestConnectionStatus('error');
        setTestConnectionError(result.error || '连接测试失败');
        return { success: false, error: result.error || '连接测试失败' };
      }
    } catch (err: any) {
      setTestConnectionStatus('error');
      setTestConnectionError(err.message || '连接测试失败');
      return { success: false, error: err.message || '连接测试失败' };
    }
  };

  return {
    apiKeys,
    setApiKeys,
    providers,
    apiKeysLoaded,
    searchKeysRef,
    refreshApiKeys,
    saveApiKeys,
    testConnection,
    testConnectionStatus,
    testConnectionError,
    gatewaySaveStatus,
    applyStatus,
    applyError,
    apiKeysRefreshing,
  };
}