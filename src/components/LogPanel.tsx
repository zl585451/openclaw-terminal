import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/LogPanel.css';

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'OK';

// 6种语义分类（面向用户）
type LogCategory = 'AI' | 'Tool' | 'Memory' | 'System' | 'Warn' | 'Error';

const CATEGORY_STYLE: Record<LogCategory, { dot: string; bg: string; text: string; label: string }> = {
  AI:     { dot: '#7c6fcd', bg: '#26215C', text: '#c4b5fd', label: 'AI思考' },
  Tool:   { dot: '#34a87e', bg: '#04342C', text: '#6ee7b7', label: '工具' },
  Memory: { dot: '#4a90d9', bg: '#0c2a4a', text: '#7ec8f5', label: '记忆' },
  System: { dot: '#6b6b66', bg: '#2a2a28', text: '#9a9a94', label: '系统' },
  Warn:   { dot: '#d4900a', bg: '#3a2800', text: '#f5c842', label: '警告' },
  Error:  { dot: '#e05252', bg: '#3a1212', text: '#fca5a5', label: '错误' },
};

export type LogEntry = {
  id: number;
  raw: string;
  tag: string;
  time: string;
  level: LogLevel;
  message: string;
  category: LogCategory;
  brief: string;
  detail: string;
};

const ALL_LEVELS: LogLevel[] = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'OK'];

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

function categorize(entry: { level: LogLevel; tag: string; raw: string }): LogCategory {
  if (entry.level === 'ERROR') return 'Error';
  if (entry.level === 'WARN') return 'Warn';
  const tag = entry.tag.toLowerCase();
  if (['ai'].includes(tag)) return 'AI';
  if (['tool', 'tools'].includes(tag)) return 'Tool';
  if (['memory', 'memhistory', 'feedback', 'extractmem', 'mem',
       'memory_history', 'memory_feedback', 'memory_search', 'clarification'].includes(tag)) return 'Memory';
  if (['gateway', 'system', 'session', 'config', 'ai_library'].includes(tag)) return 'System';
  // 关键词兜底
  if (/tool_call|web_search|exec_command|read_file|write_file/i.test(entry.raw)) return 'Tool';
  if (/memory|nocturne|history|feedback/i.test(entry.raw)) return 'Memory';
  if (/gateway|connect|heartbeat|心跳/i.test(entry.raw)) return 'System';
  if (/ai\s|model|stream|request|response/i.test(entry.raw)) return 'AI';
  return 'System';
}

function humanize(entry: LogEntry): { brief: string; detail: string } {
  const raw = entry.raw;
  const msg = entry.message;

  // AI 分类
  if (entry.category === 'AI') {
    if (/request start/i.test(raw)) {
      const modelM = raw.match(/"model":"([^"]+)"/);
      const msgM = raw.match(/"messages":(\d+)/);
      const model = modelM?.[1] ?? '';
      const msgs = msgM?.[1] ?? '';
      return { brief: 'AMY 开始思考', detail: `模型 ${model}${msgs ? ` · 上下文 ${msgs} 条消息` : ''}` };
    }
    if (/stream done|request done/i.test(raw)) {
      const lenM = raw.match(/"(?:outputLen|len)":(\d+)/);
      const tokM = raw.match(/"total_tokens":(\d+)/);
      const len = lenM?.[1];
      const tok = tokM?.[1];
      return { brief: `AMY 回复完成${len ? `（${len}字）` : ''}`, detail: tok ? `消耗 ${tok} tokens` : '' };
    }
    if (/tool_calls/i.test(raw)) {
      const cntM = raw.match(/"count":(\d+)/);
      return { brief: `调用工具 ×${cntM?.[1] ?? 1}`, detail: '' };
    }
    if (/tool call/i.test(raw)) {
      const nameM = raw.match(/"name":"([^"]+)"/);
      const queryM = raw.match(/"query":"([^"]+)"/);
      const name = nameM?.[1] ?? '';
      const query = queryM?.[1] ?? '';
      if (name === 'web_search') return { brief: `搜索网页 · "${query}"`, detail: '' };
      return { brief: `调用 ${name}`, detail: query };
    }
    if (/System prompt loaded/i.test(raw)) return { brief: '系统提示词加载完成', detail: '' };
    if (/bootMemory loaded/i.test(raw)) return { brief: 'AMY 启动记忆已就绪', detail: '' };
  }

  // Tool 分类
  if (entry.category === 'Tool') {
    if (/Brave search failed|falling back to DuckDuckGo/i.test(raw))
      return { brief: 'Brave 不可用，切换 DuckDuckGo', detail: 'error: fetch failed（可能需要代理）' };
    if (/web_search/i.test(raw)) {
      const queryM = raw.match(/"query":"([^"]+)"/);
      return { brief: `网页搜索 · "${queryM?.[1] ?? ''}"`, detail: '' };
    }
    if (/BRAVE_SEARCH_API_KEY 未配置/i.test(raw)) return { brief: 'Brave API Key 未配置', detail: '请在设置面板填入' };
    if (/TAVILY_API_KEY 未配置/i.test(raw)) return { brief: 'Tavily API Key 未配置', detail: '请在设置面板填入' };
  }

  // Memory 分类
  if (entry.category === 'Memory') {
    if (/boot read/i.test(raw)) {
      const uriM = raw.match(/"uri":"([^"]+)"/);
      return { brief: '启动记忆加载', detail: uriM?.[1] ?? '' };
    }
    if (/read not found|404/i.test(raw)) {
      const uriM = raw.match(/"uri":"([^"]+)"/);
      return { brief: '记忆路径不存在（自动修复中）', detail: uriM?.[1] ?? '' };
    }
    if (/create ok/i.test(raw)) {
      const uriM = raw.match(/"uri":"([^"]+)"/);
      return { brief: '记忆写入成功', detail: uriM?.[1] ?? '' };
    }
    if (/history summary written/i.test(raw)) {
      const uriM = raw.match(/"uri":"([^"]+)"/);
      return { brief: '对话历史写入成功', detail: uriM?.[1] ?? '' };
    }
    if (/memory write ok/i.test(raw)) {
      const uriM = raw.match(/"uri":"([^"]+)"/);
      return { brief: '记忆更新成功', detail: uriM?.[1] ?? '' };
    }
    if (/memory extracted/i.test(raw)) return { brief: '记忆提取写入完成', detail: '' };
    if (/read ok/i.test(raw)) {
      // 收起模式不显示普通 read ok，这里只返回 detail
      const uriM = raw.match(/"uri":"([^"]+)"/);
      return { brief: '读取记忆', detail: uriM?.[1] ?? '' };
    }
    if (/ensurePathExists.*created/i.test(raw)) {
      const uriM = raw.match(/"uri":"([^"]+)"/);
      return { brief: '记忆路径已创建', detail: uriM?.[1] ?? '' };
    }
    if (/MEMORY\.md synced/i.test(raw)) return { brief: '记忆协议文件已同步', detail: '' };
    if (/glossary warmed/i.test(raw)) return { brief: '记忆索引预热完成', detail: '' };
  }

  // System 分类
  if (entry.category === 'System') {
    if (/WebSocket listening|listening/i.test(raw)) return { brief: 'Gateway 已启动，监听 18789', detail: 'ws://0.0.0.0:18789' };
    if (/client connected/i.test(raw)) return { brief: '客户端已连接', detail: '' };
    if (/client authenticated/i.test(raw)) return { brief: '认证成功', detail: '' };
    if (/Nocturne 心跳正常|heartbeat/i.test(raw)) return { brief: '系统心跳正常', detail: '' };
    if (/RSS=/i.test(raw)) {
      const rssM = raw.match(/rssMb":([\d.]+)/);
      return { brief: `内存正常 · RSS ${rssM?.[1] ?? '?'}MB`, detail: '' };
    }
    if (/AI\.library 检索失败/i.test(raw)) return { brief: 'AI知识库未启动（不影响对话）', detail: '' };
    if (/Core memory health ok/i.test(raw)) return { brief: '核心记忆健康检查通过', detail: '' };
    if (/loaded sessions/i.test(raw)) {
      const cntM = raw.match(/"count":(\d+)/);
      return { brief: `历史会话加载完成（${cntM?.[1] ?? 0}条）`, detail: '' };
    }
    if (/Mobile HTTP/i.test(raw)) return { brief: '', detail: '' }; // 静默
  }

  // Warn 分类
  if (entry.category === 'Warn') {
    if (/allowlist contains unknown/i.test(raw)) return { brief: '工具配置含未知项（不影响使用）', detail: msg };
    return { brief: msg.slice(0, 60), detail: '' };
  }

  // Error 分类
  if (entry.category === 'Error') {
    return { brief: msg.slice(0, 80), detail: raw.slice(0, 120) };
  }

  return { brief: msg.slice(0, 60), detail: '' };
}

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
    const tag = module;
    return enrich({
      id,
      raw,
      tag,
      time: time || '',
      level: parseLevel(`[${levelStr}]`),
      message: formatMessage(message || ''),
    });
  }
  const match = line.match(/^\[(\w+)\]\s*\[([^\]]+)\]\s*\[(\w+)\]\s*(.*)/s);
  if (match) {
    const [, tag, time, levelStr, message] = match;
    return enrich({
      id,
      raw,
      tag: tag || '',
      time: time || '',
      level: parseLevel(`[${levelStr}]`),
      message: formatMessage(message || ''),
    });
  }
  const match2 = line.match(/^\[(\w+)\]\s*(.*)/s);
  if (match2) {
    const [, tag, message] = match2;
    return enrich({
      id,
      raw,
      tag: tag || '',
      time: '',
      level: isErr ? 'ERROR' : 'INFO',
      message: formatMessage(message || ''),
    });
  }
  return enrich({
    id,
    raw,
    tag: isErr ? 'ERROR' : '',
    time: '',
    level: parseLevel(raw),
    message: formatMessage(raw),
  });
}

function enrich(base: Omit<LogEntry, 'category' | 'brief' | 'detail'>): LogEntry {
  const category = categorize(base);
  const { brief, detail } = humanize({ ...base, category, brief: '', detail: '' });
  return { ...base, category, brief, detail };
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
    if (filter === 'error') return e.category === 'Error' || e.category === 'Warn';
    if (filter === 'memory') return e.category === 'Memory';
    if (filter === 'eval') return ['SelfEval', 'Hypothesis'].includes(e.tag);
    if (filter === 'gateway') return e.category === 'System' || e.category === 'AI';
    if (filter === 'tools') return e.category === 'Tool';
    return true;
  });
}

export default function LogPanel(props: {
  title?: string;
  lines: string[];
  bodyRef?: React.RefObject<HTMLDivElement | null>;
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

  // 收起模式：哪些行应该静默（不显示）
  function shouldHideInCompact(e: LogEntry): boolean {
    if (e.category === 'Memory' && e.brief === '读取记忆') return true;
    if (e.category === 'Memory' && /ensurePathExists.*path exists/i.test(e.raw)) return true;
    if (e.category === 'Memory' && /parent already confirmed/i.test(e.raw)) return true;
    if (e.category === 'System' && e.brief === '') return true;
    if (/sourceMimeType.*image/i.test(e.raw)) return true; // 图片压缩日志
    if (/saveHistorySummary called/i.test(e.raw)) return true;
    if (/write history summary.*type/i.test(e.raw)) return true;
    return false;
  }

  const renderCompactLine = (e: LogEntry) => {
    if (shouldHideInCompact(e)) return null;
    if (!e.brief) return null;
    const cat = CATEGORY_STYLE[e.category];
    return (
      <div key={e.id} className="log-line-compact">
        <span className="log-dot" style={{ background: cat.dot }} />
        <span className="log-brief">{e.brief}</span>
      </div>
    );
  };

  const renderLogLine = (e: LogEntry) => {
    const cat = CATEGORY_STYLE[e.category];
    return (
      <div key={e.id} className="log-line-expanded">
        <span
          className="log-tag-badge"
          style={{ background: cat.bg, color: cat.text }}
        >
          {cat.label}
        </span>
        <div className="log-line-content">
          <span className="log-brief-text">{e.brief || e.message}</span>
          {e.detail && <span className="log-detail-text">{e.detail}</span>}
        </div>
        {e.time && (
          <span className="log-ts-right">{e.time.split(' ')[1] || e.time}</span>
        )}
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

        {/* 收起模式的日志区域 */}
        <div ref={(el) => {
          (internalBodyRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
          if (bodyRef) (bodyRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }} className="log-panel-body" tabIndex={-1}>
          {filtered.length === 0 ? (
            <div className="log-empty">{emptyText}</div>
          ) : (
            filtered.map(renderCompactLine).filter(Boolean)
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

          {/* 展开模式的日志区域（logFontSize 通过父级 font-size 生效，子元素用 em 继承） */}
          <div
            ref={internalBodyRef}
            className="log-expanded-scroll"
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
