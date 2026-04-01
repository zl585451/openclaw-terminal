import { useState } from 'react';
import { useApiKeys } from '../../../hooks/settings/useApiKeys';
import { inferProviderFromBaseUrl } from '../../../utils/providerUtils';

interface ConnectionTabProps {
  // Props for parent communication if needed
}

export function ConnectionTab({}: ConnectionTabProps) {
  const apiKeysHook = useApiKeys();
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  // Helper functions for current provider
  const getCurrentProviderId = () => {
    return apiKeysHook.apiKeys.OCT_PROVIDER || 
           inferProviderFromBaseUrl(apiKeysHook.apiKeys.DASHSCOPE_BASE_URL || apiKeysHook.apiKeys.DEEPSEEK_BASE_URL || '') ||
           'bailian-coding';
  };
  
  const getCurrentProvider = () => {
    return apiKeysHook.providers[getCurrentProviderId()];
  };

  // Helper functions for API key mapping
  const getApiKeyForProvider = (providerId: string) => {
    switch (providerId) {
      case 'bailian':
      case 'bailian-coding':
        return apiKeysHook.apiKeys.DASHSCOPE_API_KEY;
      case 'deepseek':
        return apiKeysHook.apiKeys.DEEPSEEK_API_KEY;
      default:
        return '';
    }
  };

  const updateApiKeyForProvider = (providerId: string, value: string) => {
    switch (providerId) {
      case 'bailian':
      case 'bailian-coding':
        apiKeysHook.setApiKeys(k => ({ ...k, DASHSCOPE_API_KEY: value }));
        break;
      case 'deepseek':
        apiKeysHook.setApiKeys(k => ({ ...k, DEEPSEEK_API_KEY: value }));
        break;
    }
  };

  const saveGatewayAndReconnect = async () => {
    const currentProviderId = getCurrentProviderId();
    const currentProvider = getCurrentProvider();
    const baseUrl = currentProviderId === 'deepseek' ? 
      apiKeysHook.apiKeys.DEEPSEEK_BASE_URL : 
      apiKeysHook.apiKeys.DASHSCOPE_BASE_URL;
      
    const keysToSave = {
      OPENCLAW_WS_URL: apiKeysHook.apiKeys.OPENCLAW_WS_URL || 'ws://127.0.0.1:18789',
      OPENCLAW_TOKEN: apiKeysHook.apiKeys.OPENCLAW_TOKEN || '',
      DASHSCOPE_API_KEY: apiKeysHook.apiKeys.DASHSCOPE_API_KEY || '',
      DEEPSEEK_API_KEY: apiKeysHook.apiKeys.DEEPSEEK_API_KEY || '',
      OCT_PROVIDER: currentProviderId || 'bailian-coding',
      OCT_MODEL: apiKeysHook.apiKeys.OCT_MODEL || currentProvider?.defaultModel || 'qwen3.5-plus',
      DASHSCOPE_BASE_URL: currentProviderId === 'deepseek' ? '' : (baseUrl || currentProvider?.baseUrl || ''),
      DEEPSEEK_BASE_URL: currentProviderId === 'deepseek' ? (baseUrl || currentProvider?.baseUrl || '') : '',
      BRAVE_SEARCH_API_KEY: apiKeysHook.searchKeysRef.current.BRAVE_SEARCH_API_KEY || apiKeysHook.apiKeys.BRAVE_SEARCH_API_KEY || '',
      TAVILY_API_KEY: apiKeysHook.searchKeysRef.current.TAVILY_API_KEY || apiKeysHook.apiKeys.TAVILY_API_KEY || '',
    };
    
    await apiKeysHook.saveApiKeys(keysToSave);
  };

  const testConnection = async () => {
    const currentProviderId = getCurrentProviderId();
    const currentProvider = getCurrentProvider();
    const model = apiKeysHook.apiKeys.OCT_MODEL || currentProvider?.defaultModel || 'qwen3.5-plus';
    
    await apiKeysHook.testConnection(currentProviderId, model);
  };


  if (!apiKeysHook.apiKeysLoaded) {
    return (
      <div className="settings-section">
        <h3>① 连接配置</h3>
        <div>加载中...</div>
      </div>
    );
  }

  const currentProviderId = getCurrentProviderId();

  return (
    <div className="settings-section">
      <h3>① 连接配置</h3>
      
      <div className="settings-group">
        <label>WebSocket 连接</label>
        <input
          type="text"
          value={apiKeysHook.apiKeys.OPENCLAW_WS_URL}
          onChange={(e) => apiKeysHook.setApiKeys(k => ({ ...k, OPENCLAW_WS_URL: e.target.value }))}
          placeholder="ws://127.0.0.1:18789"
        />
      </div>

      <div className="settings-group">
        <label>连接令牌（可选）</label>
        <input
          type="text"
          value={apiKeysHook.apiKeys.OPENCLAW_TOKEN}
          onChange={(e) => apiKeysHook.setApiKeys(k => ({ ...k, OPENCLAW_TOKEN: e.target.value }))}
          placeholder="留空表示无需认证"
        />
      </div>

      <div className="settings-group">
        <button 
          onClick={saveGatewayAndReconnect}
          disabled={apiKeysHook.gatewaySaveStatus === 'saving'}
          className="settings-btn-secondary"
        >
          {apiKeysHook.gatewaySaveStatus === 'saving' ? '保存中...' : '保存网关配置'}
        </button>
        {apiKeysHook.gatewaySaveStatus === 'success' && (
          <span className="settings-success">✓ 已保存</span>
        )}
      </div>

      <hr />

      <div className="settings-group">
        <h4>AI 提供商配置</h4>
        {Object.entries(apiKeysHook.providers).map(([providerId, p]) => (
          <div key={providerId} className="provider-section">
            <div className="provider-header">
              <label>
                <input
                  type="radio"
                  name="provider"
                  checked={currentProviderId === providerId}
                  onChange={() => {
                    const baseUrl = p.baseUrl || '';
                    apiKeysHook.setApiKeys(k => ({
                      ...k,
                      OCT_PROVIDER: providerId,
                      OCT_MODEL: p.defaultModel,
                      [currentProviderId === 'deepseek' ? 'DEEPSEEK_BASE_URL' : 'DASHSCOPE_BASE_URL']: baseUrl,
                    }));
                  }}
                />
                {p.name}
              </label>
            </div>
            
            {currentProviderId === providerId && (
              <div className="provider-config">
                <div className="settings-group">
                  <label>API Key</label>
                  <div className="api-key-input">
                    <input
                      type={showApiKey[providerId] ? 'text' : 'password'}
                      value={getApiKeyForProvider(providerId)}
                      onChange={(e) => {
                        updateApiKeyForProvider(providerId, e.target.value);
                      }}
                      placeholder={p.keyPlaceholder}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(prev => ({ ...prev, [providerId]: !prev[providerId] }))}
                      className="show-key-btn"
                    >
                      {showApiKey[providerId] ? '隐藏' : '显示'}
                    </button>
                  </div>
                  <small>
                    <a href={p.keyLink} target="_blank" rel="noopener noreferrer">
                      获取 API Key
                    </a>
                  </small>
                </div>

                <div className="settings-group">
                  <label>模型</label>
                  <select
                    value={apiKeysHook.apiKeys.OCT_MODEL || p.defaultModel}
                    onChange={(e) => apiKeysHook.setApiKeys(k => ({ ...k, OCT_MODEL: e.target.value }))}
                  >
                    {p.models.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-group">
                  <button
                    onClick={testConnection}
                    disabled={apiKeysHook.testConnectionStatus === 'testing'}
                    className="settings-btn-secondary"
                  >
                    {apiKeysHook.testConnectionStatus === 'testing' ? '测试中...' : '测试连接'}
                  </button>
                  {apiKeysHook.testConnectionStatus === 'success' && (
                    <span className="settings-success">✓ 连接成功</span>
                  )}
                  {apiKeysHook.testConnectionStatus === 'error' && (
                    <span className="settings-error">✗ {apiKeysHook.testConnectionError}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <hr />

      <div className="settings-group">
        <h4>搜索引擎配置</h4>
        <div className="settings-group">
          <label>Brave Search API Key</label>
          <input
            type="text"
            value={apiKeysHook.apiKeys.BRAVE_SEARCH_API_KEY}
            onChange={(e) => {
              apiKeysHook.searchKeysRef.current.BRAVE_SEARCH_API_KEY = e.target.value;
              apiKeysHook.setApiKeys(k => ({ ...k, BRAVE_SEARCH_API_KEY: e.target.value }));
            }}
            placeholder="可选，用于网络搜索"
          />
        </div>
        
        <div className="settings-group">
          <label>Tavily API Key</label>
          <input
            type="text"
            value={apiKeysHook.apiKeys.TAVILY_API_KEY}
            onChange={(e) => {
              apiKeysHook.searchKeysRef.current.TAVILY_API_KEY = e.target.value;
              apiKeysHook.setApiKeys(k => ({ ...k, TAVILY_API_KEY: e.target.value }));
            }}
            placeholder="可选，用于网络搜索"
          />
        </div>
      </div>

      <div className="settings-group">
        <button 
          onClick={apiKeysHook.refreshApiKeys} 
          disabled={apiKeysHook.apiKeysRefreshing}
          className="settings-btn-secondary"
        >
          {apiKeysHook.apiKeysRefreshing ? '刷新中...' : '刷新配置'}
        </button>
      </div>
    </div>
  );
}