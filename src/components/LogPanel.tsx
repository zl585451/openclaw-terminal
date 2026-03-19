import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/LogPanel.css';

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';

export type LogEntry = {
  raw: string;
  ts?: string;
  level: LogLevel;
  module?: string;
  message: string;
};

const ALL_LEVELS: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG'];

function parseLevel(raw: string): LogLevel {
  const upper = raw.toUpperCase();
  if (upper.includes('[ERROR]')) return 'ERROR';
  if (upper.includes('[WARN]') || upper.includes('[WARNING]')) return 'WARN';
  if (upper.includes('[DEBUG]')) return 'DEBUG';
  if (upper.includes('[INFO]')) return 'INFO';
  if (/error|failed|exception|stack/i.test(raw)) return 'ERROR';
  if (/warn|invalid|missing/i.test(raw)) return 'WARN';
  if (/debug|trace/i.test(raw)) return 'DEBUG';
  return 'INFO';
}

function parseLogLine(raw: string): LogEntry {
  // 目标格式: [时间戳] [级别] [模块] 消息
  const m = raw.match(/^\[([^\]]+)\]\s+\[([A-Z]+)\]\s+\[([^\]]+)\]\s*(.*)$/i);
  if (m) {
    const [, ts, lv, mod, msg] = m;
    return { raw, ts, level: parseLevel(`[${lv}]`), module: mod, message: msg || '' };
  }
  return { raw, level: parseLevel(raw), message: raw };
}

export default function LogPanel(props: {
  title?: string;
  lines: string[];
  bodyRef?: React.RefObject<HTMLDivElement>;
  onClear?: () => void;
  onExport?: () => void;
  emptyText?: string;
}) {
  const { title = 'Gateway 日志', lines, bodyRef, onClear, onExport, emptyText = '[LOG] 等待日志...' } = props;
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const [levelFilter, setLevelFilter] = useState<Record<LogLevel, boolean>>({
    ERROR: true,
    WARN: true,
    INFO: true,
    DEBUG: true,
  });
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);

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

  const parsed = useMemo(() => lines.map(parseLogLine), [lines]);
  const filtered = useMemo(
    () => parsed.filter(e => levelFilter[e.level]),
    [parsed, levelFilter]
  );

  return (
    <div className="log-panel">
      <div className="log-panel-header">
        <span className="log-panel-title">{title}</span>
        <div className="log-panel-controls">
          <div className="log-panel-menu-wrap" ref={menuWrapRef}>
            <button
              type="button"
              className="log-panel-btn"
              onClick={() => setFilterOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={filterOpen}
              title="过滤/显示设置"
            >
              过滤
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
                        onChange={(e) => setLevelFilter((s) => ({ ...s, [lv]: e.target.checked }))}
                      />
                      {lv}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          {onExport && (
            <button type="button" className="log-panel-btn" onClick={onExport} title="导出日志">
              导出
            </button>
          )}
          {onClear && (
            <button type="button" className="log-panel-btn" onClick={onClear} title="清空日志">
              清空
            </button>
          )}
        </div>
      </div>

      <div ref={bodyRef} className="log-panel-body" tabIndex={-1}>
        {filtered.length === 0 ? (
          <div className="log-empty">{emptyText}</div>
        ) : (
          filtered.map((e, i) => (
            <div key={i} className={`log-line log-${e.level}`}>
              {showTimestamp && e.ts ? <span className="log-ts">[{e.ts}]</span> : null}
              <span className="log-lv">[{e.level}]</span>
              {e.module ? <span className="log-mod">[{e.module}]</span> : null}
              <span className="log-msg">{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

