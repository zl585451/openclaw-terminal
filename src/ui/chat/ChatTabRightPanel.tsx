import React, { useState, startTransition } from 'react';
import type { UseGatewayReturn } from '../../hooks/useGateway';
import TaskBoard from '../../components/TaskBoard';
import LogPanel from '../../components/LogPanel';

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
  nocturneOnline: boolean;
  modelName: string;
  tokenIn: number | null;
  ctxUsed: number | null;
  ctxMax: number | null;
  streak: number;
  pauseSidePanelsDuringStream: boolean;
  localTime: string;
  localDate: string;
}

const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'qwen3.5-plus': 131072,
  'qwen3-max': 131072,
  'qwen3-max-2026-01-23': 131072,
  'qwen-plus': 131072,
  'qwen-max': 131072,
  'qwen-turbo': 1000000,
  'qwen3-coder-next': 262144,
  'qwen3-coder-plus': 262144,
  'kimi-k2.5': 131072,
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
  nocturneOnline,
  modelName,
  tokenIn,
  ctxUsed,
  ctxMax,
  streak,
  pauseSidePanelsDuringStream,
  localTime,
  localDate,
}) => {
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

  return (
    <div className={`right-panel ${sidebarCollapsed ? 'right-panel--collapsed' : ''}`}>
      <button
        type="button"
        onClick={toggleSidebar}
        className={`right-panel-toggle ${sidebarCollapsed ? 'is-collapsed' : ''}`}
        title={sidebarCollapsed ? '展开开发者面板' : '收起开发者面板'}
      >
        {sidebarCollapsed ? '\u203A' : '\u2039'}
      </button>
      <div className={`right-panel-inner ${sidebarCollapsed ? 'is-hidden' : ''}`}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 12px',
            borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: wsConnected ? 'var(--status-success)' : 'var(--status-error)',
                animation: wsConnected ? 'pulse-green 2s infinite' : 'pulse-red 1s infinite',
              }}
            />
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              GW
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: nocturneOnline ? 'var(--status-info)' : 'var(--status-error)',
                animation: nocturneOnline ? 'pulse-blue 3s infinite' : 'pulse-red 1s infinite',
              }}
            />
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              MEM
            </span>
          </div>

          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-3xl)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 500,
                letterSpacing: '1px',
                lineHeight: 1,
              }}
            >
              {localTime || '--:--'}
            </div>
            <div
              style={{
                width: '1px',
                height: '16px',
                background: 'var(--border-subtle)',
              }}
            />
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-sans)',
                letterSpacing: '0.5px',
                lineHeight: 1,
              }}
            >
              {localDate || ''}
            </div>
          </div>
        </div>

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
          {streak > 0 && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <span style={{ color: 'var(--status-warning)' }}>🔥 STREAK {streak}</span>
            </div>
          )}
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

        <div className="task-board-section">
          <TaskBoard compact visible={!pauseSidePanelsDuringStream} />
        </div>

        <div className="gateway-log-section">
          <LogPanel
            title="Gateway 日志"
            lines={gateway.logLines}
            bodyRef={gateway.logContainerRef}
            emptyText="[LOG] 等待 Gateway 日志..."
            nocturneOnline={nocturneOnline}
            modelName={modelName}
            onExport={gateway.exportLogs}
            onClear={gateway.clearLogs}
          />
        </div>
      </div>
    </div>
  );
};

const ChatTabRightPanel = React.memo(ChatTabRightPanelComponent, (prev, next) => {
  return (
    prev.wsConnected === next.wsConnected &&
    prev.nocturneOnline === next.nocturneOnline &&
    prev.modelName === next.modelName &&
    prev.tokenIn === next.tokenIn &&
    prev.ctxUsed === next.ctxUsed &&
    prev.ctxMax === next.ctxMax &&
    prev.streak === next.streak &&
    prev.pauseSidePanelsDuringStream === next.pauseSidePanelsDuringStream &&
    prev.localTime === next.localTime &&
    prev.localDate === next.localDate &&
    prev.gateway.gatewayRunning === next.gateway.gatewayRunning &&
    prev.gateway.gatewayManaged === next.gateway.gatewayManaged &&
    prev.gateway.gatewayPortInUse === next.gateway.gatewayPortInUse &&
    prev.gateway.logLines === next.gateway.logLines
  );
});

ChatTabRightPanel.displayName = 'ChatTabRightPanel';

export default ChatTabRightPanel;
