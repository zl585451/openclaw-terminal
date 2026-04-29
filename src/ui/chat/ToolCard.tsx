/**
 * src/ui/chat/ToolCard.tsx
 * 工具调用内联卡片 — 显示在 AMY 消息气泡内部，跟随流式文本一起出现
 */

import React, { useState } from 'react';
import type { ToolEventItem } from './chatTypes';

const TOOL_ICONS: Record<string, string> = {
  web_search: '🔍',
  web_fetch: '🌐',
  read_file: '📄',
  write_file: '💾',
  exec_command: '⚡',
  run_bash: '⚡',
  image_gen: '🎨',
  image_generate: '🎨',
  search_knowledge: '🧠',
  canvas_update: '🖼️',
  str_replace_editor: '🔧',
  list_files: '📂',
  create_folder: '📁',
  move_file: '🔄',
  search_files: '🔍',
};

const TOOL_NAMES: Record<string, string> = {
  web_search: '网络搜索',
  web_fetch: '网页读取',
  read_file: '读取文件',
  write_file: '写入文件',
  exec_command: '执行命令',
  run_bash: '执行命令',
  image_gen: '生成图片',
  image_generate: '生成图片',
  search_knowledge: '知识检索',
  canvas_update: '画布更新',
  str_replace_editor: '编辑文件',
  list_files: '列出文件',
  create_folder: '创建文件夹',
  move_file: '移动文件',
  search_files: '搜索文件',
};

interface ToolCardProps {
  event: ToolEventItem;
}

const ToolCard: React.FC<ToolCardProps> = ({ event }) => {
  const [expanded, setExpanded] = useState(false);
  const icon = TOOL_ICONS[event.tool] || '🔧';
  const displayName = TOOL_NAMES[event.tool] || event.tool;
  const isExecuting = event.state === 'executing';
  const isDone = event.state === 'done';
  const isError = event.state === 'error';

  const elapsedStr = event.elapsedMs != null
    ? event.elapsedMs < 1000
      ? `${event.elapsedMs}ms`
      : `${(event.elapsedMs / 1000).toFixed(1)}s`
    : null;

  const argsPreview = event.args
    ? Object.values(event.args)[0]?.toString().slice(0, 40) || ''
    : '';

  const resultCount = (() => {
    if (!event.resultPreview) return null;
    try {
      const parsed = JSON.parse(event.resultPreview);
      if (parsed?.results?.length) return `${parsed.results.length} 条结果`;
      return null;
    } catch {
      return null;
    }
  })();

  return (
    <div
      style={{
        margin: '6px 0',
        borderRadius: 6,
        border: `1px solid ${isError ? 'var(--status-error, #e05252)' : 'var(--border-subtle)'}`,
        background: isError
          ? 'rgba(220,50,50,0.06)'
          : 'var(--bg-surface, rgba(255,255,255,0.04))',
        overflow: 'hidden',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        opacity: isExecuting ? 0.85 : 1,
        transition: 'opacity 0.2s, border-color 0.2s',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '5px 10px',
          cursor: event.resultPreview ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onClick={() => event.resultPreview && setExpanded((v) => !v)}
      >
        <span style={{ fontSize: 12, flexShrink: 0, lineHeight: 1 }}>
          {isExecuting ? icon : isDone ? '✅' : '❌'}
        </span>

        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>
          {displayName}
        </span>

        {argsPreview && (
          <span
            style={{
              color: 'var(--text-tertiary)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              opacity: 0.7,
            }}
          >
            &quot;{argsPreview}&quot;
          </span>
        )}

        <span style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginLeft: 'auto' }}>
          {isExecuting && (
            <span style={{ color: 'var(--accent-primary)', opacity: 0.8 }}>
              执行中…
            </span>
          )}
          {isDone && (
            <span>
              {[resultCount, elapsedStr].filter(Boolean).join(' · ')}
              {event.resultPreview && (
                <span style={{ marginLeft: 6, color: 'var(--accent-primary)' }}>
                  {expanded ? '收起 ∧' : '展开 ∨'}
                </span>
              )}
            </span>
          )}
          {isError && (
            <span style={{ color: 'var(--status-error, #e05252)' }}>失败</span>
          )}
        </span>
      </div>

      {isError && event.error && (
        <div style={{
          padding: '2px 10px 6px',
          color: 'var(--status-error, #e05252)',
          opacity: 0.8,
        }}>
          {event.error}
        </div>
      )}

      {expanded && event.resultPreview && (
        <div style={{
          padding: '6px 10px 8px',
          color: 'var(--text-tertiary)',
          maxHeight: 160,
          overflowY: 'auto',
          borderTop: '1px solid var(--border-subtle)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {(() => {
            try {
              const parsed = JSON.parse(event.resultPreview);
              if (parsed?.results) {
                return (parsed.results as Array<{ title?: string; snippet?: string }>)
                  .slice(0, 3)
                  .map((r, i) => (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {i + 1}. {r.title}
                      </div>
                      <div style={{ opacity: 0.7 }}>{r.snippet?.slice(0, 80)}…</div>
                    </div>
                  ));
              }
              return JSON.stringify(parsed, null, 2).slice(0, 300);
            } catch {
              return event.resultPreview.slice(0, 300);
            }
          })()}
        </div>
      )}
    </div>
  );
};

export default ToolCard;
