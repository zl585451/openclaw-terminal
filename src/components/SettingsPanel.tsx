import { useState, useEffect } from 'react';
import { useSettings, type StreamSpeed } from '../contexts/SettingsContext';
import { usePermissions } from '../contexts/PermissionsContext';
import type { PermissionConfig } from '../utils/permissionCheck';
import { THEMES, applyTheme, getCurrentTheme, type ThemeKey } from '../styles/themes';
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

type TabId = 'required' | 'interface' | 'memory' | 'advanced';

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
    OPENCLAW_WS_URL: 'ws://127.0.0.1:18789',
    OPENCLAW_TOKEN: '',
  });
  const [apiKeysLoaded, setApiKeysLoaded] = useState(false);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [gatewaySaveStatus, setGatewaySaveStatus] = useState<'idle' | 'saving' | 'success'>('idle');
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
  const [amyWorkModeWriting, setAmyWorkModeWriting] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>(() => getCurrentTheme());

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
          setApiKeys(result.data);
        }
        setApiKeysLoaded(true);
      }).catch(() => setApiKeysLoaded(true));
    } else {
      setApiKeysLoaded(true);
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
  }, []);

  // 记忆系统 Tab：每 5 秒刷新状态
  useEffect(() => {
    if (activeTab !== 'memory') return;
    const api = (window as any).electronAPI;
    if (!api?.getNocturneStatus) return;
    const refresh = () => {
      api.getNocturneStatus().then((r: any) => {
        setNocturneDetail(r);
        if (r?.backendAlive !== undefined) {
          setNocturneDashboardStatus({ backendRunning: r.backendAlive, frontendRunning: !!r.frontendAlive });
        }
      }).catch(() => {});
    };
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [activeTab]);

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
    localStorage.setItem('claw-terminal-advanced-settings', JSON.stringify({ fontSize, autoScroll, showNotifications, maxHistory }));
    document.documentElement.style.setProperty('--font-size-base', `${fontSize}px`);

    if (api?.saveApiKeys) {
      api.saveApiKeys(apiKeys).then((result: any) => {
        if (result.success) console.log('[Settings] API Keys saved');
      }).catch(() => {});
    }
    onClose();
  };

  const clearData = () => {
    if (confirm('确定要清除所有本地设置和聊天记录吗？此操作不可恢复。')) {
      localStorage.clear();
      location.reload();
    }
  };

  const saveGatewayAndReconnect = () => {
    const api = (window as any).electronAPI;
    if (!api?.saveApiKeys) return;
    setGatewaySaveStatus('saving');
    api.saveApiKeys({
      OPENCLAW_WS_URL: apiKeys.OPENCLAW_WS_URL || 'ws://127.0.0.1:18789',
      OPENCLAW_TOKEN: apiKeys.OPENCLAW_TOKEN || '',
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
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '6px', marginBottom: 12, fontFamily: 'monospace', fontSize: '13px', color: '#00ff88', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '6px', marginBottom: 12, fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all', color: '#00ff88aa' }}>
                          http://127.0.0.1:18789/dashboard#token=<span style={{ color: '#ffff00' }}>xxxxx-xxxxx-xxxxx</span>&amp;...
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
                <h3>2. API Key（大模型）</h3>
                <p className="settings-desc">至少填写一个，用于 AI 对话</p>
                {!apiKeysLoaded ? null : (
                  <>
                    <div className="settings-field">
                      <label>阿里云百炼 API Key</label>
                      <div className="settings-input-row">
                        <input
                          type={showApiKey.DASHSCOPE_API_KEY ? 'text' : 'password'}
                          value={apiKeys.DASHSCOPE_API_KEY}
                          onChange={(e) => setApiKeys((k) => ({ ...k, DASHSCOPE_API_KEY: e.target.value }))}
                          placeholder="sk-xxxxxxxxxxxxxxxx"
                          className="settings-input settings-input-focusable"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="settings-eye-btn"
                          onClick={() => setShowApiKey((s) => ({ ...s, DASHSCOPE_API_KEY: !s.DASHSCOPE_API_KEY }))}
                        >
                          {showApiKey.DASHSCOPE_API_KEY ? '🙈' : '👁'}
                        </button>
                      </div>
                      <a href="https://bailian.console.aliyun.com/" target="_blank" rel="noopener noreferrer" className="settings-link">获取 API Key →</a>
                    </div>
                    <div className="settings-field">
                      <label>DeepSeek API Key（备选）</label>
                      <div className="settings-input-row">
                        <input
                          type={showApiKey.DEEPSEEK_API_KEY ? 'text' : 'password'}
                          value={apiKeys.DEEPSEEK_API_KEY}
                          onChange={(e) => setApiKeys((k) => ({ ...k, DEEPSEEK_API_KEY: e.target.value }))}
                          placeholder="sk-xxxxxxxxxxxxxxxx"
                          className="settings-input settings-input-focusable"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="settings-eye-btn"
                          onClick={() => setShowApiKey((s) => ({ ...s, DEEPSEEK_API_KEY: !s.DEEPSEEK_API_KEY }))}
                        >
                          {showApiKey.DEEPSEEK_API_KEY ? '🙈' : '👁'}
                        </button>
                      </div>
                      <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer" className="settings-link">获取 API Key →</a>
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {Object.entries(THEMES).map(([key, theme]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        applyTheme(key as ThemeKey);
                        setCurrentTheme(key as ThemeKey);
                      }}
                      style={{
                        padding: '8px 16px',
                        background: currentTheme === key ? 'var(--accent)' : 'transparent',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        color: currentTheme === key ? '#000' : 'var(--text-secondary)',
                        fontSize: '13px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        fontFamily: 'inherit',
                      }}
                    >
                      {theme.name}
                    </button>
                  ))}
                </div>
              </section>
              <section className="settings-section">
                <h3>基础设置</h3>
                <div className="settings-row">
                  <label>流式速度</label>
                  <select value={local.streamSpeed} onChange={(e) => setLocal((s) => ({ ...s, streamSpeed: e.target.value as StreamSpeed }))}>
                    <option value="fast">快</option>
                    <option value="medium">中</option>
                    <option value="slow">慢</option>
                  </select>
                </div>
                <div className="settings-row">
                  <label>打字音效</label>
                  <label className="toggle-wrap">
                    <input type="checkbox" checked={local.typingSound} onChange={(e) => setLocal((s) => ({ ...s, typingSound: e.target.checked }))} />
                    <span className="toggle-slider" />
                  </label>
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
                <div style={{ color: '#00ff88aa', fontSize: '13px', lineHeight: 1.8 }}>
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

              {nocturneStatus?.available ? (
                <section className="settings-section">
                  <h3>记忆系统控制台</h3>
                  {/* 状态：后端 / 前端 / 已加载记忆数 */}
                  <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, fontSize: '13px' }}>
                    <p style={{ margin: '0 0 6px', color: '#00ff88' }}>
                      后端状态：{nocturneDetail?.backendAlive ? '✅ http://localhost:8000 可访问' : '❌ 不可用'}
                    </p>
                    <p style={{ margin: '0 0 6px', color: '#00ff88' }}>
                      前端状态：{nocturneDetail?.frontendAlive ? '✅ http://localhost:3000 可访问' : '❌ 不可用'}
                    </p>
                    <p style={{ margin: 0, color: '#00ff8866' }}>
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
                      <h4 style={{ marginBottom: 8, fontSize: '13px', color: '#00ff88' }}>核心记忆 URI</h4>
                      <ul style={{ margin: 0, paddingLeft: 20, fontSize: '12px', color: '#ccc' }}>
                        {nocturneDetail?.coreMemoryUris?.map((uri) => (
                          <li key={uri} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <code style={{ flex: 1, wordBreak: 'break-all' }}>{uri}</code>
                            <button
                              type="button"
                              className="settings-btn"
                              style={{ padding: '4px 10px', fontSize: '12px' }}
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
                    <div style={{ marginTop: 12, padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 8, fontSize: '12px', whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
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
          <button type="button" className="settings-cancel" onClick={onClose}>取消</button>
          <button type="button" className="settings-apply" onClick={apply}>应用</button>
        </div>
      </div>
    </div>
  );
}
