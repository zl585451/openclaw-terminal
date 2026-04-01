import { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { usePermissions } from '../contexts/PermissionsContext';
import '../styles/SettingsPanel.css';

import type { SettingsPanelProps, TabId } from '../ui/settings/types';
import { useApiKeys } from '../hooks/settings/useApiKeys';
import { useScreenshotShortcut } from '../hooks/settings/useScreenshotShortcut';
import { useNocturneMemory } from '../hooks/settings/useNocturneMemory';
import { useAiLibrary } from '../hooks/settings/useAiLibrary';
import { useAdvancedSettings } from '../hooks/settings/useAdvancedSettings';

// Tab components
import { ConnectionTab, InterfaceTab, MemoryTab, AdvancedTab } from '../ui/settings/tabs';

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, setSettings } = useSettings();
  const { permissions, setPermissions } = usePermissions();
  
  // Local UI state
  const [activeTab, setActiveTab] = useState<TabId>('required');
  const [local, setLocal] = useState(settings);
  const [localPerm, setLocalPerm] = useState(permissions);
  
  // Custom hooks for external system interactions
  const apiKeysHook = useApiKeys();
  const screenshotHook = useScreenshotShortcut();
  const nocturneHook = useNocturneMemory();
  const aiLibraryHook = useAiLibrary();
  const advancedHook = useAdvancedSettings();

  // Sync permissions when context changes
  useEffect(() => {
    setLocalPerm(permissions);
  }, [permissions]);

  // Sync local settings when context changes
  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  // Auto-refresh memory tab status
  useEffect(() => {
    if (activeTab !== 'memory') return;
    const interval = setInterval(() => {
      nocturneHook.refreshNocturneStatus();
      aiLibraryHook.refreshAiLibraryStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [activeTab, nocturneHook, aiLibraryHook]);

  const apply = async () => {
    setSettings(local);
    setPermissions(localPerm);
    
    // Save screenshot shortcut
    screenshotHook.saveShortcut();
    
    // Save advanced settings and apply font size
    advancedHook.saveAdvancedSettings();
    const base = parseInt(advancedHook.fontSize, 10);
    document.documentElement.style.setProperty('--text-sm', `${base - 2}px`);
    document.documentElement.style.setProperty('--text-base', `${base - 1}px`);
    document.documentElement.style.setProperty('--text-md', `${base}px`);
    document.documentElement.style.setProperty('--text-lg', `${base + 2}px`);
    document.documentElement.style.setProperty('--text-code', `${base - 1}px`);
    document.documentElement.style.setProperty('--text-code-sm', `${base - 2}px`);

    // Save API keys
    const keysToSave = {
      ...apiKeysHook.apiKeys,
      BRAVE_SEARCH_API_KEY: apiKeysHook.searchKeysRef.current.BRAVE_SEARCH_API_KEY || apiKeysHook.apiKeys.BRAVE_SEARCH_API_KEY || '',
      TAVILY_API_KEY: apiKeysHook.searchKeysRef.current.TAVILY_API_KEY || apiKeysHook.apiKeys.TAVILY_API_KEY || '',
    };
    
    const result = await apiKeysHook.saveApiKeys(keysToSave);
    if (result.success) {
      setTimeout(() => {
        onClose();
      }, 1200);
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
            <ConnectionTab />
          )}

          {activeTab === 'interface' && (
            <InterfaceTab 
              local={local}
              setLocal={setLocal}
              localPerm={localPerm}
              setLocalPerm={setLocalPerm}
            />
          )}

          {activeTab === 'memory' && (
            <MemoryTab />
          )}

          {activeTab === 'advanced' && (
            <AdvancedTab onClearData={clearData} />
          )}
        </div>

        <div className="settings-footer">
          <button type="button" onClick={clearData} className="settings-btn-danger">
            清除所有数据
          </button>
          <div className="settings-footer-right">
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              onClick={apply}
              className="settings-btn-primary"
              disabled={apiKeysHook.applyStatus === 'saving'}
            >
              {apiKeysHook.applyStatus === 'saving' ? '保存中...' : '应用设置'}
            </button>
          </div>
          {apiKeysHook.applyError && (
            <div className="settings-error">{apiKeysHook.applyError}</div>
          )}
        </div>
      </div>
    </div>
  );
}