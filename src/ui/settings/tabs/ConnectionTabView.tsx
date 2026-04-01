import type { Dispatch, MutableRefObject, SetStateAction } from 'react';

export type SettingsApiKeysState = {
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
};

export type ProviderEntry = {
  id: string;
  name: string;
  baseUrl: string;
  keyLink: string;
  keyPlaceholder: string;
  defaultModel: string;
  models: Array<{ id: string; label: string; tools: boolean; thinking: boolean }>;
};

export interface ConnectionTabViewProps {
  apiKeysLoaded: boolean;
  apiKeys: SettingsApiKeysState;
  setApiKeys: Dispatch<SetStateAction<SettingsApiKeysState>>;
  showApiKey: Record<string, boolean>;
  setShowApiKey: Dispatch<SetStateAction<Record<string, boolean>>>;
  searchKeysRef: MutableRefObject<{ BRAVE_SEARCH_API_KEY: string; TAVILY_API_KEY: string }>;
  gatewaySaveStatus: 'idle' | 'saving' | 'success';
  saveGatewayAndReconnect: () => void;
  providers: Record<string, ProviderEntry>;
  currentProviderId: string;
  currentProvider: ProviderEntry | undefined;
  testConnectionStatus: 'idle' | 'testing' | 'success' | 'error';
  testConnectionError: string;
  setTestConnectionStatus: Dispatch<SetStateAction<'idle' | 'testing' | 'success' | 'error'>>;
  setTestConnectionError: Dispatch<SetStateAction<string>>;
  apiKeysRefreshing: boolean;
  refetchApiKeys: () => void;
}

export function ConnectionTabView({
  apiKeysLoaded,
  apiKeys,
  setApiKeys,
  showApiKey,
  setShowApiKey,
  searchKeysRef,
  gatewaySaveStatus,
  saveGatewayAndReconnect,
  providers,
  currentProviderId,
  currentProvider,
  testConnectionStatus,
  testConnectionError,
  setTestConnectionStatus,
  setTestConnectionError,
  apiKeysRefreshing,
  refetchApiKeys,
}: ConnectionTabViewProps) {
  return (
    <div className="settings-tab-content">
      <div className="settings-guide-card">
        <h4>配置步骤</h4>
        <ol>
          <li>若曾安装 Nocturne，先点击「修复配置」</li>
          <li>在右侧面板点击「▶ 启动」启动 Gateway</li>
          <li>填写下方 API Key，点击「保存并重新连接」</li>
        </ol>
      </div>

      <section className="settings-section">
        <h3>1. Gateway 连接</h3>
        {!apiKeysLoaded ? (
          <p className="settings-loading">加载中...</p>
        ) : (
          <>
            <div className="settings-field">
              <label>Gateway 地址</label>
              <input
                type="text"
                value={apiKeys.OPENCLAW_WS_URL}
                onChange={(e) => setApiKeys((k) => ({ ...k, OPENCLAW_WS_URL: e.target.value }))}
                placeholder="ws://127.0.0.1:18789"
                className="settings-input settings-input-focusable"
                autoComplete="off"
              />
            </div>
            <div className="settings-field">
              <label>Token（无则留空）</label>
              <div className="settings-input-row">
                <input
                  type={showApiKey.OPENCLAW_TOKEN ? 'text' : 'password'}
                  value={apiKeys.OPENCLAW_TOKEN}
                  onChange={(e) => setApiKeys((k) => ({ ...k, OPENCLAW_TOKEN: e.target.value }))}
                  placeholder="没有 Token 请留空"
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => setShowApiKey((s) => ({ ...s, OPENCLAW_TOKEN: !s.OPENCLAW_TOKEN }))}
                >
                  {showApiKey.OPENCLAW_TOKEN ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <details className="settings-details">
              <summary>如何获取 Token？</summary>
              <div className="settings-details-content">
                <p style={{ marginBottom: 12 }}><strong>方法：在终端运行命令</strong></p>
                <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: '6px', marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-code)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>openclaw dashboard --no-open</span>
                  <button
                    type="button"
                    className="settings-copy-btn"
                    onClick={() => {
                      navigator.clipboard.writeText('openclaw dashboard --no-open');
                      const btn = document.activeElement as HTMLButtonElement;
                      const orig = btn.textContent;
                      btn.textContent = '已复制 ✓';
                      setTimeout(() => { btn.textContent = orig; }, 1500);
                    }}
                  >
                    复制
                  </button>
                </div>
                <p style={{ marginBottom: 8 }}>命令执行后会输出类似这样的网址：</p>
                <div style={{ background: 'var(--bg-surface)', padding: '12px', borderRadius: '6px', marginBottom: 12, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', wordBreak: 'break-all', color: 'var(--text-secondary)' }}>
                  http://127.0.0.1:18789/dashboard#token=<span style={{ color: 'var(--status-warning)' }}>xxxxx-xxxxx-xxxxx</span>&amp;...
                </div>
                <p><strong>复制黄色高亮部分的 token 值</strong>（#token= 后面到 &amp; 之前的内容），粘贴到上方输入框即可。</p>
              </div>
            </details>
            <button
              type="button"
              className="settings-btn settings-btn-primary"
              onClick={saveGatewayAndReconnect}
              disabled={gatewaySaveStatus === 'saving'}
            >
              {gatewaySaveStatus === 'saving' ? '保存中...' : gatewaySaveStatus === 'success' ? '已保存 ✓' : '保存并重新连接'}
            </button>
          </>
        )}
      </section>

      <section className="settings-section">
        <h3>2. AI 服务商与模型</h3>
        <p className="settings-desc">选择服务商、填入 API Key、选择模型，即可开始对话</p>
        {!apiKeysLoaded ? null : (
          <>
            <div className="settings-field">
              <label>AI 服务商</label>
              <select
                value={currentProviderId}
                onChange={(e) => {
                  const id = e.target.value;
                  const p = providers[id];
                  setApiKeys((k) => ({
                    ...k,
                    OCT_PROVIDER: id,
                    OCT_MODEL: p?.defaultModel || k.OCT_MODEL,
                    DASHSCOPE_BASE_URL: id === 'deepseek' ? k.DASHSCOPE_BASE_URL : (p?.baseUrl || ''),
                    DEEPSEEK_BASE_URL: id === 'deepseek' ? (p?.baseUrl || '') : k.DEEPSEEK_BASE_URL,
                  }));
                }}
                className="settings-input settings-input-focusable"
                style={{ maxWidth: '100%' }}
              >
                {Object.entries(providers).map(([id, p]) => (
                  <option key={id} value={id}>{p.name}</option>
                ))}
                {Object.keys(providers).length === 0 && (
                  <option value="bailian-coding">阿里云百炼 Coding Plan</option>
                )}
              </select>
            </div>
            <div className="settings-field">
              <label>API Key</label>
              <div className="settings-input-row">
                <input
                  type={showApiKey.DASHSCOPE_API_KEY || showApiKey.DEEPSEEK_API_KEY ? 'text' : 'password'}
                  value={currentProviderId === 'deepseek' ? apiKeys.DEEPSEEK_API_KEY : apiKeys.DASHSCOPE_API_KEY}
                  onChange={(e) => {
                    const key = (apiKeys.OCT_PROVIDER || 'bailian-coding') === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'DASHSCOPE_API_KEY';
                    setApiKeys((k) => ({ ...k, [key]: e.target.value }));
                  }}
                  placeholder={currentProvider?.keyPlaceholder || 'sk-xxxxxxxxxxxxxxxx'}
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => {
                    const key = currentProviderId === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'DASHSCOPE_API_KEY';
                    setShowApiKey((s) => ({ ...s, [key]: !s[key] }));
                  }}
                >
                  {currentProviderId === 'deepseek' ? (showApiKey.DEEPSEEK_API_KEY ? '🙈' : '👁') : (showApiKey.DASHSCOPE_API_KEY ? '🙈' : '👁')}
                </button>
              </div>
              <a href={currentProvider?.keyLink || 'https://bailian.console.aliyun.com/'} target="_blank" rel="noopener noreferrer" className="settings-link">获取 API Key →</a>
            </div>
            <div className="settings-field">
              <label>当前模型</label>
              <select
                value={apiKeys.OCT_MODEL || currentProvider?.defaultModel || 'qwen3.5-plus'}
                onChange={(e) => setApiKeys((k) => ({ ...k, OCT_MODEL: e.target.value }))}
                className="settings-input settings-input-focusable"
                style={{ maxWidth: '100%' }}
              >
                {(currentProvider?.models || []).map((m) => (
                  <option key={m.id} value={m.id}>{m.label} {m.tools ? '🔧' : ''} {m.thinking ? '🧠' : ''}</option>
                ))}
                {(!currentProvider?.models?.length) && (
                  <option value="qwen3.5-plus">Qwen 3.5 Plus</option>
                )}
              </select>
            </div>
            <details className="settings-details" style={{ marginTop: 8 }}>
              <summary>高级：Base URL</summary>
              <div className="settings-details-content" style={{ marginTop: 8 }}>
                <div className="settings-field">
                  <label>Base URL（通常自动填充，自定义时可修改）</label>
                  <input
                    type="text"
                    value={currentProviderId === 'deepseek' ? apiKeys.DEEPSEEK_BASE_URL : apiKeys.DASHSCOPE_BASE_URL}
                    onChange={(e) => {
                      const key = currentProviderId === 'deepseek' ? 'DEEPSEEK_BASE_URL' : 'DASHSCOPE_BASE_URL';
                      setApiKeys((k) => ({ ...k, [key]: e.target.value }));
                    }}
                    placeholder="https://..."
                    className="settings-input settings-input-focusable"
                    autoComplete="off"
                  />
                </div>
              </div>
            </details>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button
                type="button"
                className="settings-btn"
                onClick={async () => {
                  const api = (window as any).electronAPI;
                  if (!api?.testAIConnection) return;
                  setTestConnectionStatus('testing');
                  setTestConnectionError('');
                  const providerId = currentProviderId;
                  const p = providers[providerId];
                  const result = await api.testAIConnection({
                    OCT_PROVIDER: providerId,
                    OCT_MODEL: apiKeys.OCT_MODEL || p?.defaultModel || 'qwen3.5-plus',
                    DASHSCOPE_API_KEY: apiKeys.DASHSCOPE_API_KEY,
                    DEEPSEEK_API_KEY: apiKeys.DEEPSEEK_API_KEY,
                    DASHSCOPE_BASE_URL: providerId === 'deepseek' ? '' : (apiKeys.DASHSCOPE_BASE_URL || p?.baseUrl || ''),
                    DEEPSEEK_BASE_URL: providerId === 'deepseek' ? (apiKeys.DEEPSEEK_BASE_URL || p?.baseUrl || '') : '',
                  });
                  setTestConnectionStatus(result.success ? 'success' : 'error');
                  if (!result.success) setTestConnectionError(result.error || '');
                  setTimeout(() => setTestConnectionStatus('idle'), 3000);
                }}
                disabled={testConnectionStatus === 'testing'}
              >
                {testConnectionStatus === 'testing' ? '测试中...' : testConnectionStatus === 'success' ? '✓ 连接成功' : '测试连接'}
              </button>
              {testConnectionStatus === 'error' && testConnectionError && (
                <span style={{ fontSize: 12, color: 'var(--status-error)' }}>{testConnectionError}</span>
              )}
            </div>
          </>
        )}
      </section>

      <section className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0 }}>3. 搜索引擎 API</h3>
          <button
            type="button"
            className="settings-link-btn"
            onClick={refetchApiKeys}
            disabled={apiKeysRefreshing}
            title="重新从配置文件加载"
          >
            {apiKeysRefreshing ? '加载中...' : '↻ 刷新'}
          </button>
        </div>
        <p className="settings-desc">配置搜索引擎 API Key，用于 AI 联网搜索。优先级：Brave → Tavily → DuckDuckGo（无需 Key）</p>
        {!apiKeysLoaded ? null : (
          <>
            <div className="settings-field">
              <label>Brave Search API Key</label>
              <div className="settings-input-row">
                <input
                  type={showApiKey.BRAVE_SEARCH_API_KEY ? 'text' : 'password'}
                  value={apiKeys.BRAVE_SEARCH_API_KEY || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    searchKeysRef.current.BRAVE_SEARCH_API_KEY = val;
                    setApiKeys((k) => ({ ...k, BRAVE_SEARCH_API_KEY: val }));
                  }}
                  placeholder="BSA..."
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => setShowApiKey((s) => ({ ...s, BRAVE_SEARCH_API_KEY: !s.BRAVE_SEARCH_API_KEY }))}
                >
                  {showApiKey.BRAVE_SEARCH_API_KEY ? '🙈' : '👁'}
                </button>
              </div>
              <a href="https://api.search.brave.com/app/keys" target="_blank" rel="noopener noreferrer" className="settings-link">获取 Brave Search API Key →</a>
            </div>
            <div className="settings-field">
              <label>Tavily API Key</label>
              <div className="settings-input-row">
                <input
                  type={showApiKey.TAVILY_API_KEY ? 'text' : 'password'}
                  value={apiKeys.TAVILY_API_KEY || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    searchKeysRef.current.TAVILY_API_KEY = val;
                    setApiKeys((k) => ({ ...k, TAVILY_API_KEY: val }));
                  }}
                  placeholder="tvly-..."
                  className="settings-input settings-input-focusable"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="settings-eye-btn"
                  onClick={() => setShowApiKey((s) => ({ ...s, TAVILY_API_KEY: !s.TAVILY_API_KEY }))}
                >
                  {showApiKey.TAVILY_API_KEY ? '🙈' : '👁'}
                </button>
              </div>
              <a href="https://tavily.com/" target="_blank" rel="noopener noreferrer" className="settings-link">获取 Tavily API Key →</a>
            </div>
            <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 6, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              💡 <strong>DuckDuckGo</strong> 无需 API Key，作为免费降级方案自动启用
            </div>
          </>
        )}
      </section>
    </div>
  );
}
