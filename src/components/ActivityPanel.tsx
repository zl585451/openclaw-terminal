import React, { memo, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ActivityEntry } from '../hooks/useMessages';
import '../styles/ActivityPanel.css';

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];

interface ActivityPanelProps {
  timeline: ActivityEntry[];
  isStreaming: boolean;
  getToolDisplayName?: (tool: string) => string;
}

const ActivityPanel: React.FC<ActivityPanelProps> = memo(function ActivityPanel({
  timeline,
  isStreaming,
  getToolDisplayName = (tool: string) => tool,
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finalElapsed, setFinalElapsed] = useState(0);
  const prevStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (!isStreaming) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [isStreaming]);

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setFinalElapsed(elapsed);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, elapsed]);

  useEffect(() => {
    if (isStreaming && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [timeline, isStreaming, expanded]);

  const toolCallCount = timeline.filter((entry) => entry.type === 'tool_call').length;
  const hasContent = timeline.some((entry) =>
    entry.type === 'cot' || entry.type === 'tool_call' || entry.type === 'tool_result'
  );
  const isEmpty = !isStreaming && !hasContent;
  if (isEmpty) return null;

  const displayElapsed = isStreaming ? elapsed : (finalElapsed || elapsed);
  let label = '';
  if (isStreaming) {
    const lastHint = [...timeline].reverse().find((entry) => entry.type === 'keepalive_hint');
    if (lastHint?.hint) {
      label = `${lastHint.hint} · ${displayElapsed}s`;
    } else {
      label = `思考中 · ${displayElapsed}s`;
    }
  } else {
    const parts = [`${displayElapsed}s`];
    if (toolCallCount > 0) parts.push(`${toolCallCount} 次工具调用`);
    label = `已深度思考（${parts.join(' · ')}）`;
  }

  return (
    <div className={`activity-panel ${expanded ? 'activity-panel--expanded' : ''} ${isStreaming ? 'activity-panel--streaming' : 'activity-panel--done'}`}>
      <div className="activity-panel__accent-bar" />
      <div className="activity-panel__content">
        <div
          className="activity-panel__header"
          onClick={() => setExpanded((value) => !value)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setExpanded((value) => !value);
            }
          }}
        >
          <span className="activity-panel__icon">
            {isStreaming
              ? <span className="activity-panel__spinner"><span /><span /><span /></span>
              : '💭'}
          </span>
          <span className="activity-panel__label">{label}</span>
          <span className={`activity-panel__chevron ${expanded ? 'activity-panel__chevron--up' : ''}`}>
            {expanded ? '▴' : '▾'}
          </span>
        </div>

        <div className={`activity-panel__body-wrapper ${expanded ? 'activity-panel__body--open' : 'activity-panel__body--closed'}`}>
          <div className="activity-panel__body" ref={bodyRef}>
            {timeline.map((entry) => {
              if (entry.type === 'thinking_placeholder' || entry.type === 'keepalive_hint') {
                return (
                  <div key={entry.id} className="activity-entry activity-entry--hint">
                    <span className="activity-entry__hint-text">{entry.hint}</span>
                  </div>
                );
              }

              if (entry.type === 'cot') {
                return (
                  <div key={entry.id} className="activity-entry activity-entry--cot">
                    <ReactMarkdown
                      remarkPlugins={REMARK_PLUGINS}
                      rehypePlugins={REHYPE_PLUGINS}
                    >
                      {entry.content || ''}
                    </ReactMarkdown>
                  </div>
                );
              }

              if (entry.type === 'tool_call') {
                return (
                  <div key={entry.id} className="activity-entry activity-entry--tool-call">
                    <div className="activity-tool__header">
                      <span className="activity-tool__icon">🔧</span>
                      <span className="activity-tool__name">{getToolDisplayName(entry.toolName || '')}</span>
                    </div>
                    {entry.argsPreview && (
                      <div className="activity-tool__args">{entry.argsPreview}</div>
                    )}
                  </div>
                );
              }

              if (entry.type === 'tool_result') {
                return (
                  <div
                    key={entry.id}
                    className={`activity-entry activity-entry--tool-result ${entry.isError ? 'activity-entry--tool-error' : ''}`}
                  >
                    <span className="activity-tool__result-icon">{entry.isError ? '❌' : '✓'}</span>
                    <span className="activity-tool__result-text">
                      {entry.isError
                        ? `${getToolDisplayName(entry.toolName || '')} 失败`
                        : entry.elapsedMs
                          ? `${(entry.elapsedMs / 1000).toFixed(1)}s`
                          : '完成'}
                    </span>
                    {entry.resultPreview && !entry.isError && (
                      <span className="activity-tool__result-preview">{entry.resultPreview}</span>
                    )}
                  </div>
                );
              }

              return null;
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

ActivityPanel.displayName = 'ActivityPanel';
export default ActivityPanel;
