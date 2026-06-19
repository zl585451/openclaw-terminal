import React, { useState, useRef, useEffect, useCallback, startTransition } from 'react';
import type { UseGatewayReturn } from '../../hooks/useGateway';
import LogPanel from '../../components/LogPanel';
import ConversationList from './ConversationList';
import TabBar from '../../components/TabBar';
import type { ConversationMeta } from '../../types/electronAPI';

const ipcRenderer =
  typeof window !== 'undefined' && typeof (window as any).require === 'function'
    ? (window as any).require('electron').ipcRenderer
    : {
        invoke: () => Promise.resolve(null),
        on: () => {},
        off: () => {},
        removeListener: () => {},
      };

export interface ChatTabRightPanelProps {
  gateway: UseGatewayReturn;
  wsConnected: boolean;
  memoryOnline: boolean;
  modelName: string;
  tokenIn: number | null;
  ctxUsed: number | null;
  ctxMax: number | null;
  conversations?: ConversationMeta[];
  activeConversationId?: string;
  onNewConversation?: () => void;
  onSwitchConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onOpenSettings?: () => void;
  activeTab?: 'chat' | 'workspace' | 'library';
  onTabChange?: (tab: 'chat' | 'workspace' | 'library') => void;
}

const PANEL_MIN_WIDTH = 220;
const PANEL_MAX_WIDTH = 560;
const PANEL_DEFAULT_WIDTH = 300;
const PANEL_WIDTH_KEY = 'oct.sidebar.width';

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'qwen3.5-plus': 131072,
  'qwen3-max': 131072,
  'qwen3-max-2026-01-23': 131072,
  'qwen-plus': 131072,
  'qwen-max': 131072,
  'qwen-turbo': 1000000,
  'qwen3-coder-next': 262144,
  'qwen3-coder-plus': 262144,
  'kimi-k2.6': 262144,
  'kimi-k2.5': 262144,
  'MiniMax-M2.5': 1048576,
  'MiniMax-M2.7': 1000000,
  'MiniMax-M2.7-highspeed': 1000000,
  'MiniMax-M2.5-standalone': 1000000,
  'MiniMax-M2.5-highspeed': 1000000,
  'MiniMax-M2.1': 1000000,
  'MiniMax-M2.1-highspeed': 1000000,
  'MiniMax-M2': 1000000,
  'glm-5': 131072,
  'glm-4.7': 131072,
  'deepseek-v3': 65536,
  'deepseek-r1': 65536,
  'deepseek-v4-flash': 128000,
  'deepseek-v4-pro': 128000,
  'deepseek-chat': 65536,
  'deepseek-reasoner': 65536,
};

function inferContextWindow(modelName: string): number | null {
  const modelId = String(modelName || '').trim();
  if (!modelId) return null;
  if (MODEL_CONTEXT_WINDOWS[modelId] != null) return MODEL_CONTEXT_WINDOWS[modelId];
  const matchedKey = Object.keys(MODEL_CONTEXT_WINDOWS).find((key) => modelId.startsWith(key));
  return matchedKey ? MODEL_CONTEXT_WINDOWS[matchedKey] : null;
}

function formatTokenK(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '--';
  return `${(value / 1000).toFixed(1)}k`;
}

/**
 * 右侧栏独立成子组件：折叠状态在内部，切换时不会触发 ChatTab 主列（含 MessageList）重渲染。
 * 默认折叠（P0-4）；展开态持久化 key：oct.devpanel.expanded === '1'。收放用侧边箭头按钮（与早期交互一致）。
 */
const ChatTabRightPanelComponent: React.FC<ChatTabRightPanelProps> = ({
  gateway,
  wsConnected,
  memoryOnline,
  modelName,
  tokenIn,
  ctxUsed,
  ctxMax,
  conversations,
  activeConversationId,
  onNewConversation,
  onSwitchConversation,
  onDeleteConversation,
  onOpenSettings,
  activeTab,
  onTabChange,
}) => {
  // 侧边栏宽度（可左右拖拽伸缩，持久化）
  const [panelWidth, setPanelWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY));
      if (saved >= PANEL_MIN_WIDTH && saved <= PANEL_MAX_WIDTH) return saved;
    } catch { /* ignore */ }
    return PANEL_DEFAULT_WIDTH;
  });
  const draggingRef = useRef(false);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      // 侧栏在最左，宽度 = 鼠标到窗口左缘的距离（夹在 min/max 内）
      const w = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, e.clientX));
      setPanelWidth(w);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth)); } catch { /* ignore */ }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [panelWidth]);

  /** P0-4：默认折叠；仅当用户曾展开过并写入 oct.devpanel.expanded=1 时首次展开 */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('oct.devpanel.expanded') !== '1';
    } catch {
      return true;
    }
  });
  const effectiveCtxMax = ctxMax ?? inferContextWindow(modelName);
  const effectiveCtxUsed = ctxUsed ?? tokenIn ?? null;
  const isEstimatedCtxUsed = ctxUsed == null && effectiveCtxUsed != null;
  const ctxPercent = effectiveCtxUsed != null && effectiveCtxMax != null && effectiveCtxMax > 0
    ? Math.max(0, Math.min(100, Math.round((effectiveCtxUsed / effectiveCtxMax) * 100)))
    : null;

  const toggleSidebar = () => {
    startTransition(() => {
      setSidebarCollapsed((v) => {
        const nextCollapsed = !v;
        try {
          localStorage.setItem('oct.devpanel.expanded', nextCollapsed ? '0' : '1');
        } catch {
          /* ignore */
        }
        return nextCollapsed;
      });
    });
  };

  // 「系统 / 日志」抽屉：默认折叠，让对话列表占满，贴近 Claude 的干净侧栏
  const [devExpanded, setDevExpanded] = useState(() => {
    try {
      return localStorage.getItem('oct.devtools.expanded') === '1';
    } catch {
      return false;
    }
  });
  const toggleDev = () => {
    setDevExpanded((v) => {
      const next = !v;
      try { localStorage.setItem('oct.devtools.expanded', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <div
      className={`right-panel ${sidebarCollapsed ? 'right-panel--collapsed' : ''}`}
      style={sidebarCollapsed ? undefined : { width: panelWidth }}
    >
      <button
        type="button"
        onClick={toggleSidebar}
        className={`right-panel-toggle ${sidebarCollapsed ? 'is-collapsed' : ''}`}
        title={sidebarCollapsed ? '展开开发者面板' : '收起开发者面板'}
      >
        {sidebarCollapsed ? '\u203A' : '\u2039'}
      </button>
      {!sidebarCollapsed && (
        <div className="right-panel-resizer" onMouseDown={onResizeStart} title="拖拽调整宽度" />
      )}
      <div className={`right-panel-inner ${sidebarCollapsed ? 'is-hidden' : ''}`}>
        {onTabChange && (
          <div className="sidebar-tabbar">
            <TabBar activeTab={activeTab || 'chat'} onTabChange={onTabChange} />
          </div>
        )}
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onNewConversation={onNewConversation}
          onSwitchConversation={onSwitchConversation}
          onDeleteConversation={onDeleteConversation}
        />
        {/* 常显：连接状态圆点 + 展开「系统 / 日志」抽屉 */}
        <button type="button" className="panel-dev-toggle" onClick={toggleDev} title={devExpanded ? '收起系统与日志' : '展开系统与日志'}>
          <span className="panel-dev-dots">
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: wsConnected ? 'var(--status-success)' : 'var(--status-error)', animation: wsConnected ? 'pulse-green 2s infinite' : 'pulse-red 1s infinite' }} />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>GW</span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: memoryOnline ? 'var(--status-info)' : 'var(--status-error)', animation: memoryOnline ? 'pulse-blue 3s infinite' : 'pulse-red 1s infinite' }} />
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>MEM</span>
            </span>
          </span>
          <span className="panel-dev-label">系统 · 日志 {devExpanded ? '▾' : '▸'}</span>
        </button>

        {devExpanded ? (
        <div className="panel-dev-body">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            padding: '4px 12px',
            borderBottom: '1px solid var(--border-subtle)',
            gap: '8px',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <div style={{ display: 'flex', gap: '4px' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>MODEL</span>
            <span style={{ color: 'var(--accent-primary)' }}>{modelName || '--'}</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>TOK</span>
            <span style={{ color: 'var(--accent-primary)' }}>
              {formatTokenK(tokenIn)}/
              {effectiveCtxMax != null ? `${Math.round(effectiveCtxMax / 1000)}k` : '--'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>CTX</span>
            <span
              style={{
                color:
                  effectiveCtxUsed != null && effectiveCtxMax != null && effectiveCtxMax > 0 && effectiveCtxUsed / effectiveCtxMax > 0.8
                    ? 'var(--status-error)'
                    : 'var(--accent-primary)',
              }}
              title={isEstimatedCtxUsed ? 'CTX 为估算值：厂商未返回显式 context 使用量，当前按输入 tokens 近似显示' : undefined}
            >
              {effectiveCtxUsed != null && effectiveCtxMax != null && effectiveCtxMax > 0
                ? `${isEstimatedCtxUsed ? '~' : ''}${formatTokenK(effectiveCtxUsed)} (${ctxPercent}%)`
                : effectiveCtxUsed != null
                  ? `${isEstimatedCtxUsed ? '~' : ''}${formatTokenK(effectiveCtxUsed)}`
                  : '--'}
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: '6px 12px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (gateway.gatewayRunning) {
                gateway.stopGateway();
              } else {
                gateway.startGateway();
              }
            }}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-sans)',
              background: 'transparent',
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '1px',
              transition: 'all 0.15s',
              border: `1px solid ${gateway.gatewayRunning ? 'var(--status-error)' : 'var(--status-success)'}`,
              color: gateway.gatewayRunning ? 'var(--status-error)' : 'var(--status-success)',
            }}
          >
            {gateway.gatewayRunning ? '■ 停止' : '▶ 启动'}
          </button>
          <button
            type="button"
            onClick={gateway.restartGateway}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-sans)',
              background: 'transparent',
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '1px',
              transition: 'all 0.15s',
              border: '1px solid var(--status-warning)',
              color: 'var(--status-warning)',
            }}
          >
            ↺ 重启
          </button>
          <button
            type="button"
            onClick={() => ipcRenderer.invoke('open-terminal-window')}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-sans)',
              background: 'transparent',
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '1px',
              transition: 'all 0.15s',
              border: '1px solid var(--border-light)',
              color: 'var(--text-secondary)',
            }}
          >
            &gt; 终端
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).electronAPI?.enterFloatingMode) {
                (window as any).electronAPI.enterFloatingMode();
              }
            }}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-sans)',
              background: 'transparent',
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '1px',
              transition: 'all 0.15s',
              border: '1px solid var(--border-light)',
              color: 'var(--text-secondary)',
            }}
          >
            ◎ 悬浮
          </button>
        </div>

        <div className="gateway-log-section">
          <LogPanel
            title="Gateway 日志"
            lines={gateway.logLines}
            bodyRef={gateway.logContainerRef}
            emptyText="[LOG] 等待 Gateway 日志..."
            memoryOnline={memoryOnline}
            modelName={modelName}
            onExport={gateway.exportLogs}
            onClear={gateway.clearLogs}
          />
        </div>
        </div>
        ) : null}

        <button
          type="button"
          className="panel-settings-btn"
          onClick={() => onOpenSettings?.()}
          title="设置"
        >
          <span className="panel-settings-gear">⚙</span>
          <span>设置</span>
        </button>
      </div>
    </div>
  );
};

const ChatTabRightPanel = React.memo(ChatTabRightPanelComponent, (prev, next) => {
  return (
    prev.wsConnected === next.wsConnected &&
    prev.memoryOnline === next.memoryOnline &&
    prev.modelName === next.modelName &&
    prev.tokenIn === next.tokenIn &&
    prev.ctxUsed === next.ctxUsed &&
    prev.ctxMax === next.ctxMax &&
    prev.conversations === next.conversations &&
    prev.activeConversationId === next.activeConversationId &&
    prev.onNewConversation === next.onNewConversation &&
    prev.onSwitchConversation === next.onSwitchConversation &&
    prev.onDeleteConversation === next.onDeleteConversation &&
    prev.onOpenSettings === next.onOpenSettings &&
    prev.activeTab === next.activeTab &&
    prev.onTabChange === next.onTabChange &&
    prev.gateway.gatewayRunning === next.gateway.gatewayRunning &&
    prev.gateway.gatewayManaged === next.gateway.gatewayManaged &&
    prev.gateway.gatewayPortInUse === next.gateway.gatewayPortInUse &&
    prev.gateway.logLines === next.gateway.logLines
  );
});

ChatTabRightPanel.displayName = 'ChatTabRightPanel';

export default ChatTabRightPanel;
