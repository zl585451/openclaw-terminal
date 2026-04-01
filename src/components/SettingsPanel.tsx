import { useState, useEffect } from 'react';
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
import { useAiLibrary } from '../hooks/settings/useAiLibrary';
import { useApiKeys } from '../hooks/settings/useApiKeys';
import { useNocturneMemory } from '../hooks/settings/useNocturneMemory';

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

  const {
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
  } = useApiKeys();

  const {
    nocturneStatus,
    nocturneDetail,
    setNocturneDetail,
    nocturneDashboardStatus,
    setNocturneDashboardStatus,
    nocturneStarting,
    setNocturneStarting,
    nocturneSetupStatus,
    setNocturneSetupStatus,
    nocturneSetupError,
    setNocturneSetupError,
    restartingBackend,
    setRestartingBackend,
    memoryReadContent,
    setMemoryReadContent,
    memoryReadLoading,
    setMemoryReadLoading,
    amyWorkModeWriting,
    setAmyWorkModeWriting,
    refreshNocturneDetail,
  } = useNocturneMemory();

  const {
    aiLibAutoStart,
    setAiLibAutoStart,
    aiLibPath,
    setAiLibPath,
    aiLibPort,
    setAiLibPort,
    aiLibStatus,
    setAiLibStatus,
    aiLibSaving,
    setAiLibSaving,
    refreshAiLibraryStatus,
  } = useAiLibrary();

  const [applyStatus, setApplyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [applyError, setApplyError] = useState<string>('');
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
  }, []);

  // 记忆系统 Tab：每 5 秒刷新 Nocturne 详情与 AI.library 状态
  useEffect(() => {
    if (activeTab !== 'memory') return;
    refreshNocturneDetail();
    refreshAiLibraryStatus();
    const t = setInterval(() => {
      refreshNocturneDetail();
      refreshAiLibraryStatus();
    }, 5000);
    return () => clearInterval(t);
  }, [activeTab, refreshNocturneDetail, refreshAiLibraryStatus]);

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
