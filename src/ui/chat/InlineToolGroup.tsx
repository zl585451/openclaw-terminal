import { useState, useEffect, useRef, memo } from 'react';
import type { ToolEventItem, TurnSegmentLite } from './chatTypes';
import { buildToolGroupSummary } from './messageListHelpers';

/** B3 inline：正文流中的工具卡片（默认折叠一行，可展开看入参/结果），对齐 Claude Code 结构 */
export const InlineToolCard = memo(function InlineToolCard({
  event,
  toolName,
  getToolDisplayName,
}: {
  event?: ToolEventItem;
  toolName: string;
  getToolDisplayName: (tool: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const state = event?.state ?? 'executing';
  const name = getToolDisplayName(toolName || event?.tool || 'tool');
  const elapsed = event?.elapsedMs != null ? `${(event.elapsedMs / 1000).toFixed(1)}s` : '';
  const argsPreview = event?.args
    ? Object.entries(event.args)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.slice(0, 80) : JSON.stringify(v).slice(0, 80)}`)
        .join(', ')
        .slice(0, 200)
    : '';
  const hasDetail = !!argsPreview || !!event?.resultPreview || !!event?.error;
  return (
    <div className={`inline-tool inline-tool--${state}`}>
      <button
        type="button"
        className="inline-tool__head"
        onClick={() => hasDetail && setOpen((o) => !o)}
        disabled={!hasDetail}
      >
        <span className="inline-tool__status" aria-hidden>
          {state === 'executing'
            ? <span className="inline-tool__spinner" />
            : state === 'error' ? '✗' : '✓'}
        </span>
        <span className="inline-tool__name">{name}</span>
        {elapsed && <span className="inline-tool__time">{elapsed}</span>}
        {hasDetail && <span className="inline-tool__chevron">{open ? '▴' : '▾'}</span>}
      </button>
      {open && hasDetail && (
        <div className="inline-tool__body">
          {argsPreview && <div className="inline-tool__args">{argsPreview}</div>}
          {event?.error && <div className="inline-tool__error">{event.error}</div>}
          {event?.resultPreview && !event?.error && (
            <div className="inline-tool__result">{event.resultPreview}</div>
          )}
        </div>
      )}
    </div>
  );
});

/** B3 工具组：连续工具调用收进一个可折叠组，对齐 Claude Code 的「摘要 + 子项」结构。 */
export const ToolGroup = memo(function ToolGroup({
  segs,
  toolEvents,
  getToolDisplayName,
}: {
  segs: TurnSegmentLite[];
  toolEvents?: ToolEventItem[];
  getToolDisplayName: (tool: string) => string;
}) {
  const events = segs.map((s) => toolEvents?.find((t) => t.callId === s.meta?.callId));
  const running = events.some((e) => !e || e.state === 'executing');
  const hasError = events.some((e) => e?.state === 'error');

  const [open, setOpen] = useState(running);
  const userTouched = useRef(false);
  useEffect(() => {
    if (!userTouched.current) setOpen(running);
  }, [running]);

  const summary = buildToolGroupSummary(segs, getToolDisplayName);

  return (
    <div className={`tool-group ${running ? 'tool-group--running' : 'tool-group--done'} ${hasError ? 'tool-group--error' : ''}`}>
      <button
        type="button"
        className="tool-group__head"
        onClick={() => { userTouched.current = true; setOpen((o) => !o); }}
      >
        <span className="tool-group__status" aria-hidden>
          {running ? <span className="tool-group__spinner" /> : hasError ? '✗' : '✓'}
        </span>
        <span className="tool-group__summary">{summary}</span>
        <span className="tool-group__chevron">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="tool-group__body">
          {segs.map((seg) => {
            const ev = toolEvents?.find((t) => t.callId === seg.meta?.callId);
            return (
              <InlineToolCard
                key={seg.segId}
                event={ev}
                toolName={seg.meta?.tool || ev?.tool || ''}
                getToolDisplayName={getToolDisplayName}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});
