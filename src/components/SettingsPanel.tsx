import { useState, useEffect } from 'react';
import { useSettings, type StreamSpeed, type ThemeColor } from '../contexts/SettingsContext';
import { usePermissions } from '../contexts/PermissionsContext';
import type { PermissionConfig } from '../utils/permissionCheck';
import '../styles/SettingsPanel.css';

const SCREENSHOT_SHORTCUT_OPTIONS = [
  { value: 'Alt+A', label: 'Alt+A' },
  { value: 'CommandOrControl+Shift+X', label: 'Ctrl+Shift+X' },
  { value: 'CommandOrControl+Shift+S', label: 'Ctrl+Shift+S' },
  { value: '__CUSTOM__', label: '自定义' },
] as const;

const FONT_SIZE_OPTIONS = [
  { value: '12', label: '小 (12px)' },
  { value: '14', label: '中 (14px)' },
  { value: '16', label: '大 (16px)' },
  { value: '18', label: '特大 (18px)' },
] as const;

interface SettingsPanelProps {
  onClose: () => void;
}

const PERMISSION_ITEMS: Array<{ key: keyof PermissionConfig; label: string }> = [
  { key: 'shellCommands', label: '允许执行 Shell 命令' },
  { key: 'fileWrite', label: '允许文件系统写操作' },
  { key: 'networkRequests', label: '允许网络请求' },
  { key: 'softwareInstall', label: '允许安装软件' },
  { key: 'systemConfig', label: '允许系统配置修改' },
];

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, setSettings } = useSettings();
  const { permissions, setPermissions } = usePermissions();
  const [local, setLocal] = useState(settings);
  const [localPerm, setLocalPerm] = useState(permissions);
  const [screenshotShortcut, setScreenshotShortcut] = useState('Alt+A');
  const [shortcutCustom, setShortcutCustom] = useState('');
  const [shortcutMode, setShortcutMode] = useState<'preset' | 'custom'>('preset');
  const [fontSize, setFontSize] = useState('14');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showNotifications, setShowNotifications] = useState(true);
  const [maxHistory, setMaxHistory] = useState(100);
  
  // API Key 配置
  const [apiKeys, setApiKeys] = useState({
    DASHSCOPE_API_KEY: '',
    DEEPSEEK_API_KEY: '',
    OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
    OPENCLAW_TOKEN: '',
  });
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

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
    // Load additional settings
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
    
    // Load API Keys
    if (api?.getApiKeys) {
      api.getApiKeys().then((result: any) => {
        if (result.success && result.data) {
          setApiKeys(result.data);
        }
        setApiKeysLoaded(true);
      }).catch(() => setApiKeysLoaded(true));
    } else {
      setApiKeysLoaded(true);
    }
  }, []);

  useEffect(() => {
    setLocalPerm(permissions);
  }, [permissions]);

  const apply = () => {
    setSettings(local);
    setPermissions(localPerm);
    const api = (window as any).electronAPI;
    if (api?.setScreenshotShortcut) {
      const shortcut = shortcutMode === 'custom' ? shortcutCustom.trim() || 'Alt+A' : screenshotShortcut;
      api.setScreenshotShortcut(shortcut);
    }
    // Save advanced settings
    localStorage.setItem('claw-terminal-advanced-settings', JSON.stringify({
      fontSize,
      autoScroll,
      showNotifications,
      maxHistory,
    }));
    // Apply font size to document
    document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`);
    
    // Save API Keys
    if (api?.saveApiKeys) {
      api.saveApiKeys(apiKeys).then((result: any) => {
        if (result.success) {
          console.log('[Settings] API Keys saved');
        } else {
          console.error('[Settings] Failed to save API Keys:', result.error);
        }
      }).catch((e: any) => console.error('[Settings] Save API Keys error:', e));
    }
    
    onClose();
  };

  const clearData = () => {
    if (confirm('确定要清除所有本地设置和聊天记录吗？此操作不可恢复。')) {
      localStorage.clear();
      location.reload();
    }
  };


  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>◈ 设置</span>
          <button type="button" className="settings-close" onClick={onClose}>×</button>
        </div>
        <div className="settings-body">
          <div className="settings-section-title">基础设置</div>
          <div className="settings-row">
            <label>流式速度</label>
            <select
              value={local.streamSpeed}
              onChange={(e) => setLocal((s) => ({ ...s, streamSpeed: e.target.value as StreamSpeed }))}
            >
              <option value="fast">快</option>
              <option value="medium">中</option>
              <option value="slow">慢</option>
            </select>
          </div>
          <div className="settings-row">
            <label>打字音效</label>
            <label className="toggle-wrap">
              <input
                type="checkbox"
                checked={local.typingSound}
                onChange={(e) => setLocal((s) => ({ ...s, typingSound: e.target.checked }))}
              />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="settings-row">
            <label>主题颜色</label>
            <div className="theme-options">
              {(['green', 'cyan', 'yellow'] as ThemeColor[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`theme-btn ${local.theme === t ? 'active' : ''}`}
                  data-theme={t}
                  onClick={() => setLocal((s) => ({ ...s, theme: t }))}
                >
                  {t === 'green' && '绿'}
                  {t === 'cyan' && '青'}
                  {t === 'yellow' && '黄'}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section-title">API 配置</div>
          {!apiKeysLoaded ? (
            <div className="settings-row">
              <label style={{ color: '#888' }}>加载中...</label>
            </div>
          ) : (
            <>
              <div className="settings-row">
                <label>阿里云百炼 API Key</label>
                <div className="settings-input-group">
                  <input
                    type={showApiKey.DASHSCOPE_API_KEY ? 'text' : 'password'}
                    value={apiKeys.DASHSCOPE_API_KEY}
                    onChange={(e) => setApiKeys((k) => ({ ...k, DASHSCOPE_API_KEY: e.target.value }))}
                    placeholder="sk-xxxxxxxxxxxxxxxx"
                    className="settings-input"
                  />
                  <button
                    type="button"
                    className="settings-toggle-visibility"
                    onClick={() => setShowApiKey((s) => ({ ...s, DASHSCOPE_API_KEY: !s.DASHSCOPE_API_KEY }))}
                    title={showApiKey.DASHSCOPE_API_KEY ? '隐藏' : '显示'}
                  >
                    {showApiKey.DASHSCOPE_API_KEY ? '🙈' : '👁'}
                  </button>
                </div>
                <div className="settings-hint">
                  从 <a href="https://bailian.console.aliyun.com/" target="_blank" rel="noopener noreferrer">阿里云百炼控制台</a> 获取
                </div>
              </div>
              
              <div className="settings-row">
                <label>DeepSeek API Key（备选）</label>
                <div className="settings-input-group">
                  <input
                    type={showApiKey.DEEPSEEK_API_KEY ? 'text' : 'password'}
                    value={apiKeys.DEEPSEEK_API_KEY}
                    onChange={(e) => setApiKeys((k) => ({ ...k, DEEPSEEK_API_KEY: e.target.value }))}
                    placeholder="sk-xxxxxxxxxxxxxxxx"
                    className="settings-input"
                  />
                  <button
                    type="button"
                    className="settings-toggle-visibility"
                    onClick={() => setShowApiKey((s) => ({ ...s, DEEPSEEK_API_KEY: !s.DEEPSEEK_API_KEY }))}
                    title={showApiKey.DEEPSEEK_API_KEY ? '隐藏' : '显示'}
                  >
                    {showApiKey.DEEPSEEK_API_KEY ? '🙈' : '👁'}
                  </button>
                </div>
                <div className="settings-hint">
                  从 <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer">DeepSeek 平台</a> 获取
                </div>
              </div>
              
              <div className="settings-row">
                <label>OpenClaw WebSocket 地址</label>
                <input
                  type="text"
                  value={apiKeys.OPENCLAW_WS_URL}
                  onChange={(e) => setApiKeys((k) => ({ ...k, OPENCLAW_WS_URL: e.target.value }))}
                  placeholder="ws://127.0.0.1:18789"
                  className="settings-input"
                />
              </div>
              
              <div className="settings-row">
                <label>OpenClaw Token</label>
                <div className="settings-input-group">
                  <input
                    type={showApiKey.OPENCLAW_TOKEN ? 'text' : 'password'}
                    value={apiKeys.OPENCLAW_TOKEN}
                    onChange={(e) => setApiKeys((k) => ({ ...k, OPENCLAW_TOKEN: e.target.value }))}
                    placeholder="用于连接本地 OpenClaw Gateway"
                    className="settings-input"
                  />
                  <button
                    type="button"
                    className="settings-toggle-visibility"
                    onClick={() => setShowApiKey((s) => ({ ...s, OPENCLAW_TOKEN: !s.OPENCLAW_TOKEN }))}
                    title={showApiKey.OPENCLAW_TOKEN ? '隐藏' : '显示'}
                  >
                    {showApiKey.OPENCLAW_TOKEN ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="settings-section-title">界面设置</div>
          <div className="settings-row">
            <label>字体大小</label>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value)}
              className="settings-select"
            >
              {FONT_SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="settings-row">
            <label>自动滚动</label>
            <label className="toggle-wrap">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="settings-row">
            <label>桌面通知</label>
            <label className="toggle-wrap">
              <input
                type="checkbox"
                checked={showNotifications}
                onChange={(e) => setShowNotifications(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
          <div className="settings-row">
            <label>消息历史上限</label>
            <select
              value={maxHistory}
              onChange={(e) => setMaxHistory(Number(e.target.value))}
              className="settings-select"
            >
              <option value={50}>50 条</option>
              <option value={100}>100 条</option>
              <option value={200}>200 条</option>
              <option value={500}>500 条</option>
            </select>
          </div>

          <div className="settings-section-title">Agent 权限控制</div>
          {PERMISSION_ITEMS.map(({ key, label }) => (
            <div key={key} className="settings-row">
              <label>{label}</label>
              <label className="toggle-wrap">
                <input
                  type="checkbox"
                  checked={localPerm[key]}
                  onChange={(e) => setLocalPerm((p) => ({ ...p, [key]: e.target.checked }))}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          ))}

          <div className="settings-section-title">快捷键</div>
          <div className="settings-row">
            <label>截图快捷键</label>
            <div className="settings-shortcut-wrap">
              <select
                value={shortcutMode === 'custom' ? '__CUSTOM__' : screenshotShortcut}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === '__CUSTOM__') {
                    setShortcutMode('custom');
                    setShortcutCustom(screenshotShortcut);
                  } else {
                    setShortcutMode('preset');
                    setScreenshotShortcut(v);
                  }
                }}
                className="settings-shortcut-select"
              >
                {SCREENSHOT_SHORTCUT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {shortcutMode === 'custom' && (
                <input
                  type="text"
                  value={shortcutCustom}
                  onChange={(e) => setShortcutCustom(e.target.value)}
                  placeholder="如 Ctrl+Alt+S"
                  className="settings-shortcut-input"
                />
              )}
            </div>
          </div>

          <div className="settings-section-title settings-danger-zone">
            <span>⚠ 危险操作</span>
          </div>
          <div className="settings-row settings-danger-row">
            <label>清除所有数据</label>
            <button type="button" className="settings-danger-btn" onClick={clearData}>
              清除
            </button>
          </div>
        </div>
        <div className="settings-footer">
          <button type="button" className="settings-cancel" onClick={onClose}>取消</button>
          <button type="button" className="settings-apply" onClick={apply}>应用</button>
        </div>
      </div>
    </div>
  );
}
