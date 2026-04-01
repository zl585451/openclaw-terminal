import { useState, useEffect, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useTheme } from '../themes/ThemeProvider';
import '../styles/SettingsPanel.css';

import { SCREENSHOT_SHORTCUT_OPTIONS } from '../ui/settings/constants';
import type { SettingsPanelProps, TabId } from '../ui/settings/types';
import { AdvancedTabView } from '../ui/settings/tabs/AdvancedTabView';
import { ConnectionTabView } from '../ui/settings/tabs/ConnectionTabView';
import { InterfaceTabView } from '../ui/settings/tabs/InterfaceTabView';
import { MemoryTabView } from '../ui/settings/tabs/MemoryTabView';
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
            <ConnectionTabView
              apiKeysLoaded={apiKeysLoaded}
              apiKeys={apiKeys}
              setApiKeys={setApiKeys}
              showApiKey={showApiKey}
              setShowApiKey={setShowApiKey}
              searchKeysRef={searchKeysRef}
              gatewaySaveStatus={gatewaySaveStatus}
              saveGatewayAndReconnect={saveGatewayAndReconnect}
              providers={providers}
              currentProviderId={currentProviderId}
              currentProvider={currentProvider}
              testConnectionStatus={testConnectionStatus}
              testConnectionError={testConnectionError}
              setTestConnectionStatus={setTestConnectionStatus}
              setTestConnectionError={setTestConnectionError}
              apiKeysRefreshing={apiKeysRefreshing}
              refetchApiKeys={refetchApiKeys}
            />
          )}

          {activeTab === 'interface' && (
            <InterfaceTabView
              themeId={themeId}
              setTheme={setTheme}
              local={local}
              setLocal={setLocal}
              fontSize={fontSize}
              setFontSize={setFontSize}
              autoScroll={autoScroll}
              setAutoScroll={setAutoScroll}
              maxHistory={maxHistory}
              setMaxHistory={setMaxHistory}
            />
          )}

          {activeTab === 'memory' && (
            <MemoryTabView
              nocturneStatus={nocturneStatus}
              nocturneDetail={nocturneDetail}
              setNocturneDetail={setNocturneDetail}
              nocturneDashboardStatus={nocturneDashboardStatus}
              setNocturneDashboardStatus={setNocturneDashboardStatus}
              nocturneStarting={nocturneStarting}
              setNocturneStarting={setNocturneStarting}
              nocturneSetupStatus={nocturneSetupStatus}
              setNocturneSetupStatus={setNocturneSetupStatus}
              nocturneSetupError={nocturneSetupError}
              setNocturneSetupError={setNocturneSetupError}
              restartingBackend={restartingBackend}
              setRestartingBackend={setRestartingBackend}
              memoryReadContent={memoryReadContent}
              setMemoryReadContent={setMemoryReadContent}
              memoryReadLoading={memoryReadLoading}
              setMemoryReadLoading={setMemoryReadLoading}
              amyWorkModeWriting={amyWorkModeWriting}
              setAmyWorkModeWriting={setAmyWorkModeWriting}
              aiLibAutoStart={aiLibAutoStart}
              setAiLibAutoStart={setAiLibAutoStart}
              aiLibPath={aiLibPath}
              setAiLibPath={setAiLibPath}
              aiLibPort={aiLibPort}
              setAiLibPort={setAiLibPort}
              aiLibStatus={aiLibStatus}
              setAiLibStatus={setAiLibStatus}
              aiLibSaving={aiLibSaving}
              setAiLibSaving={setAiLibSaving}
            />
          )}

          {activeTab === 'advanced' && (
            <AdvancedTabView
              localPerm={localPerm}
              setLocalPerm={setLocalPerm}
              shortcutMode={shortcutMode}
              setShortcutMode={setShortcutMode}
              screenshotShortcut={screenshotShortcut}
              setScreenshotShortcut={setScreenshotShortcut}
              shortcutCustom={shortcutCustom}
              setShortcutCustom={setShortcutCustom}
              clearData={clearData}
            />
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

