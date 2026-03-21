import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/LogPanel.css';

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'OK';

export type LogEntry = {
  id: number;
  raw: string;
  tag: string;
  time: string;
  level: LogLevel;
  message: string;
};

const ALL_LEVELS: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'OK'];

const MODULE_COLORS: Record<string, { bg: string; text: string }> = {
  Memory: { bg: '#2a1f3d', text: '#c4b5fd' },
  MemHistory: { bg: '#2a1f3d', text: '#c4b5fd' },
  Feedback: { bg: '#1a2e1a', text: '#86efac' },
  SelfEval: { bg: '#2e2a1a', text: '#fcd34d' },
  Gateway: { bg: '#1a2a3d', text: '#93c5fd' },
  AI: { bg: '#1a2a3d', text: '#93c5fd' },
  Config: { bg: '#2a2a2a', text: '#a0a0a0' },
  Parking: { bg: '#2e1a2a', text: '#f9a8d4' },
  Tool: { bg: '#1a2e2a', text: '#5eead4' },
  ExtractMem: { bg: '#2a1f3d', text: '#c4b5fd' },
  Hypothesis: { bg: '#2e2a1a', text: '#fcd34d' },
  ERROR: { bg: '#3d1a1a', text: '#fca5a5' },
  WARN: { bg: '#3d2e1a', text: '#fdba74' },
  OK: { bg: '#1a2e1a', text: '#86efac' },
  OCT: { bg: '#2a2a2a', text: '#a0a0a0' },
  mem: { bg: '#2a1f3d', text: '#c4b5fd' },
  memory: { bg: '#2a1f3d', text: '#c4b5fd' },
  memory_history: { bg: '#2a1f3d', text: '#c4b5fd' },
  memory_feedback: { bg: '#1a2e1a', text: '#86efac' },
  memory_search: { bg: '#2a1f3d', text: '#c4b5fd' },
  self_eval: { bg: '#2e2a1a', text: '#fcd34d' },
  gateway: { bg: '#1a2a3d', text: '#93c5fd' },
  ai: { bg: '#1a2a3d', text: '#93c5fd' },
  config: { bg: '#2a2a2a', text: '#a0a0a0' },
  tools: { bg: '#1a2e2a', text: '#5eead4' },
  hypothesis: { bg: '#2e2a1a', text: '#fcd34d' },
  clarification: { bg: '#2a1f3d', text: '#c4b5fd' },
  session: { bg: '#2a2a2a', text: '#a0a0a0' },
};
const DEFAULT_MODULE_COLOR = { bg: '#2a2a2a', text: '#a0a0a0' };

function parseLevel(raw: string): LogLevel {
  const upper = raw.toUpperCase();
  if (upper.includes('[ERROR]')) return 'ERROR';
  if (upper.includes('[WARN]') || upper.includes('[WARNING]')) return 'WARN';
  if (upper.includes('[DEBUG]')) return 'DEBUG';
  if (upper.includes('[OK]')) return 'OK';
  if (upper.includes('[INFO]')) return 'INFO';
  if (/error|failed|exception|stack/i.test(raw)) return 'ERROR';
  if (/warn|invalid|missing/i.test(raw)) return 'WARN';
  if (/debug|trace/i.test(raw)) return 'DEBUG';
  if (/ok|success|saved|written|complete/i.test(raw)) return 'OK';
  return 'INFO';
}

/** 后端模块名 → 前端 tag（用于过滤匹配） */
const MODULE_TO_TAG: Record<string, string> = {
  mem: 'Memory',
  memory: 'Memory',
  memory_history: 'MemHistory',
  memory_feedback: 'Feedback',
  memory_search: 'Memory',
  self_eval: 'SelfEval',
  gateway: 'Gateway',
  ai: 'AI',
  config: 'Config',
  tools: 'Tool',
  hypothesis: 'Hypothesis',
  clarification: 'Memory',
  session: 'Gateway',
};

/** 解析原始日志行。支持格式：
 * 1) oct-gateway: [yyyy-mm-dd hh:mi:ss] [LEVEL] [MODULE] message
 * 2) 带 [OCT] 前缀: [OCT] [ts] [LEVEL] [MODULE] message
 * 3) 旧格式: [TAG] [TIME] [LEVEL] message 或 [TAG] message */
function formatLogLine(raw: string, id: number): LogEntry {
  let line = raw;
  const isErr = line.startsWith('[OCT ERR]');
  if (line.startsWith('[OCT] ') || line.startsWith('[OCT ERR] ')) {
    line = line.replace(/^\[OCT\]\s*|^\[OCT ERR\]\s*/, '');
  }
  // oct-gateway 格式: [2026-03-20 19:42:01] [INFO] [gateway] stream done
  const backendMatch = line.match(/^\[([\d-]+\s[\d:]+)\]\s*\[(\w+)\]\s*\[(\w+)\]\s*(.*)/s);
  if (backendMatch) {
    const [, time, levelStr, module, message] = backendMatch;
    const tag = MODULE_TO_TAG[module] || module;
    return {
      id,
      raw,
      tag,
      time: time || '',
      level: parseLevel(`[${levelStr}]`),
      message: formatMessage(message || ''),
    };
  }
  const match = line.match(/^\[(\w+)\]\s*\[([^\]]+)\]\s*\[(\w+)\]\s*(.*)/s);
  if (match) {
    const [, tag, time, levelStr, message] = match;
    return {
      id,
      raw,
      tag: tag || '',
      time: time || '',
      level: parseLevel(`[${levelStr}]`),
      message: formatMessage(message || ''),
    };
  }
  const match2 = line.match(/^\[(\w+)\]\s*(.*)/s);
  if (match2) {
    const [, tag, message] = match2;
    return {
      id,
      raw,
      tag: tag || '',
      time: '',
      level: isErr ? 'ERROR' : 'INFO',
      message: formatMessage(message || ''),
    };
  }
  return {
    id,
    raw,
    tag: isErr ? 'ERROR' : '',
    time: '',
    level: parseLevel(raw),
    message: formatMessage(raw),
  };
}

/** 解析消息中的 JSON，提取关键字段 */
function formatMessage(msg: string): string {
  const jsonMatch = msg.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      const parts: string[] = [];
      if (obj.uri) parts.push('uri: ' + obj.uri);
      if (obj.error) parts.push('error: ' + obj.error);
      if (obj.score != null) parts.push('score: ' + obj.score);
      if (obj.label) parts.push('label: ' + obj.label);
      if (parts.length > 0) {
        const prefix = msg.slice(0, msg.indexOf(jsonMatch[0])).trim();
        return prefix ? prefix + ' ' + parts.join(' · ') : parts.join(' · ');
      }
    } catch {
      /* ignore */
    }
  }
  return msg;
}

type LogFilterType = 'all' | 'error' | 'memory' | 'eval' | 'gateway' | 'tools';

function filterByType(entries: LogEntry[], filter: LogFilterType): LogEntry[] {
  if (filter === 'all') return entries;
  return entries.filter((e) => {
    if (filter === 'error') return e.level === 'ERROR' || e.level === 'WARN';
    if (filter === 'memory') {
      const memTags = ['Memory', 'MemHistory', 'Feedback', 'ExtractMem'];
      if (memTags.includes(e.tag)) return true;
      if (e.tag === 'Gateway' && /memory extracted|history summary|feedback saved/i.test(e.raw)) return true;
      return false;
    }
    if (filter === 'eval') return ['SelfEval', 'Hypothesis'].includes(e.tag);
    if (filter === 'gateway') return ['Gateway', 'AI', 'Config'].includes(e.tag);
    if (filter === 'tools') return ['Tool', 'tools'].includes(e.tag) || /tool_call|exec_command|read_file|write_file|web_search|web_fetch/i.test(e.raw);
    return true;
  });
}

export default function LogPanel(props: {
  title?: string;
  lines: string[];
  bodyRef?: React.RefObject<HTMLDivElement>;
  onClear?: () => void;
  onExport?: () => void;
  emptyText?: string;
  nocturneOnline?: boolean;
  modelName?: string;
}) {
  const {
    title = 'Gateway 日志',
    lines,
    bodyRef,
    onClear,
    onExport,
    emptyText = '[LOG] 等待日志...',
    nocturneOnline,
    modelName,
  } = props;
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const [levelFilter, setLevelFilter] = useState<Record<LogLevel, boolean>>({
    ERROR: true,
    WARN: true,
    INFO: true,
    DEBUG: true,
    OK: true,
  });
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const [logFontSize, setLogFontSize] = useState(13);
  const [logFilter, setLogFilter] = useState<LogFilterType>('all');
  const internalBodyRef = useRef<HTMLDivElement>(null);

  // 展开/收回时自动滚动到底部
  useEffect(() => {
    if (logExpanded && internalBodyRef.current) {
      setTimeout(() => {
        internalBodyRef.current?.scrollTo({
          top: internalBodyRef.current.scrollHeight,
          behavior: 'instant',
        });
      }, 50);
    }
  }, [logExpanded]);

  // 新日志时自动滚动到底部（非用户手动滚动时）
  useEffect(() => {
    const el = internalBodyRef.current;
    if (!el) return;
    // 检查是否接近底部（100px 内视为"在底部"）
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (isNearBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'instant' });
    }
  }, [lines]);

  useEffect(() => {
    if (!logExpanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLogExpanded(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handler);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handler);
    };
  }, [logExpanded]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const el = menuWrapRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setFilterOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [filterOpen]);

  const parsed = useMemo(
    () => lines.map((raw, i) => formatLogLine(raw, i)),
    [lines]
  );

  const filteredByLevel = useMemo(
    () => parsed.filter((e) => levelFilter[e.level]),
    [parsed, levelFilter]
  );

  const filtered = useMemo(
    () => filterByType(filteredByLevel, logFilter),
    [filteredByLevel, logFilter]
  );

  const renderLogLine = (e: LogEntry) => {
    const style = e.tag ? (MODULE_COLORS[e.tag] ?? DEFAULT_MODULE_COLOR) : null;
    return (
      <div key={e.id} className={`log-line log-${e.level}`}>
        {showTimestamp && e.time ? (
          <span className="log-ts">[{e.time}]</span>
        ) : null}
        {e.tag ? (
          <span
            className="log-tag"
            style={
              style
                ? {
                    backgroundColor: style.bg,
                    color: style.text,
                    padding: '1px 6px',
                    borderRadius: '4px',
                    marginRight: 8,
                  }
                : undefined
            }
          >
            [{e.tag}]
          </span>
        ) : null}
        <span className="log-lv">[{e.level}]</span>
        <span className="log-msg">{e.message}</span>
      </div>
    );
  };

  const filters: { key: LogFilterType; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'error', label: '错误' },
    { key: 'memory', label: '记忆' },
    { key: 'eval', label: '评估' },
    { key: 'gateway', label: 'Gateway' },
    { key: 'tools', label: 'Tools' },
  ];

  return (
    <>
      <div className="log-panel">
        <div className="log-panel-header">
          <span className="log-panel-title">{title}</span>
          <div className="log-panel-controls">
            <div className="log-panel-menu-wrap" ref={menuWrapRef}>
              <button
                type="button"
                className="log-panel-btn"
                onClick={() => setFilterOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={filterOpen}
                title="过滤/显示设置"
              >
                过滤▾
              </button>
              {filterOpen && (
                <div className="log-panel-menu" role="menu">
                  <label className="log-panel-toggle">
                    <input
                      type="checkbox"
                      checked={showTimestamp}
                      onChange={(e) => setShowTimestamp(e.target.checked)}
                    />
                    时间戳
                  </label>
                  <div className="log-panel-levels">
                    {ALL_LEVELS.map((lv) => (
                      <label key={lv} className={`log-panel-level log-${lv}`}>
                        <input
                          type="checkbox"
                          checked={levelFilter[lv]}
                          onChange={(e) =>
                            setLevelFilter((s) => ({ ...s, [lv]: e.target.checked }))
                          }
                        />
                        {lv}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {onExport && (
              <button
                type="button"
                className="log-panel-btn"
                onClick={onExport}
                title="导出日志"
              >
                导出
              </button>
            )}
            {onClear && (
              <button
                type="button"
                className="log-panel-btn"
                onClick={onClear}
                title="清空日志"
              >
                清空
              </button>
            )}
            <button
              type="button"
              className="log-panel-btn log-panel-expand-btn"
              onClick={() => setLogExpanded(true)}
              title="展开日志面板"
            >
              ↗ 展开
            </button>
          </div>
        </div>

        <div ref={(el) => {
          // 同时设置内部 ref 和外部 ref
          (internalBodyRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          if (typeof bodyRef === 'function') bodyRef(el);
          else if (bodyRef) (bodyRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }} className="log-panel-body" tabIndex={-1}>
          {filtered.length === 0 ? (
            <div className="log-empty">{emptyText}</div>
          ) : (
            filtered.map(renderLogLine)
          )}
        </div>
        <div className="log-panel-statusbar">
          <span>{lines.length} 行</span>
          {nocturneOnline !== undefined && (
            <span className={`log-status-indicator ${nocturneOnline ? 'online' : 'offline'}`}>
              Nocturne: {nocturneOnline ? '✅' : '❌'}
            </span>
          )}
          {modelName && (
            <span className="log-model-name">{modelName}</span>
          )}
        </div>
      </div>

      {/* 展开模式 overlay */}
      {logExpanded && (
        <div
          className="log-panel-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            padding: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <span style={{ color: '#fff', fontSize: 16, fontWeight: 700 }}>
              Gateway 日志（展开模式）
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {/* 过滤 pills */}
              <div style={{ display: 'flex', gap: 6 }}>
                {filters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setLogFilter(f.key)}
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      border:
                        logFilter === f.key
                          ? '1px solid #60a5fa'
                          : '1px solid rgba(255,255,255,0.3)',
                      borderRadius: 6,
                      background: logFilter === f.key ? 'rgba(96,165,250,0.2)' : 'transparent',
                      color: logFilter === f.key ? '#93c5fd' : '#9ca3af',
                      cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {/* 缩放按钮 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setLogFontSize((s) => Math.max(9, s - 2))}
                  style={{
                    padding: '4px 8px',
                    fontSize: 12,
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: 6,
                    background: 'transparent',
                    color: '#9ca3af',
                    cursor: 'pointer',
                  }}
                >
                  A-
                </button>
                <span style={{ color: '#9ca3af', fontSize: 12, minWidth: 36, textAlign: 'center' }}>
                  {logFontSize}px
                </span>
                <button
                  type="button"
                  onClick={() => setLogFontSize((s) => Math.min(24, s + 2))}
                  style={{
                    padding: '4px 8px',
                    fontSize: 12,
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: 6,
                    background: 'transparent',
                    color: '#9ca3af',
                    cursor: 'pointer',
                  }}
                >
                  A+
                </button>
              </div>
              <button
                type="button"
                onClick={() => setLogExpanded(false)}
                style={{
                  padding: '6px 14px',
                  fontSize: 13,
                  border: '1px solid rgba(255,255,255,0.4)',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                收回 ↙
              </button>
            </div>
          </div>

          <div
            ref={internalBodyRef}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              fontFamily: 'var(--font-mono), monospace',
              fontSize: logFontSize,
              lineHeight: 1.6,
              color: '#e0e0e0',
              padding: 12,
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.3)',
            }}
          >
            {filtered.length === 0 ? (
              <div style={{ color: '#888' }}>{emptyText}</div>
            ) : (
              filtered.map(renderLogLine)
            )}
          </div>

          <div
            style={{
              color: '#888',
              fontSize: 12,
              marginTop: 8,
              display: 'flex',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <span>{lines.length} 行</span>
            {nocturneOnline !== undefined && (
              <span style={{ color: nocturneOnline ? '#86efac' : '#fca5a5' }}>
                Nocturne: {nocturneOnline ? '✅' : '❌'}
              </span>
            )}
            {modelName && (
              <span style={{ color: '#93c5fd' }}>{modelName}</span>
            )}
            <span style={{ marginLeft: 'auto' }}>按 ESC 收回</span>
          </div>
        </div>
      )}
    </>
  );
}
