import { useState, useEffect, useRef, useCallback, memo } from 'react';
import type { ToolEventItem, TurnSegmentLite } from './chatTypes';
import { buildToolGroupSummary } from './messageListHelpers';

// 归档结果的人类查询通道——与 recall_tool_result（模型自助回读用的 function-call 工具）
// 分开命名/分开路径，这里是给人看的「查看完整结果」按钮用的。
const TOOL_RESULT_QUERY_BASE = 'http://127.0.0.1:18790/internal/tool-result';

function formatArchivedValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

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
  const [fullResult, setFullResult] = useState<string | null>(null);
  const [fullResultError, setFullResultError] = useState<string | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const state = event?.state ?? 'executing';
  const name = getToolDisplayName(toolName || event?.tool || 'tool');
  const elapsed = event?.elapsedMs != null ? `${(event.elapsedMs / 1000).toFixed(1)}s` : '';
  // canvas 工具实时预览阶段：还在生成中，且已经抠出过字符数——用"正在写入...已生成
  // X字"替代干等的纯 spinner，这是用户能看到的"AI 正在做什么"实时信号。
  const isStreamingCanvas = state === 'executing' && event?.streamChars != null;
  // 入参从未被截断——payload.args 本来就整份在内存里，展开就是全量，不用发请求。
  const fullArgsText = event?.args && Object.keys(event.args).length > 0
    ? JSON.stringify(event.args, null, 2)
    : '';
  const hasDetail = !!fullArgsText || !!event?.resultPreview || !!event?.error;
  // 结果侧只有 resultPreview（可能已截断），全量需要向归档查询通道按 callId 现取。
  const canFetchFull = state !== 'executing' && !event?.error && !!event?.callId;

  const handleFetchFull = useCallback(async () => {
    if (!event?.callId || loadingFull) return;
    setLoadingFull(true);
    setFullResultError(null);
    try {
      const response = await fetch(`${TOOL_RESULT_QUERY_BASE}/${encodeURIComponent(event.callId)}`);
      const data = await response.json();
      if (!data?.ok || !data?.record) {
        setFullResultError(data?.error === 'not_found' ? '未找到归档记录（可能已超出归档窗口）' : String(data?.error || `HTTP ${response.status}`));
        return;
      }
      setFullResult(formatArchivedValue(data.record.result));
    } catch (error) {
      setFullResultError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingFull(false);
    }
  }, [event?.callId, loadingFull]);

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
        {isStreamingCanvas ? (
          <span className="inline-tool__name">
            正在写入「{event?.streamTitle || name}」
            <span className="inline-tool__stream-count">已生成 {event!.streamChars} 字</span>
          </span>
        ) : (
          <span className="inline-tool__name">{name}</span>
        )}
        {event?.agentSource && (
          <span
            className={`inline-tool__agent ${event.agentSource === 'AMY' ? 'inline-tool__agent--self' : ''}`}
            title={`执行方：${event.agentSource}`}
          >
            {event.agentSource}
          </span>
        )}
        {elapsed && <span className="inline-tool__time">{elapsed}</span>}
        {hasDetail && <span className="inline-tool__chevron">{open ? '▴' : '▾'}</span>}
      </button>
      {open && hasDetail && (
        <div className="inline-tool__body">
          {fullArgsText && <pre className="inline-tool__args">{fullArgsText}</pre>}
          {event?.error && <div className="inline-tool__error">{event.error}</div>}
          {event?.resultPreview && !event?.error && (
            <div className="inline-tool__result">{event.resultPreview}</div>
          )}
          {fullResult != null && <pre className="inline-tool__result inline-tool__result--full">{fullResult}</pre>}
          {fullResultError && <div className="inline-tool__error">{fullResultError}</div>}
          {canFetchFull && fullResult == null && (
            <button
              type="button"
              className="inline-tool__more-btn"
              onClick={handleFetchFull}
              disabled={loadingFull}
            >
              {loadingFull ? '加载中…' : '查看完整结果'}
            </button>
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
