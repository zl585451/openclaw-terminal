import { useState, useEffect, useRef } from 'react';
import { useSettings, type StreamSpeed, type TypingSoundMode } from '../contexts/SettingsContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useTheme } from '../themes/ThemeProvider';
import { allThemes, type ThemeId } from '../themes/themes';
import '../styles/SettingsPanel.css';

// Import extracted constants and types
import { FONT_SIZE_OPTIONS, PERMISSION_ITEMS, SCREENSHOT_SHORTCUT_OPTIONS } from '../ui/settings/constants';
import type { SettingsPanelProps, TabId } from '../ui/settings/types';
import { inferProviderFromBaseUrl } from '../utils/providerUtils';

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, setSettings } = useSettings();
  const { permissions, setPermissions } = usePermissions();
  const [activeTab, setActiveTab] = useState<TabId>('required');
  const [local, setLocal] = useState(settings);
  const [localPerm, setLocalPerm] = useState(permissions);
  const [screenshotShortcut, setScreenshotShortcut] = useState('Alt+A');
  const [shortcutCustom, setShortcutCustom] = useState('');
  const [shortcutMode, setShortcutMode] = useState<'preset' | 'custom'>('preset');
  const [fontSize, setFontSize] = useState('14');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showNotifications, setShowNotifications] = useState(true);
  const [maxHistory, setMaxHistory] = useState(100);

  const [apiKeys, setApiKeys] = useState({
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
  const [providers, setProviders] = useState<Record<string, { id: string; name: string; baseUrl: string; keyLink: string; keyPlaceholder: string; defaultModel: string; models: Array<{ id: string; label: string; tools: boolean; thinking: boolean }> }>>({});
  const [testConnectionStatus, setTestConnectionStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testConnectionError, setTestConnectionError] = useState<string>('');
  const [gatewaySaveStatus, setGatewaySaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
  const [applyStatus, setApplyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [applyError, setApplyError] = useState<string>('');
  const [apiKeysRefreshing, setApiKeysRefreshing] = useState(false);
  const [nocturneStatus, setNocturneStatus] = useState<{ available: boolean; path: string } | null>(null);
  const [nocturneDetail, setNocturneDetail] = useState<{
    available: boolean;
    path: string;
    backendAlive?: boolean;
    frontendAlive?: boolean;
    domains?: Array<{ domain: string }>;
    coreMemoryUris?: string[];
  } | null>(null);
  const [nocturneSetupStatus, setNocturneSetupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [nocturneSetupError, setNocturneSetupError] = useState<string>('');
  const [nocturneDashboardStatus, setNocturneDashboardStatus] = useState<{ backendRunning: boolean; frontendRunning: boolean } | null>(null);
  const [nocturneStarting, setNocturneStarting] = useState(false);
  const [memoryReadContent, setMemoryReadContent] = useState<string | null>(null);
  const [memoryReadLoading, setMemoryReadLoading] = useState(false);
  const [restartingBackend, setRestartingBackend] = useState(false);
  const [aiLibAutoStart, setAiLibAutoStart] = useState(false);
  const [aiLibPath, setAiLibPath] = useState('');
  const [aiLibPort, setAiLibPort] = useState(8001);
  const [aiLibStatus, setAiLibStatus] = useState<{
    healthy: boolean;
    managed: boolean;
    portInUse: boolean;
    resolvedGatewayUrl: string;
  } | null>(null);
  const [aiLibSaving, setAiLibSaving] = useState(false);
  const [amyWorkModeWriting, setAmyWorkModeWriting] = useState(false);
  const { themeId, setTheme } = useTheme();

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getScreenshotShortcut) {
      api.getScreenshotShortcut().then((s: string) => {
        const preset = SCREENSHOT_SHORTCUT_OPTIONS.find((o) => o.value === s);
        if (preset) {
          setScreenshotShortcut(s);
          setShortcutMode('preset');
        } else {
          setScreenshotShortcut('__CUSTOM__');
          setShortcutCustom(s || '');
          setShortcutMode('custom');
        }
      });
    }
    try {
      const saved = localStorage.getItem('claw-terminal-advanced-settings');
      if (saved) {
        const data = JSON.parse(saved);
        if (data.fontSize) setFontSize(data.fontSize);
        if (typeof data.autoScroll === 'boolean') setAutoScroll(data.autoScroll);
        if (typeof data.showNotifications === 'boolean') setShowNotifications(data.showNotifications);
        if (data.maxHistory) setMaxHistory(data.maxHistory);
      }
    } catch {}

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
    if (api?.getProviderList) {
      api.getProviderList().then((result: any) => {
        if (result.success && result.data) setProviders(result.data || {});
      }).catch(() => {});
    }
    if (api?.getNocturneStatus) {
      api.getNocturneStatus().then((r: any) => {
        setNocturneStatus(r);
        setNocturneDetail(r);
        if (r?.backendAlive !== undefined) {
          setNocturneDashboardStatus({ backendRunning: r.backendAlive, frontendRunning: !!r.frontendAlive });
        }
      }).catch(() => {
        setNocturneStatus({ available: false, path: '' });
        setNocturneDetail(null);
      });
    }
    if (api?.getNocturneDashboardStatus) {
      api.getNocturneDashboardStatus().then((r: { backendRunning: boolean; frontendRunning: boolean }) => setNocturneDashboardStatus(r)).catch(() => {});
    }
    if (api?.getAiLibraryPlugin) {
      api.getAiLibraryPlugin().then((r: any) => {
        if (r?.success && r.data) {
          setAiLibAutoStart(!!r.data.OCT_AI_LIBRARY_AUTO_START);
          setAiLibPath(String(r.data.OCT_AI_LIBRARY_PATH || ''));
          setAiLibPort(Number(r.data.OCT_AI_LIBRARY_PORT) || 8001);
          setAiLibStatus({
            healthy: !!r.data.healthy,
            managed: !!r.data.managed,
            portInUse: !!r.data.portInUse,
            resolvedGatewayUrl: String(r.data.resolvedGatewayUrl || ''),
          });
        }
      }).catch(() => {});
    }
  }, []);

  const refetchApiKeys = () => {
    const api = (window as any).electronAPI;
    if (!api?.getApiKeys) return;
    setApiKeysRefreshing(true);
    api.getApiKeys().then((result: any) => {
      if (result.success && result.data) {
        const data = result.data;
        searchKeysRef.current = {
          BRAVE_SEARCH_API_KEY: data.BRAVE_SEARCH_API_KEY ?? '',
          TAVILY_API_KEY: data.TAVILY_API_KEY ?? '',
        };
        setApiKeys((prev) => ({ ...prev, ...data }));
      }
    }).finally(() => setApiKeysRefreshing(false));
  };

  // 记忆系统 Tab：每 5 秒刷新状态
  useEffect(() => {
    if (activeTab !== 'memory') return;
    const api = (window as any).electronAPI;
    const refreshNocturne = () => {
      if (!api?.getNocturneStatus) return;
      api.getNocturneStatus().then((r: any) => {
        setNocturneDetail(r);
        if (r?.backendAlive !== undefined) {
          setNocturneDashboardStatus({ backendRunning: r.backendAlive, frontendRunning: !!r.frontendAlive });
        }
      }).catch(() => {});
    };
    const refreshAiLib = () => {
      if (!api?.getAiLibraryPlugin) return;
      api.getAiLibraryPlugin().then((r: any) => {
        if (r?.success && r.data) {
          setAiLibStatus({
            healthy: !!r.data.healthy,
            managed: !!r.data.managed,
            portInUse: !!r.data.portInUse,
            resolvedGatewayUrl: String(r.data.resolvedGatewayUrl || ''),
          });
        }
      }).catch(() => {});
    };
    refreshNocturne();
    refreshAiLib();
    const t = setInterval(() => {
      refreshNocturne();
      refreshAiLib();
    }, 5000);
    return () => clearInterval(t);
  }, [activeTab]);

  useEffect(() => {
    setLocalPerm(permissions);
  }, [permissions]);

  const apply = async () => {
    setSettings(local);
    setPermissions(localPerm);
    const api = (window as any).electronAPI;
    if (api?.setScreenshotShortcut) {
      const shortcut = shortcutMode === 'custom' ? shortcutCustom.trim() || 'Alt+A' : screenshotShortcut;
      api.setScreenshotShortcut(shortcut);
    }
    localStorage.setItem('claw-terminal-advanced-settings', JSON.stringify({ fontSize, autoScroll, showNotifications, maxHistory }));
    // 按比例联动所有文字尺寸变量
    const base = parseInt(fontSize, 10);
    document.documentElement.style.setProperty('--text-sm', `${base - 2}px`);
    document.documentElement.style.setProperty('--text-base', `${base - 1}px`);
    document.documentElement.style.setProperty('--text-md', `${base}px`);
    document.documentElement.style.setProperty('--text-lg', `${base + 2}px`);
    document.documentElement.style.setProperty('--text-code', `${base - 1}px`);
    document.documentElement.style.setProperty('--text-code-sm', `${base - 2}px`);

    setApplyError('');
    if (api?.saveApiKeys) {
      setApplyStatus('saving');
      const keysToSave = {
        ...apiKeys,
        BRAVE_SEARCH_API_KEY: searchKeysRef.current.BRAVE_SEARCH_API_KEY || apiKeys.BRAVE_SEARCH_API_KEY || '',
        TAVILY_API_KEY: searchKeysRef.current.TAVILY_API_KEY || apiKeys.TAVILY_API_KEY || '',
      };
      
      try {
        const result = await api.saveApiKeys(keysToSave);
        if (result.success) {
          setApplyStatus('success');
          setTimeout(() => {
            onClose();
          }, 1200);
        } else {
          setApplyStatus('error');
          setApplyError(result.error || '保存失败，请重试');
        }
      } catch (err: any) {
        setApplyStatus('error');
        setApplyError(err?.message || '保存异常，请重试');
      }
    } else {
      setApplyStatus('error');
      setApplyError('保存功能不可用');
    }
    if (!api?.saveApiKeys) {
      onClose();
    }
  };

  const clearData = () => {
    if (confirm('确定要清除所有本地设置和聊天记录吗？此操作不可恢复。')) {
      localStorage.clear();
      location.reload();
    }
  };

  const currentProviderId = apiKeys.OCT_PROVIDER || inferProviderFromBaseUrl(apiKeys.DASHSCOPE_BASE_URL || apiKeys.DEEPSEEK_BASE_URL || '');
  const currentProvider = providers[currentProviderId];

  const saveGatewayAndReconnect = () => {
    const api = (window as any).electronAPI;
    if (!api?.saveApiKeys) return;
    setGatewaySaveStatus('saving');
    const baseUrl = currentProviderId === 'deepseek' ? apiKeys.DEEPSEEK_BASE_URL : apiKeys.DASHSCOPE_BASE_URL;
    api.saveApiKeys({
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
    }).then((result: any) => {
      setGatewaySaveStatus(result.success ? 'success' : 'idle');
      if (result.success) setTimeout(() => setGatewaySaveStatus('idle'), 2000);
    }).catch(() => setGatewaySaveStatus('idle'));
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'required', label: '① 连接配置' },
    { id: 'interface', label: '② 界面设置' },
    { id: 'memory', label: '③ 记忆系统' },
    { id: 'advanced', label: '④ 高级' },
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel settings-panel-large" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>◈ 设置</span>
          <button type="button" className="settings-close" onClick={onClose}>×</button>
        </div>
        <div className="settings-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`settings-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="settings-body">
          {activeTab === 'required' && (
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
          )}

          {activeTab === 'interface' && (
            <div className="settings-tab-content">
              <section className="settings-section">
                <h3>界面主题</h3>
                <div className="settings-desc" style={{ marginBottom: 12 }}>选择你喜欢的配色方案</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(Object.keys(allThemes) as ThemeId[]).map((key) => {
                    const theme = allThemes[key];
                    const active = themeId === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTheme(key)}
                        aria-pressed={active}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 14px',
                          borderRadius: 9999,
                          border: active ? '1px solid var(--border-focus)' : '1px solid var(--border-light)',
                          background: active ? 'var(--accent-primary-muted)' : 'transparent',
                          color: 'var(--text-primary)',
                          fontSize: 13,
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          fontFamily: 'inherit',
                          boxShadow: active ? 'var(--shadow-sm)' : 'none',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: theme.preview.accent,
                            boxShadow: theme.isDark ? '0 0 10px var(--accent-primary-glow)' : 'none',
                          }}
                        />
                        <span style={{ opacity: active ? 1 : 0.9 }}>{theme.name}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
              <section className="settings-section">
                <h3>基础设置</h3>
                <div className="settings-row">
                  <label>流式速度</label>
                  <select value={local.streamSpeed} onChange={(e) => setLocal((s) => ({ ...s, streamSpeed: e.target.value as StreamSpeed }))}>
                    <option value="fast">快速 (~15字/秒)</option>
                    <option value="medium">从容 (~7字/秒，推荐)</option>
                    <option value="slow">细读 (~4字/秒)</option>
                  </select>
                </div>
                <div className="settings-row">
                  <label>打字音效</label>
                  <select value={local.typingSound} onChange={(e) => setLocal((s) => ({ ...s, typingSound: e.target.value as TypingSoundMode }))}>
                    <option value="off">关闭</option>
                    <option value="typewriter">键盘 (清脆)</option>
                    <option value="soft">轻柔 (气泡)</option>
                    <option value="bubble">水泡 (低频)</option>
                  </select>
                </div>
              </section>
              <section className="settings-section">
                <h3>界面</h3>
                <div className="settings-row">
                  <label>字体大小</label>
                  <select value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="settings-select">
                    {FONT_SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="settings-row">
                  <label>自动滚动</label>
                  <label className="toggle-wrap">
                    <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="settings-row">
                  <label>消息历史上限</label>
                  <select value={maxHistory} onChange={(e) => setMaxHistory(Number(e.target.value))} className="settings-select">
                    <option value={50}>50 条</option>
                    <option value={100}>100 条</option>
                    <option value={200}>200 条</option>
                  </select>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'memory' && (
            <div className="settings-tab-content">
              {/* 使用说明卡片 */}
              <div className="settings-guide-card" style={{ marginBottom: 20 }}>
                <h4>Nocturne 记忆系统 使用说明</h4>
                <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-code)', lineHeight: 1.8 }}>
                  <p style={{ marginBottom: 12 }}><strong>什么是记忆系统？</strong></p>
                  <p style={{ marginBottom: 16, paddingLeft: 12 }}>记忆系统可以让 AI 「记住」你的个人信息、偏好、习惯等，让对话更加个性化和智能。例如：你的名字、职业、常用工具等。</p>
                  
                  <p style={{ marginBottom: 12 }}><strong>快速开始（3 步）：</strong></p>
                  <ol style={{ paddingLeft: 20, marginBottom: 16 }}>
                    <li>点击下方「安装 Python 依赖」（首次使用需要）</li>
                    <li>点击「▶ 启动 Dashboard」启动记忆管理界面</li>
                    <li>在打开的网页中添加你的个人记忆</li>
                  </ol>
                  
                  <p style={{ marginBottom: 12 }}><strong>系统要求：</strong></p>
                  <p style={{ paddingLeft: 12 }}>Python 3.10 或更高版本</p>
                </div>
              </div>

              <section className="settings-section" style={{ marginBottom: 24 }}>
                <h3>AI.library 知识库（插件）</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-code)', marginBottom: 12, lineHeight: 1.6 }}>
                  与 Nocturne（端口 <strong>8000</strong>）并行；知识库服务默认 <strong>8001</strong>。开启「随 OCT 启动」后，打开应用会自动拉起 <code>api_server.py</code>，Gateway 会收到检索结果。
                </p>
                {aiLibStatus && (
                  <div style={{ marginBottom: 12, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 8, fontSize: 'var(--text-code)' }}>
                    <p style={{ margin: '0 0 6px' }}>
                      服务：<span style={{ color: aiLibStatus.healthy ? 'var(--status-success)' : 'var(--text-tertiary)' }}>
                        {aiLibStatus.healthy ? '✅ /health 正常' : '— 未就绪'}
                      </span>
                      {' · '}
                      端口占用：{aiLibStatus.portInUse ? '是' : '否'}
                      {' · '}
                      OCT 托管进程：{aiLibStatus.managed ? '是' : '否'}
                    </p>
                    {aiLibStatus.resolvedGatewayUrl ? (
                      <p style={{ margin: 0, color: 'var(--text-tertiary)' }}>Gateway 使用：{aiLibStatus.resolvedGatewayUrl}</p>
                    ) : null}
                  </div>
                )}
                <div className="settings-row">
                  <label>随 OCT 自动启动</label>
                  <label className="toggle-wrap">
                    <input
                      type="checkbox"
                      checked={aiLibAutoStart}
                      onChange={(e) => setAiLibAutoStart(e.target.checked)}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
                <div className="settings-row">
                  <label>项目根目录</label>
                  <input
                    type="text"
                    className="settings-input"
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="例如 E:\AI.library（需含 api_server.py）"
                    value={aiLibPath}
                    onChange={(e) => setAiLibPath(e.target.value)}
                  />
                </div>
                <div className="settings-row">
                  <label>端口</label>
                  <input
                    type="number"
                    className="settings-input"
                    style={{ width: 100 }}
                    min={1024}
                    max={65535}
                    value={aiLibPort}
                    onChange={(e) => setAiLibPort(Number(e.target.value) || 8001)}
                  />
                </div>
                <div className="settings-btn-row">
                  <button
                    type="button"
                    className="settings-btn settings-btn-primary"
                    disabled={aiLibSaving}
                    onClick={async () => {
                      const api = (window as any).electronAPI;
                      if (!api?.saveAiLibraryPlugin) return;
                      setAiLibSaving(true);
                      try {
                        const r = await api.saveAiLibraryPlugin({
                          OCT_AI_LIBRARY_AUTO_START: aiLibAutoStart,
                          OCT_AI_LIBRARY_PATH: aiLibPath.trim(),
                          OCT_AI_LIBRARY_PORT: aiLibPort,
                        });
                        if (!r?.success) {
                          alert('保存失败：' + (r?.error || '未知错误'));
                        } else {
                          const r2 = await api.getAiLibraryPlugin();
                          if (r2?.success && r2.data) {
                            setAiLibStatus({
                              healthy: !!r2.data.healthy,
                              managed: !!r2.data.managed,
                              portInUse: !!r2.data.portInUse,
                              resolvedGatewayUrl: String(r2.data.resolvedGatewayUrl || ''),
                            });
                          }
                        }
                      } finally {
                        setAiLibSaving(false);
                      }
                    }}
                  >
                    {aiLibSaving ? '保存中…' : '保存并应用'}
                  </button>
                </div>
              </section>

              {nocturneStatus?.available ? (
                <section className="settings-section">
                  <h3>记忆系统控制台</h3>
                  {/* 状态：后端 / 前端 / 已加载记忆数 */}
                  <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--bg-surface)', borderRadius: 8, fontSize: 'var(--text-code)' }}>
                    <p style={{ margin: '0 0 6px', color: 'var(--accent-primary)' }}>
                      后端状态：{nocturneDetail?.backendAlive ? '✅ http://localhost:8000 可访问' : '❌ 不可用'}
                    </p>
                    <p style={{ margin: '0 0 6px', color: 'var(--accent-primary)' }}>
                      前端状态：{nocturneDetail?.frontendAlive ? '✅ http://localhost:3000 可访问' : '❌ 不可用'}
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-tertiary)' }}>
                      已加载记忆：{nocturneDetail?.domains?.length ?? 0} 个 domain
                    </p>
                  </div>

                  {/* 按钮：启动 Dashboard / 仅重启后端 / 打开管理界面 */}
                  <div className="settings-btn-row">
                    <button
                      type="button"
                      className={`settings-btn ${nocturneDashboardStatus?.backendRunning ? 'settings-btn-danger' : 'settings-btn-primary'}`}
                      onClick={async () => {
                        const api = (window as any).electronAPI;
                        if (!api) return;
                        if (nocturneDashboardStatus?.backendRunning) {
                          await api.stopNocturneDashboard();
                          setNocturneDashboardStatus({ backendRunning: false, frontendRunning: false });
                          setNocturneDetail((d) => d ? { ...d, backendAlive: false, frontendAlive: false } : null);
                        } else {
                          setNocturneStarting(true);
                          const r = await api.startNocturneDashboard();
                          setNocturneStarting(false);
                          if (r.success) {
                            setNocturneDashboardStatus({ backendRunning: true, frontendRunning: true });
                            api.getNocturneStatus().then((r2: any) => setNocturneDetail(r2)).catch(() => {});
                          } else {
                            alert('启动失败：' + (r.error || '未知错误'));
                          }
                        }
                      }}
                      disabled={nocturneStarting}
                    >
                      {nocturneStarting ? '启动中...' : nocturneDashboardStatus?.backendRunning ? '■ 停止 Dashboard' : '▶ 启动 Dashboard'}
                    </button>
                    <button
                      type="button"
                      className="settings-btn"
                      onClick={async () => {
                        const api = (window as any).electronAPI;
                        if (!api?.restartNocturneBackend) return;
                        setRestartingBackend(true);
                        await api.restartNocturneBackend();
                        await new Promise((r) => setTimeout(r, 2000));
                        api.getNocturneStatus().then((r: any) => setNocturneDetail(r)).catch(() => {});
                        setRestartingBackend(false);
                      }}
                      disabled={restartingBackend}
                    >
                      {restartingBackend ? '重启中...' : '仅重启后端'}
                    </button>
                    <button
                      type="button"
                      className="settings-btn"
                      onClick={() => (window as any).electronAPI?.openNocturneManagement?.()}
                    >
                      打开管理界面
                    </button>
                  </div>

                  {/* 次要按钮：安装依赖 / 初始化预设 */}
                  <div className="settings-btn-row" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="settings-btn"
                      onClick={() => {
                        setNocturneSetupStatus('loading');
                        setNocturneSetupError('');
                        (window as any).electronAPI?.setupNocturneMemory?.().then((r: { success: boolean; error?: string }) => {
                          if (r.success) setNocturneSetupStatus('success');
                          else { setNocturneSetupStatus('error'); setNocturneSetupError(r.error || '未知错误'); }
                        }).catch((err: Error) => { setNocturneSetupStatus('error'); setNocturneSetupError(err.message); });
                      }}
                      disabled={nocturneSetupStatus === 'loading'}
                    >
                      {nocturneSetupStatus === 'loading' ? '安装中...' : nocturneSetupStatus === 'success' ? '依赖已安装 ✓' : '安装 Python 依赖'}
                    </button>
                    <button
                      type="button"
                      className="settings-btn"
                      onClick={() => {
                        (window as any).electronAPI?.seedNocturneMemories?.().then((r: { success: boolean; error?: string; output?: string }) => {
                          alert(r.success ? '初始化成功！' + (r.output || '') : '初始化失败：' + (r.error || ''));
                        });
                      }}
                    >
                      初始化预设记忆
                    </button>
                    <button
                      type="button"
                      className="settings-btn"
                      disabled={amyWorkModeWriting}
                      onClick={async () => {
                        const api = (window as any).electronAPI;
                        if (!api?.nocturneCreate) return;
                        setAmyWorkModeWriting(true);
                        const workModeContent = `少爷的工作团队分工：
AMY（行政助理）：日常对话、信息整理、记忆管理、任务分发、提示词优化。处理80%的日常问题。
Cursor（执行总监）：所有代码编写、文件修改、项目实现。AMY生成提示词，少爷交给Cursor执行。
Claude（技术顾问/总策划）：复杂架构决策、技术路线规划、高级问题咨询。费用较高，只在必要时使用。

判断标准：
- 日常问题、信息查询、文档整理 → AMY直接解决
- 代码编写、文件修改 → AMY生成Cursor提示词
- 架构设计、技术选型、复杂bug → 提醒少爷咨询Claude
- 需要咨询Claude时，AMY先帮少爷整理问题、优化提示词、提炼关键信息，减少token消耗`;
                        const claudeRoutingContent = `当少爷需要咨询Claude时，AMY的工作流程：
1. 先理解少爷的问题
2. 整理成结构化的提示词（背景+问题+已尝试的方案+期望结果）
3. 精简掉不必要的细节，控制在500字以内
4. 告知少爷：是否需要附图、哪些截图最关键
5. 输出一段可以直接复制给Claude的提示词

格式模板：
【背景】OCT项目，[简短背景]
【问题】[核心问题一句话]
【已知】[已尝试的方案]
【期望】[想要的结果]
【文件】[如需附上的关键代码片段]`;
                        try {
                          const r1 = await api.nocturneCreate('core://agent/work_mode', workModeContent, 0, '工作模式、分工、角色、顾问、Claude、Cursor');
                          const r2 = await api.nocturneCreate('core://agent/claude_routing', claudeRoutingContent, 1, '咨询Claude、问题整理、提示词优化、token节省');
                          if (r1?.ok && r2?.ok) {
                            alert('已写入 AMY 工作模式记忆：core://agent/work_mode、core://agent/claude_routing');
                            api.getNocturneStatus().then((r: any) => setNocturneDetail(r)).catch(() => {});
                          } else {
                            alert('写入失败：' + (r1?.error || r2?.error || '未知错误'));
                          }
                        } catch (e: any) {
                          alert('写入失败：' + (e?.message || String(e)));
                        }
                        setAmyWorkModeWriting(false);
                      }}
                    >
                      {amyWorkModeWriting ? '写入中...' : '写入 AMY 工作模式记忆'}
                    </button>
                  </div>
                  {nocturneSetupError && <p className="settings-error">{nocturneSetupError}</p>}

                  {/* 记忆快速操作：CORE_MEMORY_URIS + 查看 / 刷新核心记忆 */}
                  {(nocturneDetail?.coreMemoryUris?.length ?? 0) > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <h4 style={{ marginBottom: 8, fontSize: 'var(--text-code)', color: 'var(--accent-primary)' }}>核心记忆 URI</h4>
                      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                        {nocturneDetail?.coreMemoryUris?.map((uri) => (
                          <li key={uri} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <code style={{ flex: 1, wordBreak: 'break-all' }}>{uri}</code>
                            <button
                              type="button"
                              className="settings-btn"
                              style={{ padding: '4px 10px', fontSize: 'var(--text-sm)' }}
                              onClick={async () => {
                                const api = (window as any).electronAPI;
                                if (!api?.nocturneRead) return;
                                setMemoryReadLoading(true);
                                setMemoryReadContent(null);
                                try {
                                  const r = await api.nocturneRead(uri);
                                  if (r?.ok && r?.data) {
                                    const node = (r.data as any)?.node || r.data;
                                    const content = node?.content ?? (typeof r.data === 'string' ? r.data : JSON.stringify(r.data));
                                    setMemoryReadContent(`[${uri}]\n\n${content || '（空）'}`);
                                  } else {
                                    setMemoryReadContent('读取失败：' + (r?.error || '未知错误'));
                                  }
                                } catch (e: any) {
                                  setMemoryReadContent('错误：' + (e?.message || String(e)));
                                }
                                setMemoryReadLoading(false);
                              }}
                              disabled={memoryReadLoading}
                            >
                              查看
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="settings-btn-row" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="settings-btn"
                          onClick={async () => {
                            const api = (window as any).electronAPI;
                            if (!api?.nocturneRead) return;
                            setMemoryReadLoading(true);
                            setMemoryReadContent(null);
                            try {
                              const r = await api.nocturneRead('system://boot');
                              if (r?.ok && Array.isArray(r?.data)) {
                                const parts = (r.data as any[]).map((item: any) => {
                                  const u = item?.uri || '';
                                  const c = item?.node?.content ?? item?.content ?? '';
                                  return `[${u}]\n${c}`;
                                });
                                setMemoryReadContent(parts.join('\n\n---\n\n') || '（无内容）');
                              } else {
                                setMemoryReadContent(r?.ok ? JSON.stringify(r.data) : '失败：' + (r?.error || ''));
                              }
                            } catch (e: any) {
                              setMemoryReadContent('错误：' + (e?.message || String(e)));
                            }
                            setMemoryReadLoading(false);
                          }}
                          disabled={memoryReadLoading}
                        >
                          刷新核心记忆
                        </button>
                      </div>
                    </div>
                  )}
                  {memoryReadContent !== null && (
                    <div style={{ marginTop: 12, padding: 12, background: 'var(--bg-surface)', borderRadius: 8, fontSize: 'var(--text-sm)', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
                      <button type="button" className="settings-btn" style={{ marginBottom: 8 }} onClick={() => setMemoryReadContent(null)}>关闭</button>
                      <pre style={{ margin: 0 }}>{memoryReadContent}</pre>
                    </div>
                  )}
                </section>
              ) : (
                <section className="settings-section">
                  <h3>记忆系统不可用</h3>
                  <p className="settings-desc">
                    未检测到 Nocturne 记忆模块。请确保项目 resources/nocturne_memory 目录存在。
                  </p>
                </section>
              )}
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="settings-tab-content">
              <section className="settings-section">
                <h3>Agent 权限</h3>
                {PERMISSION_ITEMS.map(({ key, label }) => (
                  <div key={key} className="settings-row">
                    <label>{label}</label>
                    <label className="toggle-wrap">
                      <input type="checkbox" checked={localPerm[key]} onChange={(e) => setLocalPerm((p) => ({ ...p, [key]: e.target.checked }))} />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                ))}
              </section>
              <section className="settings-section">
                <h3>快捷键</h3>
                <div className="settings-row">
                  <label>截图</label>
                  <div className="settings-shortcut-wrap">
                    <select
                      value={shortcutMode === 'custom' ? '__CUSTOM__' : screenshotShortcut}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === '__CUSTOM__') setShortcutMode('custom');
                        else { setShortcutMode('preset'); setScreenshotShortcut(v); }
                      }}
                      className="settings-select"
                    >
                      {SCREENSHOT_SHORTCUT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {shortcutMode === 'custom' && (
                      <input type="text" value={shortcutCustom} onChange={(e) => setShortcutCustom(e.target.value)} placeholder="如 Ctrl+Alt+S" className="settings-input settings-input-focusable" style={{ width: 140 }} />
                    )}
                  </div>
                </div>
              </section>
              <section className="settings-section settings-danger">
                <h3>危险操作</h3>
                <button type="button" className="settings-btn settings-btn-danger" onClick={clearData}>清除所有数据</button>
              </section>
            </div>
          )}
        </div>
        <div className="settings-footer">
          {applyError && (
            <span className="settings-apply-error" role="alert">{applyError}</span>
          )}
          <button type="button" className="settings-cancel" onClick={onClose} disabled={applyStatus === 'saving'}>取消</button>
          <button type="button" className="settings-apply" onClick={apply} disabled={applyStatus === 'saving'}>
            {applyStatus === 'saving' ? '保存中...' : applyStatus === 'success' ? '已保存 ✓' : '应用'}
          </button>
        </div>
      </div>
    </div>
  );
}

