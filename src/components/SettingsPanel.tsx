import { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useTheme } from '../themes/ThemeProvider';
import '../styles/SettingsPanel.css';

import type { SettingsPanelProps, TabId } from '../ui/settings/types';
import { AdvancedTabView } from '../ui/settings/tabs/AdvancedTabView';
import { ConnectionTabView } from '../ui/settings/tabs/ConnectionTabView';
import { InterfaceTabView } from '../ui/settings/tabs/InterfaceTabView';
import { MemoryTabView } from '../ui/settings/tabs/MemoryTabView';
import { McpTabView } from '../ui/settings/tabs/McpTabView';
import { useAiLibrary } from '../hooks/settings/useAiLibrary';
import { useApiKeys } from '../hooks/settings/useApiKeys';
import { useNocturneMemory } from '../hooks/settings/useNocturneMemory';
import { useScreenshotShortcut } from '../hooks/settings/useScreenshotShortcut';
import { useAdvancedSettings } from '../hooks/settings/useAdvancedSettings';

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, setSettings } = useSettings();
  const { permissions, setPermissions } = usePermissions();
  const [activeTab, setActiveTab] = useState<TabId>('required');
  const [local, setLocal] = useState(settings);
  const [localPerm, setLocalPerm] = useState(permissions);
  const [aiName, setAiName] = useState('OpenClaw');
  const [userName, setUserName] = useState('用户');
  const [personaStyle, setPersonaStyle] = useState('warm');

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

  const {
    screenshotShortcut,
    setScreenshotShortcut,
    shortcutCustom,
    setShortcutCustom,
    shortcutMode,
    setShortcutMode,
    saveShortcut,
  } = useScreenshotShortcut();

  const {
    fontSize,
    setFontSize,
    autoScroll,
    setAutoScroll,
    maxHistory,
    setMaxHistory,
    saveAdvancedSettings,
  } = useAdvancedSettings();

  const [applyStatus, setApplyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [applyError, setApplyError] = useState<string>('');
  const { themeId, setTheme } = useTheme();

  // MCP Server 状态
  const [mcpStatus, setMcpStatus] = useState<Record<string, any>>({});
  const [mcpLoading, setMcpLoading] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', command: '', args: '', envText: '' });

  const loadMcpStatus = async () => {
    setMcpLoading(true);
    try {
      const status = await (window as any).electronAPI?.mcpGetStatus?.();
      setMcpStatus(status || {});
    } catch { setMcpStatus({}); }
    setMcpLoading(false);
  };

  useEffect(() => { loadMcpStatus(); }, []);

  // 每次切到 MCP Tab 刷新（Gateway 重启后避免仍显示空状态）
  useEffect(() => {
    if (activeTab === 'mcp') loadMcpStatus();
  }, [activeTab]);

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

  useEffect(() => {
    const api = (window as any).electronAPI;
    api?.getPersonaSettings?.()
      .then((result: any) => {
        if (!result?.success || !result?.data) return;
        setAiName(result.data.OCT_AI_NAME || 'OpenClaw');
        setUserName(result.data.OCT_USER_NAME || '用户');
        setPersonaStyle(result.data.OCT_PERSONA_STYLE || 'warm');
        setLocal((prev) => ({
          ...prev,
          aiName: result.data.OCT_AI_NAME || 'OpenClaw',
          userName: result.data.OCT_USER_NAME || '用户',
          personaStyle: result.data.OCT_PERSONA_STYLE || 'warm',
        }));
      })
      .catch(() => {});
  }, []);

  const apply = async () => {
    setSettings({ ...local, aiName, userName, personaStyle: personaStyle as 'neutral' | 'warm' | 'companion' });
    setPermissions(localPerm);
    saveShortcut();
    saveAdvancedSettings();

    setApplyError('');
    const api = (window as any).electronAPI;
    if (api?.savePersonaSettings) {
      const personaResult = await api.savePersonaSettings({
        OCT_AI_NAME: aiName,
        OCT_USER_NAME: userName,
        OCT_PERSONA_STYLE: personaStyle,
      });
      if (!personaResult?.success) {
        setApplyStatus('error');
        setApplyError(personaResult?.error || '人格设置保存失败');
        return;
      }
    }
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
    { id: 'mcp', label: '⑤ MCP 工具' },
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
              aiName={aiName}
              setAiName={setAiName}
              userName={userName}
              setUserName={setUserName}
              personaStyle={personaStyle}
              setPersonaStyle={setPersonaStyle}
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

          {activeTab === 'mcp' && (
            <McpTabView
              mcpStatus={mcpStatus}
              mcpLoading={mcpLoading}
              newServer={newServer}
              setNewServer={setNewServer}
              onAddServer={async () => {
                if (!newServer.name || !newServer.command) return;
                const env: Record<string, string> = {};
                newServer.envText.split('\n').forEach(line => {
                  const [k, ...v] = line.split('=');
                  if (k?.trim()) env[k.trim()] = v.join('=').trim();
                });
                await (window as any).electronAPI?.mcpAddServer?.(newServer.name, {
                  command: newServer.command,
                  args: newServer.args.split(' ').filter(Boolean),
                  env,
                });
                setNewServer({ name: '', command: '', args: '', envText: '' });
                loadMcpStatus();
              }}
              onRemoveServer={async (name) => {
                await (window as any).electronAPI?.mcpRemoveServer?.(name);
                loadMcpStatus();
              }}
              onRefresh={loadMcpStatus}
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
