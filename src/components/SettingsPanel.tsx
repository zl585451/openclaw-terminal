import { useState, useEffect } from 'react';
import { useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { useTheme } from '../themes/ThemeProvider';
import '../styles/SettingsPanel.css';

import type { SettingsPanelProps, TabId } from '../ui/settings/types';
import { AdvancedTabView } from '../ui/settings/tabs/AdvancedTabView';
import { ConnectionTabView } from '../ui/settings/tabs/ConnectionTabView';
import { InterfaceTabView } from '../ui/settings/tabs/InterfaceTabView';
import { MemoryTabView } from '../ui/settings/tabs/MemoryTabView';
import { McpTabView, type McpServerInfo } from '../ui/settings/tabs/McpTabView';
import { useAiLibrary } from '../hooks/settings/useAiLibrary';
import { useApiKeys } from '../hooks/settings/useApiKeys';
import { useNocturneMemory } from '../hooks/settings/useNocturneMemory';
import { useScreenshotShortcut } from '../hooks/settings/useScreenshotShortcut';
import { useAdvancedSettings } from '../hooks/settings/useAdvancedSettings';
import type { ApiResult, IpcRendererLike } from '../types/electronAPI';

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalizePersonaStyle(value: string | undefined): 'neutral' | 'warm' | 'companion' {
  return value === 'neutral' || value === 'companion' ? value : 'warm';
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, setSettings } = useSettings();
  const { permissions, setPermissions } = usePermissions();
  const [activeTab, setActiveTab] = useState<TabId>('required');
  const [local, setLocal] = useState(settings);
  const [localPerm, setLocalPerm] = useState(permissions);
  const [aiName, setAiName] = useState(settings.aiName || 'OpenClaw');
  const [userName, setUserName] = useState(settings.userName || '用户');
  const [personaStyle, setPersonaStyle] = useState(settings.personaStyle || 'warm');

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
    settingsMode,
    setSettingsMode,
    hasGatewayConfigChanges,
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
  const [panelWarning, setPanelWarning] = useState<string | null>(null);
  const [ttsPreviewStatus, setTtsPreviewStatus] = useState<'idle' | 'playing' | 'error' | 'success'>('idle');
  const [ttsPreviewError, setTtsPreviewError] = useState('');
  const { themeId, setTheme } = useTheme();
  const minimaxTtsAvailable = Boolean(apiKeys.MINIMAX_API_KEY?.trim());

  // MCP Server 状态
  const [mcpStatus, setMcpStatus] = useState<Record<string, McpServerInfo>>({});
  const [mcpLoading, setMcpLoading] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', command: '', args: '', envText: '' });
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const ipcRenderer: IpcRendererLike | null =
    typeof window !== 'undefined' && typeof window.require === 'function'
      ? window.require('electron').ipcRenderer
      : null;

  const loadMcpStatus = async () => {
    setMcpLoading(true);
    try {
      const status = await window.electronAPI?.mcpGetStatus?.();
      setMcpStatus(status || {});
    } catch { setMcpStatus({}); }
    setMcpLoading(false);
  };

  useEffect(() => { loadMcpStatus(); }, []);


  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

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
    const api = window.electronAPI;
    const load = api?.getAgentPermissions
      ? api.getAgentPermissions()
      : ipcRenderer
      ? ipcRenderer.invoke<ApiResult<typeof permissions>>('get-agent-permissions')
      : Promise.resolve(null);
    load
      .then((res) => {
        if (!res?.success || !res?.data) return;
        setLocalPerm(res.data);
        setPermissions(res.data);
      })
      .catch((err: unknown) => {
        const msg = getErrorMessage(err);
        console.warn('[SettingsPanel] 权限读取失败', msg);
        setPanelWarning(`权限读取失败：${msg}`);
      });
  }, [setPermissions]);

  useEffect(() => {
    setLocal(settings);
    setAiName(settings.aiName || 'OpenClaw');
    setUserName(settings.userName || '用户');
    setPersonaStyle(settings.personaStyle || 'warm');
  }, [settings]);

  useEffect(() => {
    if (!minimaxTtsAvailable && local.ttsProvider === 'minimax') {
      setLocal((prev) => ({ ...prev, ttsProvider: 'auto' }));
    }
  }, [minimaxTtsAvailable, local.ttsProvider]);

  useEffect(() => {
    const api = window.electronAPI;
    api?.getPersonaSettings?.()
      .then((result) => {
        if (!result?.success || !result?.data) return;
        const data = result.data;
        const nextPersonaStyle = normalizePersonaStyle(data.OCT_PERSONA_STYLE);
        setAiName(data.OCT_AI_NAME || 'OpenClaw');
        setUserName(data.OCT_USER_NAME || '用户');
        setPersonaStyle(nextPersonaStyle);
        setLocal((prev) => ({
          ...prev,
          aiName: data.OCT_AI_NAME || 'OpenClaw',
          userName: data.OCT_USER_NAME || '用户',
          personaStyle: nextPersonaStyle,
        }));
      })
      .catch((err: unknown) => {
        const msg = getErrorMessage(err);
        console.warn('[SettingsPanel] 人格配置读取失败', msg);
        setPanelWarning(`人格配置读取失败：${msg}`);
      });
  }, []);

  const apply = async () => {
    const api = window.electronAPI;
    setApplyStatus('saving');
    setApplyError('');
    setSettings({ ...local, aiName, userName, personaStyle: personaStyle as 'neutral' | 'warm' | 'companion' });
    const permissionResult = api?.saveAgentPermissions
      ? await api.saveAgentPermissions(localPerm)
      : ipcRenderer
      ? await ipcRenderer.invoke<ApiResult<typeof permissions>>('save-agent-permissions', localPerm)
      : null;
    if (!permissionResult?.success) {
      setApplyStatus('error');
      setApplyError(permissionResult?.error || '权限设置保存失败（IPC 不可用）');
      return;
    }
    setPermissions(localPerm);
    saveShortcut();
    saveAdvancedSettings();

    if (hasGatewayConfigChanges) {
      const ok = await saveGatewayAndReconnect();
      if (!ok) {
        setApplyStatus('error');
        setApplyError('连接配置保存失败，请稍后重试');
        return;
      }
    }

    if (api?.savePersonaSettings || ipcRenderer) {
      const payload = {
        OCT_AI_NAME: aiName,
        OCT_USER_NAME: userName,
        OCT_PERSONA_STYLE: personaStyle,
      };
      const personaResult = api?.savePersonaSettings
        ? await api.savePersonaSettings(payload)
        : await ipcRenderer?.invoke<ApiResult>('save-persona-settings', payload);
      if (!personaResult?.success) {
        setApplyStatus('error');
        setApplyError(personaResult?.error || '人格设置保存失败');
        return;
      }
    }

    setApplyStatus('success');
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const clearData = () => {
    if (confirm('确定要清除所有本地设置和聊天记录吗？此操作不可恢复。')) {
      localStorage.clear();
      location.reload();
    }
  };

  const previewTts = async () => {
    setTtsPreviewStatus('playing');
    setTtsPreviewError('');
    try {
      const payload = {
        text: `${aiName || 'OpenClaw'} 正在进行语音试听。这是一段用于检查接口与系统播放链路的测试语音。`,
        providerPreference: local.ttsProvider,
      };
      if (local.ttsProvider === 'browser') {
        if (!('speechSynthesis' in window)) {
          setTtsPreviewStatus('error');
          setTtsPreviewError('当前环境不支持浏览器本地朗读');
          return;
        }
        const utterance = new SpeechSynthesisUtterance(payload.text);
        utterance.lang = 'zh-CN';
        utterance.onend = () => setTtsPreviewStatus('success');
        utterance.onerror = () => {
          setTtsPreviewStatus('error');
          setTtsPreviewError('浏览器本地朗读失败');
        };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
        return;
      }
      const api = window.electronAPI;
      const result = api?.ttsSpeak
        ? await api.ttsSpeak(payload)
        : ipcRenderer
        ? await ipcRenderer.invoke<ApiResult & { audioBase64?: string; mimeType?: string }>('tts-speak', payload)
        : null;
      if (!result?.success || !result?.audioBase64) {
        if (local.ttsProvider === 'auto' && 'speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(payload.text);
          utterance.lang = 'zh-CN';
          utterance.onend = () => setTtsPreviewStatus('success');
          utterance.onerror = () => {
            setTtsPreviewStatus('error');
            setTtsPreviewError(result?.error || '试听失败');
          };
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
          setTtsPreviewError('云端 TTS 不可用，已回退到浏览器本地朗读');
          return;
        }
        setTtsPreviewStatus('error');
        setTtsPreviewError(result?.error || '当前环境不支持 TTS 试听');
        return;
      }
      const mimeType = result?.mimeType || 'audio/mpeg';
      const audio = new Audio(`data:${mimeType};base64,${result.audioBase64}`);
      audio.onended = () => setTtsPreviewStatus('success');
      audio.onerror = () => {
        setTtsPreviewStatus('error');
        setTtsPreviewError('音频播放失败，请检查系统输出设备或音量');
      };
      await audio.play();
    } catch (err: unknown) {
      setTtsPreviewStatus('error');
      setTtsPreviewError(getErrorMessage(err) || '试听请求失败');
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
        <div className="settings-body" ref={bodyRef}>
          {panelWarning && (
            <div className="settings-banner-warning" role="alert">
              <span>{panelWarning}</span>
              <button
                type="button"
                className="settings-banner-close"
                onClick={() => setPanelWarning(null)}
                aria-label="关闭警告"
              >
                ×
              </button>
            </div>
          )}
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
              settingsMode={settingsMode}
              setSettingsMode={setSettingsMode}
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
              ttsPreviewStatus={ttsPreviewStatus}
              ttsPreviewError={ttsPreviewError}
              onPreviewTts={previewTts}
              minimaxTtsAvailable={minimaxTtsAvailable}
              minimaxVoiceId={apiKeys.TTS_MINIMAX_VOICE_ID || 'male-qn-qingse'}
              setMinimaxVoiceId={(v) => setApiKeys((prev) => ({ ...prev, TTS_MINIMAX_VOICE_ID: v }))}
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
                await window.electronAPI?.mcpAddServer?.(newServer.name, {
                  command: newServer.command,
                  args: newServer.args.split(' ').filter(Boolean),
                  env,
                });
                setNewServer({ name: '', command: '', args: '', envText: '' });
                loadMcpStatus();
              }}
              onUpdateServer={async (name, cfg) => {
                await window.electronAPI?.mcpAddServer?.(name, {
                  command: cfg.command,
                  args: cfg.args || [],
                  env: cfg.env || {},
                });
                loadMcpStatus();
              }}
              onRemoveServer={async (name) => {
                await window.electronAPI?.mcpRemoveServer?.(name);
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
