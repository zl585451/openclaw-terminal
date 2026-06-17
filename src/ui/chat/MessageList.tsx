import React, { useState, useEffect, useRef, useCallback, memo, useMemo, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { parseOptionBox, type OptionItem, type RenderSegment } from '../../utils/optionBoxParser';
import { hasAssistantCotMarkers, getAssistantVisibleMain } from '../../utils/cotExtract';
// removed imports
import OptionBox from '../../components/OptionBox';
import TaskList from '../../components/TaskList';
import QuestionCards from '../../components/QuestionCards';
import CoTBlock from '../../components/CoTBlock';
import ActivityPanel from '../../components/ActivityPanel';
import AmyAvatar from '../../components/AmyAvatar';
import { useSettings } from '../../contexts/SettingsContext';
import { getCachedPreprocessedMarkdown, stabilizeStreamingMarkdown } from '../../utils/markdownPreprocess';
import { formatTime, formatFullTime } from '../../utils/formatTime';
import type { ChatMessage, ToolEventItem, TurnSegmentLite } from './chatTypes';
import type { ActivityEntry } from '../../hooks/useMessages';
import type { TurnUiPhase, TurnUiState } from '../../core/turnUiState';
import StreamingMarkdownContent from './StreamingMarkdownContent';
import { useMsgParse } from '../../hooks/useMsgParse';
import { filterActivityEntriesForInlineTools } from './activityTimelineFilters';

// ── 时间格式化 ───────────────────────────────────────────────────────────

function buildFinalizedTimeline(
  msg: ChatMessage,
  cotContent: string | null | undefined,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  if (cotContent) {
    entries.push({
      id: `final_cot_${msg.id}`,
      type: 'cot',
      timestamp: Number(msg.timestamp || 0),
      content: cotContent,
    });
  }

  if (msg.toolEvents && msg.toolEvents.length > 0) {
    for (const event of msg.toolEvents) {
      entries.push({
        id: `final_tc_${event.callId}`,
        type: 'tool_call',
        timestamp: event.startedAt || Number(msg.timestamp || 0),
        toolName: event.tool,
        callId: event.callId,
        argsPreview: event.args
          ? Object.entries(event.args)
              .map(([key, value]) =>
                `${key}: ${typeof value === 'string' ? value.slice(0, 60) : JSON.stringify(value).slice(0, 60)}`
              )
              .join(', ')
              .slice(0, 120)
          : '',
      });
      entries.push({
        id: `final_tr_${event.callId}`,
        type: 'tool_result',
        timestamp: (event.startedAt || 0) + (event.elapsedMs || 0),
        toolName: event.tool,
        callId: event.callId,
        elapsedMs: event.elapsedMs,
        isError: event.state === 'error',
        resultPreview: event.resultPreview,
      });
    }
  }

  return entries;
}

function getTurnUiBadgeLabel(phase: TurnUiPhase): string | null {
  switch (phase) {
    case 'submitted':
    case 'thinking':
      return '思考中';
    case 'tool_running':
      return '调用工具中';
    case 'waiting_continuation':
    case 'finalizing':
      return '整理中';
    case 'answering':
      return '输出中';
    case 'awaiting_user':
      return '等你回复';
    case 'error':
      return '出错';
    case 'cancelled':
      return '已取消';
    default:
      return null;
  }
}

function isTurnUiActivityStreaming(phase: TurnUiPhase): boolean {
  return (
    phase === 'submitted' ||
    phase === 'thinking' ||
    phase === 'tool_running' ||
    phase === 'waiting_continuation' ||
    phase === 'answering' ||
    phase === 'finalizing'
  );
}

function isTurnUiThinking(phase: TurnUiPhase): boolean {
  return phase === 'submitted' || phase === 'thinking';
}

// ── 原子组件 ─────────────────────────────────────────────────────────────

function MsgCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (_) { /* intentional: 保护区内的保守兜底,不主动传播 */ }
  };
  return (
    <button type="button" className="msg-copy-btn" onClick={handleCopy} title={copied ? '已复制' : '复制'}>
      {copied ? '✓' : '⎘'}
    </button>
  );
}

/** 打字机光标：单独组件避免随内容重渲染导致闪烁 */
const TypewriterCursor = memo(function TypewriterCursor({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="cursor-blink">▋</span>;
});

/** B3 inline：正文流中的工具卡片（默认折叠一行，可展开看入参/结果），对齐 Claude Code 结构 */
const InlineToolCard = memo(function InlineToolCard({
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

/** B3 工具组：按组内工具类型计数，生成一行中文摘要标题。 */
function buildToolGroupSummary(
  segs: TurnSegmentLite[],
  getToolDisplayName: (tool: string) => string,
): string {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const s of segs) {
    const name = s.meta?.tool || 'tool';
    if (!counts.has(name)) order.push(name);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const phrase = (name: string, n: number): string => {
    switch (name) {
      case 'time_inject': return '确认时间';
      case 'exec_command': return `执行 ${n} 条命令`;
      case 'read_file': return `读取 ${n} 个文件`;
      case 'web_search': return `搜索 ${n} 次`;
      case 'parallel_web_research': return '并行调研';
      case 'web_fetch': return `抓取 ${n} 个页面`;
      default: return `${getToolDisplayName(name)} ${n} 次`;
    }
  };
  return order.map((name) => phrase(name, counts.get(name) || 1)).join(' · ');
}

/** B3 工具组：连续工具调用收进一个可折叠组，对齐 Claude Code 的「摘要 + 子项」结构。 */
const ToolGroup = memo(function ToolGroup({
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

const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkMath];
const MARKDOWN_REHYPE_PLUGINS = [rehypeKatex];
const CHAT_MERMAID_RENDER_LIMIT = 1;
const MAX_BOTTOM_SPACER_VIEWPORT_RATIO = 0.6;

function limitChatMermaidBlocks(text: string, maxBlocks = CHAT_MERMAID_RENDER_LIMIT): string {
  if (!text || typeof text !== 'string') return text;

  const matches = [...text.matchAll(/```mermaid\s*[\r\n]+[\s\S]*?```/gi)];
  if (matches.length <= maxBlocks) return text;

  let result = '';
  let lastIndex = 0;
  let kept = 0;
  let omitted = 0;

  for (const match of matches) {
    const index = match.index ?? 0;
    const block = match[0];
    result += text.slice(lastIndex, index);

    if (kept < maxBlocks) {
      result += block;
      kept += 1;
    } else {
      omitted += 1;
      if (omitted === 1) {
        result += '\n\n> 已省略额外 Mermaid 图，请在 Canvas 中查看完整图集。\n\n';
      }
    }

    lastIndex = index + block.length;
  }

  result += text.slice(lastIndex);
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

/** 流式结束后的正文：预处理 + ReactMarkdown，结果按 messageId+段键缓存 */
const FinalizedMarkdownContent = memo(
  function FinalizedMarkdownContent({
    messageId,
    segmentKey,
    content,
    markdownComponents,
    streaming = false,
  }: {
    messageId: number;
    segmentKey?: string;
    content: string;
    markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
    /** 与 segmentKey 解耦：流式时 segmentKey 需与结束后一致，用此标志跳过预处理 */
    streaming?: boolean;
  }) {
    const processedText = useMemo(
      () => {
        // 流式阶段跳过 preprocessMarkdown：
        // 1. 流式内容每帧都变，无法命中缓存，每帧都重算开销高
        // 2. 表格从 |---| 文本变成 <table> DOM 时结构突变，造成跳动
        // 流式阶段 remark-gfm 已能渲染大部分 markdown，不需要预处理
        // 但仍需转换 [echart]/[canvas] 标签，并临时闭合未完成代码围栏，避免半截 fence
        // 在 token 到达过程中反复改变 ReactMarkdown 的块级结构。
        if (streaming || segmentKey?.includes('stream')) {
          return stabilizeStreamingMarkdown(content || '');
        }
        return limitChatMermaidBlocks(
          getCachedPreprocessedMarkdown(messageId, segmentKey, content || '')
        );
      },
      [messageId, segmentKey, content, streaming]
    );
    return (
      <div className="msg-content markdown-body">
        <ReactMarkdown
          remarkPlugins={MARKDOWN_REMARK_PLUGINS}
          rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
          components={markdownComponents}
        >
          {processedText}
        </ReactMarkdown>
      </div>
    );
  },
  (prev, next) =>
    prev.messageId === next.messageId &&
    prev.segmentKey === next.segmentKey &&
    prev.content === next.content &&
    prev.streaming === next.streaming &&
    prev.markdownComponents === next.markdownComponents
);

const UI_CTRL_PATTERNS = [/\[上一页\]/, /\[下一页\]/, /\[第\d+\/\d+页\]/, /\[确认导入\]/, /\[取消\]/];

/** 剥离 [RENDER:xxx] 和 [pills]...[/pills] 块（后者已在托盘显示）；isLastAI 时额外清掉 ■ 开头的选项行 */
function stripRenderAndPillsMarkers(text: string, isLastAI?: boolean): string {
  if (!text || typeof text !== 'string') return text;
  let result = text
    .replace(/\[RENDER:[^\]]+\]/gi, '')
    .replace(/\[pills\][\s\S]*?\[\/pills\]/gi, '');
  if (isLastAI) {
    result = result
      .replace(/^[■●◆○◉▪▸]\s*.+$/gm, '')
      .replace(/\n{3,}/g, '\n\n');
  }
  return result.trim();
}

function filterExpectedEffect(text: string, isLastAI?: boolean): string {
  if (!text || typeof text !== 'string') return text;
  const stripped = stripRenderAndPillsMarkers(text, isLastAI);
  return stripped
    .split('\n')
    .filter((line) => {
      if (line.includes('预期效果')) return false;
      return !UI_CTRL_PATTERNS.some((p) => p.test(line.trim()));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SystemMessage = ({ text }: { text: string }) => {
  const [collapsed, setCollapsed] = React.useState(true);
  const lines = text.split('\n').filter((l) => l.trim());
  const preview = lines[0] || '';
  const isLong = lines.length > 3;

  return (
    <div style={{
      background: 'var(--bg-panel)',
      borderLeft: '3px solid var(--status-warning)',
      borderRadius: '4px',
      padding: '10px 14px',
      maxWidth: '70%',
      margin: '4px 0',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: collapsed && isLong ? 0 : '8px',
        cursor: isLong ? 'pointer' : 'default',
      }} onClick={() => isLong && setCollapsed(!collapsed)}>
        <span style={{ color: 'var(--status-warning)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', letterSpacing: '2px' }}>
          [ SYSTEM ]
        </span>
        {isLong && (
          <span style={{ color: 'var(--status-warning)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', opacity: 0.7 }}>
            {collapsed ? '展开' : '收起'}
          </span>
        )}
      </div>
      {collapsed && isLong ? (
        <div style={{ color: 'var(--text-primary)', fontSize: 'var(--text-code)', opacity: 0.8 }}>
          {preview}
          <span style={{ color: 'var(--status-warning)', opacity: 0.5 }}> ···</span>
        </div>
      ) : (
        <div>
          {lines.map((line, i) => (
            <div key={i} style={{
              color: 'var(--text-primary)', fontSize: 'var(--text-code)',
              marginBottom: '4px', lineHeight: 1.5,
            }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── ChatMessageItem ───────────────────────────────────────────────────────

export interface ChatMessageItemProps {
  msg: ChatMessage;
  assistantName: string;
  textToShow: string;
  raw: string;
  optionsToShow: OptionItem[];
  isTaskList: boolean;
  isReflectiveQuestions: boolean;
  forcePills?: boolean;
  totalPages: number | undefined;
  currentPage: number;
  onPageChange: (msgId: number, page: number) => void;
  isStreamingMsg: boolean;
  turnUiState: TurnUiState;
  speakingMessageId: number | null;
  wsConnected: boolean;
  quickSend: (text: string) => void;
  onContextMenu: (e: React.MouseEvent, msg: ChatMessage, raw: string) => void;
  /** 点击反思问引用到输入框 */
  onQuoteQuestion: (text: string) => void;
  /** 成对标签解析出的渲染段（存在时优先渲染） */
  segments?: RenderSegment[];
  /** 思考耗时（秒） */
  thinkingElapsed?: number;
  /** 是否为最后一条 assistant 消息（是则不渲染 pills，因已在 ResponseTray 显示） */
  isLastAssistant?: boolean;
  /** 当前流式轮次的活动时间线（Step 2 ActivityPanel） */
  activityTimeline?: ActivityEntry[];
  /** 工具名称格式化 */
  getToolDisplayName?: (tool: string) => string;
  /** 打字机 DOM ref，供 AssistantMessageBody 直接写 textContent */
  streamingDomRef?: React.RefObject<HTMLPreElement | null>;
  /** 流式阶段跳过 markdown/block 解析，直接渲染纯文本，降低重排抖动 */
  usePlainStreamingText?: boolean;
  /** 流式阶段提前创建 Markdown 结构容器，让内容在代码框/表格内增量生长 */
  useStructuredStreamingMarkdown?: boolean;
  /** Markdown 组件配置 */
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
  /** 从 [cot]…[/cot] 提取的思维链；null/undefined 表示本条无 CoT */
  cotContent?: string | null;
  /** 已检测到 CoT 起始标记；即使正文尚未到达，也立即显示 CoT 头部块 */
  cotStarted?: boolean;
  /** 兼容旧接口：当前已不再用于驱动思维链流式渲染 */
  cotStreaming?: boolean;
  /**
   * OCT-LAYOUT-ANCHOR-2026-04-01
   * 网关仍在 thinking、本条 assistant 尚无任何字符时，把「思考中」CoT 占位画在本条消息头旁，
   * 避免与独立 cot-stream-wrapper 双行叠放导致头像/列表在首 token 时跳动。
   * 退回：删此 prop 及相关分支，恢复 ChatMessageList 内独立的 thinking CoT 块（仅改回 TSX 即可）。
   */
  inlineThinkingPlaceholder?: boolean;
}

const MessageMeta = memo(function MessageMeta({ timestamp }: { timestamp: string | number | undefined }) {
  const [hoverTime, setHoverTime] = useState(false);
  return (
    <span
      className="msg-timestamp"
      onMouseEnter={() => setHoverTime(true)}
      onMouseLeave={() => setHoverTime(false)}
      style={{
        color: hoverTime ? 'var(--accent-primary)' : 'var(--text-secondary)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-mono)',
        cursor: 'default',
        transition: 'color 0.2s',
        letterSpacing: '0.5px',
      }}
    >
      {hoverTime ? formatFullTime(timestamp) : formatTime(timestamp)}
    </span>
  );
});

const MessageHeader = memo(
  function MessageHeader({
    msg,
    isStreamingMsg,
    turnUiState,
    suppressPhaseBadge,
    assistantName,
  }: {
    msg: ChatMessage;
    isStreamingMsg: boolean;
    turnUiState: TurnUiState;
    /** 与头部带内 CoT 并存且 phase 为 thinking 时隐藏，避免与 CoT 标题双「思考中」 */
    suppressPhaseBadge?: boolean;
    assistantName: string;
  }) {
    const badgeLabel = getTurnUiBadgeLabel(turnUiState.phase);
    const showBadge =
      isStreamingMsg &&
      badgeLabel != null &&
      !(suppressPhaseBadge && isTurnUiThinking(turnUiState.phase));
    return (
      <div className="msg-header">
        {msg.role === 'user' ? (
          <span className="msg-label">YOU ▶</span>
        ) : (
          <div className="amy-header-row">
            <AmyAvatar isStreaming={false} size={32} />
            <span
              style={{
                color: 'var(--accent-primary)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '2px',
              }}
            >
              {assistantName}
            </span>
            <span className={`agent-status-slot ${showBadge ? 'is-visible' : ''}`} aria-hidden={!showBadge}>
              <span className="agent-status-badge">
                {badgeLabel}
              </span>
            </span>
          </div>
        )}
      </div>
    );
  },
  (a, b) =>
    a.msg.id === b.msg.id &&
    a.msg.role === b.msg.role &&
    !!a.msg.isStreaming === !!b.msg.isStreaming &&
    a.isStreamingMsg === b.isStreamingMsg &&
    a.turnUiState === b.turnUiState &&
    !!a.suppressPhaseBadge === !!b.suppressPhaseBadge &&
    a.assistantName === b.assistantName
);

const UserMessageBody = memo(
  function UserMessageBody({ imageDataUrl, textToShow }: { imageDataUrl?: string; textToShow: string }) {
    return (
      <div className="msg-user-body">
        {imageDataUrl && <img src={imageDataUrl} alt="" className="msg-user-image" />}
        {textToShow && <span className="msg-content msg-user-text">{textToShow}</span>}
      </div>
    );
  },
  (a, b) => a.imageDataUrl === b.imageDataUrl && a.textToShow === b.textToShow
);

type AssistantMessageBodyProps = Pick<
  ChatMessageItemProps,
  | 'msg'
  | 'textToShow'
  | 'raw'
  | 'optionsToShow'
  | 'isTaskList'
  | 'isReflectiveQuestions'
  | 'forcePills'
  | 'totalPages'
  | 'currentPage'
  | 'onPageChange'
  | 'isStreamingMsg'
  | 'wsConnected'
  | 'quickSend'
  | 'onQuoteQuestion'
  | 'segments'
  | 'isLastAssistant'
> & {
  streamingDomRef?: React.RefObject<HTMLPreElement | null>;
  usePlainStreamingText?: boolean;
  useStructuredStreamingMarkdown?: boolean;
  /** 工具调用结束后、最终文字还未到达时显示「正在生成回答…」 */
  awaitingFinalAnswer?: boolean;
};

const AssistantMessageBody = memo(function AssistantMessageBody({
  msg,
  textToShow,
  raw,
  optionsToShow,
  isTaskList,
  isReflectiveQuestions,
  forcePills,
  totalPages,
  currentPage,
  onPageChange,
  isStreamingMsg,
  wsConnected,
  quickSend,
  onQuoteQuestion,
  segments,
  isLastAssistant,
  streamingDomRef,
  usePlainStreamingText = false,
  useStructuredStreamingMarkdown = false,
  awaitingFinalAnswer = false,
  getToolDisplayName = (t: string) => t,
  markdownComponents,
}: AssistantMessageBodyProps & {
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
  getToolDisplayName?: (tool: string) => string;
}) {
  // Layout Lock：流式开始时记录高度并锁定 minHeight，防止结束时收缩跳动
  const bubbleRef = useRef<HTMLDivElement>(null);
  const lockedHeightRef = useRef<number>(0);

  useEffect(() => {
    if (isStreamingMsg && bubbleRef.current) {
      lockedHeightRef.current = bubbleRef.current.offsetHeight;
      if (lockedHeightRef.current > 0) {
        bubbleRef.current.style.minHeight = `${lockedHeightRef.current}px`;
      }
    }
  }, [isStreamingMsg]);

  useEffect(() => {
    if (!isStreamingMsg && bubbleRef.current) {
      const el = bubbleRef.current;
      let raf1: number, raf2: number;
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          if (el.isConnected) el.style.minHeight = '';
        });
      });
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
    }
  }, [isStreamingMsg]);

  if (msg.isSystemReply) {
    return <SystemMessage text={(textToShow || raw || '').replace(/ · /g, '\n')} />;
  }

  if (isStreamingMsg && usePlainStreamingText) {
    return (
      <div
        ref={bubbleRef}
        className="msg-assistant-body"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {awaitingFinalAnswer && (
          <div className="msg-generating-hint">正在整理结论…</div>
        )}
        {/* 正文由 useMessages 的 RAF 写 textContent，避免每帧 React 协调整棵 ChatTab */}
        <pre
          ref={streamingDomRef as React.LegacyRef<HTMLPreElement> | undefined}
          className="msg-content msg-content-streaming msg-content-streaming-root"
        />
        <TypewriterCursor show />
      </div>
    );
  }

  if (isStreamingMsg && useStructuredStreamingMarkdown) {
    return (
      <div
        ref={bubbleRef}
        className="msg-assistant-body"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        {awaitingFinalAnswer && (
          <div className="msg-generating-hint">正在整理结论…</div>
        )}
        <StreamingMarkdownContent content={textToShow || raw || ''} />
        <TypewriterCursor show />
      </div>
    );
  }

  // ── B3 inline：工具卡片按段序穿插进正文流（对齐 Claude Code 结构）──────────
  // 前缀(最后文本段之前的 preamble + 工具) → 主体(最后文本段=最终答案) → 后缀(执行中的工具)
  const turnSegs = msg.turnSegments;
  const inlineActive = Array.isArray(turnSegs) && turnSegs.some((s) => s.type === 'tool_use');
  let lastTextIdx = -1;
  if (inlineActive && turnSegs) {
    for (let i = turnSegs.length - 1; i >= 0; i -= 1) {
      if (turnSegs[i].type === 'text' || turnSegs[i].type === 'final') { lastTextIdx = i; break; }
    }
  }
  const renderInlineRange = (from: number, to: number) => {
    if (!inlineActive || !turnSegs) return null;
    const slice = turnSegs.slice(from, to);
    const out: React.ReactNode[] = [];
    let toolBuffer: TurnSegmentLite[] = [];

    const flushTools = () => {
      if (toolBuffer.length === 0) return;
      const groupSegs = toolBuffer;
      toolBuffer = [];
      out.push(
        <ToolGroup
          key={`tg-${groupSegs[0].segId}`}
          segs={groupSegs}
          toolEvents={msg.toolEvents}
          getToolDisplayName={getToolDisplayName}
        />,
      );
    };

    for (const seg of slice) {
      if (seg.type === 'tool_use') {
        toolBuffer.push(seg);
        continue;
      }
      flushTools();
      const c = getAssistantVisibleMain(seg.content || '').trim();
      if (!c) continue;
      out.push(
        <div key={seg.segId} className="inline-preamble">
          <FinalizedMarkdownContent
            messageId={msg.id}
            segmentKey={`pre-${seg.segId}`}
            content={c}
            markdownComponents={markdownComponents}
            streaming
          />
        </div>,
      );
    }
    flushTools();
    return out;
  };
  const prefixEnd = lastTextIdx < 0 ? (turnSegs?.length ?? 0) : lastTextIdx;

  return (
    <div
      ref={bubbleRef}
      className="msg-assistant-body"
      style={isStreamingMsg || inlineActive ? { display: 'flex', flexDirection: 'column' } : undefined}
    >
      {inlineActive && renderInlineRange(0, prefixEnd)}
      {segments && segments.length > 0 ? (
        <>
          {(() => {
            let remaining = textToShow || '';
            return segments.map((seg, idx) => {
            const contentBefore =
              idx > 0 ? segments.slice(0, idx).reduce((sum, s) => sum + (s.content?.length || 0), 0) : 0;
            const contentAfter =
              idx < segments.length - 1
                ? segments.slice(idx + 1).reduce((sum, s) => sum + (s.content?.length || 0), 0)
                : 0;

            switch (seg.type) {
              case 'text':
                if (isStreamingMsg) {
                  // 流式：统一用 FinalizedMarkdownContent，与结束后相同的渲染树，消除切换跳动
                  // segmentKey 与结束后保持一致（不加 -stream 后缀），
                  // 避免流式结束时 key 变化导致组件卸载重挂，代码框闪烁
                  const fullSegText = stripRenderAndPillsMarkers(seg.content, isLastAssistant);
                  const take = remaining.slice(0, fullSegText.length);
                  remaining = remaining.slice(take.length);
                  return (
                    <FinalizedMarkdownContent
                      key={idx}
                      messageId={msg.id}
                      segmentKey={`seg-${idx}`}
                      content={take}
                      markdownComponents={markdownComponents}
                      streaming
                    />
                  );
                }
                return (
                  <FinalizedMarkdownContent
                    key={idx}
                    messageId={msg.id}
                    segmentKey={`seg-${idx}`}
                    content={stripRenderAndPillsMarkers(seg.content, isLastAssistant)}
                    markdownComponents={markdownComponents}
                  />
                );
              case 'pills':
                // 流式阶段隐藏 pills，消除换行闪跳；流式结束后自然出现
                if (isStreamingMsg) return null;
                return seg.options.length > 0 ? (
                  <OptionBox
                    key={idx}
                    messageId={msg.id}
                    options={seg.options}
                    totalPages={undefined}
                    currentPage={1}
                    onPageChange={(page) => onPageChange(msg.id, page)}
                    onSelect={(value) => {
                      if (value && wsConnected) quickSend(value);
                    }}
                    forcePills={true}
                    segmentIndex={idx}
                    contentBefore={contentBefore}
                    contentAfter={contentAfter}
                  />
                ) : null;
              case 'checkbox':
                // 流式阶段隐藏 checkbox
                if (isStreamingMsg) return null;
                return seg.options.length > 0 ? (
                  <OptionBox
                    key={idx}
                    messageId={msg.id}
                    options={seg.options}
                    totalPages={undefined}
                    currentPage={1}
                    onPageChange={(page) => onPageChange(msg.id, page)}
                    onSelect={(value) => {
                      if (value && wsConnected) quickSend(value);
                    }}
                    forcePills={false}
                  />
                ) : null;
              case 'question':
                return seg.options.length > 0 ? (
                  <QuestionCards key={idx} questions={seg.options} onQuote={onQuoteQuestion} />
                ) : null;
              case 'tasklist':
                return seg.options.length > 0 ? <TaskList key={idx} items={seg.options} /> : null;
              case 'cot':
                return null; // 统一由外部 CoTBlock 渲染
              default:
                return null;
            }
          });
          })()}
        </>
      ) : (
        <>
          {(() => {
            if (isStreamingMsg) {
              // 流式阶段：统一用 FinalizedMarkdownContent，消除流式结束时的渲染切换跳动
              // 不渲染 pills/options，避免换行闪跳
              return (
                <FinalizedMarkdownContent
                  messageId={msg.id}
                  segmentKey="main"
                  content={textToShow || ''}
                  markdownComponents={markdownComponents}
                  streaming
                />
              );
            }

            const cleanedText = filterExpectedEffect(textToShow, isLastAssistant);
            const hasInlinePlaceholder = cleanedText.includes('<!--OPTIONS_HERE-->');
            const showInlineOptions = hasInlinePlaceholder && optionsToShow.length > 0 && !isTaskList && !isReflectiveQuestions;
            const textWithoutInlinePlaceholder = cleanedText
              .replace(/<!--OPTIONS_HERE-->/g, '')
              .replace(/\n{3,}/g, '\n\n')
              .trim();

            if (showInlineOptions) {
              const parts = cleanedText.split('<!--OPTIONS_HERE-->');
              const before = parts[0]?.trim() || '';
              const after = parts.slice(1).join('').trim();
              const showPillsHere = !isLastAssistant || !forcePills;
              return (
                <>
                  {before && (
                    <FinalizedMarkdownContent messageId={msg.id} segmentKey="opt-before" content={before} markdownComponents={markdownComponents} />
                  )}
                  {showPillsHere && (
                    <OptionBox
                      messageId={msg.id}
                      options={optionsToShow}
                      totalPages={totalPages}
                      currentPage={currentPage}
                      onPageChange={(page) => onPageChange(msg.id, page)}
                      onSelect={(value) => {
                        if (value && wsConnected) quickSend(value);
                      }}
                      forcePills={forcePills}
                    />
                  )}
                  {after && (
                    <FinalizedMarkdownContent messageId={msg.id} segmentKey="opt-after" content={after} markdownComponents={markdownComponents} />
                  )}
                </>
              );
            }

            return (
              <>
                <FinalizedMarkdownContent
                  messageId={msg.id}
                  segmentKey="main"
                  content={textWithoutInlinePlaceholder}
                  markdownComponents={markdownComponents}
                />
                {optionsToShow.length > 0 && !isTaskList && !isReflectiveQuestions && (
                  <OptionBox
                    messageId={msg.id}
                    options={optionsToShow}
                    totalPages={totalPages}
                    currentPage={currentPage}
                    onPageChange={(page) => onPageChange(msg.id, page)}
                    onSelect={(value) => {
                      if (value && wsConnected) quickSend(value);
                    }}
                    forcePills={forcePills}
                  />
                )}
              </>
            );
          })()}
          {optionsToShow.length > 0 && isTaskList && <TaskList items={optionsToShow} />}
          {optionsToShow.length > 0 && isReflectiveQuestions && (
            <QuestionCards questions={optionsToShow} onQuote={onQuoteQuestion} />
          )}
        </>
      )}
      {inlineActive && lastTextIdx >= 0 && turnSegs && renderInlineRange(lastTextIdx + 1, turnSegs.length)}
      {isStreamingMsg && <TypewriterCursor show />}
    </div>
  );
}, (prev, next) =>
    prev.msg.id === next.msg.id &&
    prev.msg.isStreaming === next.msg.isStreaming &&
    prev.textToShow === next.textToShow &&
    prev.isStreamingMsg === next.isStreamingMsg &&
    prev.isLastAssistant === next.isLastAssistant &&
    prev.markdownComponents === next.markdownComponents &&
    prev.segments === next.segments &&
    prev.optionsToShow === next.optionsToShow &&
    // B3 inline：段快照/工具事件变化时需重渲染，驱动 inline 卡片更新
    prev.msg.turnSegments === next.msg.turnSegments &&
    prev.msg.toolEvents === next.msg.toolEvents &&
    prev.awaitingFinalAnswer === next.awaitingFinalAnswer &&
    prev.getToolDisplayName === next.getToolDisplayName
);

/** 单行消息外壳（不设 memo：子树由 ChatMessageItem 控制） */
function MessageRow({
  msg,
  raw,
  speakingMessageId,
  isStreamingMsg,
  onContextMenu,
  children,
}: {
  msg: ChatMessage;
  raw: string;
  speakingMessageId: number | null;
  isStreamingMsg: boolean;
  onContextMenu: (e: React.MouseEvent, msg: ChatMessage, raw: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      data-msg-id={msg.id}
      className={`chat-message ${msg.role} ${msg.isSystemReply ? 'system-reply' : ''} ${speakingMessageId === msg.id ? 'speaking' : ''} ${isStreamingMsg ? 'streaming' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, msg, raw);
      }}
    >
      {msg.role === 'assistant' && (
        <div className="msg-copy-wrap">
          <MsgCopyButton text={raw} />
        </div>
      )}
      {children}
    </div>
  );
}

const ChatMessageItem = memo(function ChatMessageItem(props: ChatMessageItemProps) {
  const {
    msg,
    assistantName,
    textToShow,
    raw,
    optionsToShow,
    isTaskList,
    isReflectiveQuestions,
    forcePills,
    totalPages,
    currentPage,
    onPageChange,
    isStreamingMsg,
    turnUiState,
    speakingMessageId,
    wsConnected,
    quickSend,
    onContextMenu,
    onQuoteQuestion,
    segments,
    isLastAssistant,
    activityTimeline = [],
    getToolDisplayName = (tool) => tool,
    streamingDomRef,
    usePlainStreamingText = false,
    useStructuredStreamingMarkdown = false,
    markdownComponents,
    cotContent,
    cotStarted = false,
    cotStreaming,
    inlineThinkingPlaceholder = false,
  } = props;

  const awaitingFinalAnswer =
    isStreamingMsg &&
    turnUiState.phase === 'waiting_continuation';

  const showCotInline = msg.role === 'assistant' && !isStreamingMsg && (cotContent != null || cotStarted);
  const showCotStreaming = msg.role === 'assistant' && isStreamingMsg && (!!cotStreaming || cotStarted);
  const showLightweightThinkingBadge =
    msg.role === 'assistant' &&
    isStreamingMsg &&
    !inlineThinkingPlaceholder &&
    !showCotStreaming &&
    isTurnUiThinking(turnUiState.phase);

  const shouldShowActivityPanel = msg.role === 'assistant' && !!isLastAssistant;
  // B3 inline：工具卡片已穿插进正文流时，把工具从顶部活动面板剔除（只留思考/CoT），避免重复展示。
  const inlineToolsActive = Array.isArray(msg.turnSegments) && msg.turnSegments.some((s) => s.type === 'tool_use');
  const finalizedTimeline = shouldShowActivityPanel && !isStreamingMsg
    ? filterActivityEntriesForInlineTools(
        buildFinalizedTimeline(msg, showCotInline ? (cotContent ?? '') : null),
        inlineToolsActive,
      )
    : [];
  const streamingTimeline = shouldShowActivityPanel && isStreamingMsg
    ? filterActivityEntriesForInlineTools(activityTimeline, inlineToolsActive)
    : [];
  const panelStreamingFlag = shouldShowActivityPanel
    ? (isStreamingMsg && (showCotStreaming || showLightweightThinkingBadge || inlineThinkingPlaceholder || isTurnUiActivityStreaming(turnUiState.phase)))
    : false;

  return (
    <MessageRow
      msg={msg}
      raw={raw}
      speakingMessageId={speakingMessageId}
      isStreamingMsg={isStreamingMsg}
      onContextMenu={onContextMenu}
    >
      <MessageHeader
        msg={msg}
        isStreamingMsg={isStreamingMsg}
        turnUiState={turnUiState}
        assistantName={assistantName}
      />
      {shouldShowActivityPanel && (
        <ActivityPanel
          timeline={isStreamingMsg ? streamingTimeline : finalizedTimeline}
          isStreaming={panelStreamingFlag}
          getToolDisplayName={getToolDisplayName}
        />
      )}
      <div className="msg-body">
        {msg.role === 'assistant' ? (
          <AssistantMessageBody
            msg={msg}
            textToShow={textToShow}
            raw={raw}
            optionsToShow={optionsToShow}
            isTaskList={isTaskList}
            isReflectiveQuestions={isReflectiveQuestions}
            forcePills={forcePills}
            totalPages={totalPages}
            currentPage={currentPage}
            onPageChange={onPageChange}
            isStreamingMsg={isStreamingMsg}
            wsConnected={wsConnected}
            quickSend={quickSend}
            onQuoteQuestion={onQuoteQuestion}
            segments={segments}
            isLastAssistant={isLastAssistant}
            streamingDomRef={streamingDomRef}
            usePlainStreamingText={usePlainStreamingText}
            useStructuredStreamingMarkdown={useStructuredStreamingMarkdown}
            awaitingFinalAnswer={awaitingFinalAnswer}
            getToolDisplayName={getToolDisplayName}
            markdownComponents={markdownComponents}
          />
        ) : (
          <UserMessageBody imageDataUrl={msg.imageDataUrl} textToShow={textToShow} />
        )}
      </div>
      <MessageMeta timestamp={msg.timestamp} />
    </MessageRow>
  );
});

// ── ChatMessageList ───────────────────────────────────────────────────────

export interface ChatMessageListProps {
  messages: ChatMessage[];
  displayMessages: ChatMessage[];
  isStreaming: boolean;
  awaitingResponse: boolean;
  streamingContent: string;
  displayedText: string;
  speakingMessageId: number | null;
  turnUiState: TurnUiState;
  thinkingElapsed: number;
  wsConnected: boolean;
  quickSend: (text: string) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onMessageContextMenu: (e: React.MouseEvent, msg: ChatMessage, raw: string) => void;
  onQuoteQuestion: (text: string) => void;
  pendingPills?: string[] | null;
  messagesContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  activeTools?: Array<{
    callId: string;
    tool: string;
    state: 'executing' | 'done' | 'error';
    resultPreview?: string;
  }>;
  activityTimeline?: ActivityEntry[];
  getToolDisplayName?: (tool: string) => string;
  streamingDomRef?: React.RefObject<HTMLPreElement | null>;
  usePlainStreamingText?: boolean;
  useStructuredStreamingMarkdown?: boolean;
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
  allowCotDisplay?: boolean;
  /** 空会话时替换默认「输入消息开始对..」占位（由 ChatTab 注入 Welcome等） */
  emptyConversationPlaceholder?: React.ReactNode;
}

function sameMessageRefs(a: ChatMessage[], b: ChatMessage[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areChatMessageListPropsEqual(prev: ChatMessageListProps, next: ChatMessageListProps): boolean {
  return (
    prev.messages === next.messages &&
    sameMessageRefs(prev.displayMessages, next.displayMessages) &&
    prev.isStreaming === next.isStreaming &&
    prev.awaitingResponse === next.awaitingResponse &&
    prev.streamingContent === next.streamingContent &&
    prev.displayedText === next.displayedText &&
    prev.speakingMessageId === next.speakingMessageId &&
    prev.turnUiState === next.turnUiState &&
    prev.thinkingElapsed === next.thinkingElapsed &&
    prev.wsConnected === next.wsConnected &&
    prev.quickSend === next.quickSend &&
    prev.bottomRef === next.bottomRef &&
    prev.onScroll === next.onScroll &&
    prev.onMessageContextMenu === next.onMessageContextMenu &&
    prev.onQuoteQuestion === next.onQuoteQuestion &&
    prev.pendingPills === next.pendingPills &&
    prev.messagesContainerRef === next.messagesContainerRef &&
    prev.activeTools === next.activeTools &&
    prev.activityTimeline === next.activityTimeline &&
    prev.getToolDisplayName === next.getToolDisplayName &&
    prev.streamingDomRef === next.streamingDomRef &&
    prev.usePlainStreamingText === next.usePlainStreamingText &&
    prev.useStructuredStreamingMarkdown === next.useStructuredStreamingMarkdown &&
    prev.markdownComponents === next.markdownComponents &&
    prev.allowCotDisplay === next.allowCotDisplay &&
    prev.emptyConversationPlaceholder === next.emptyConversationPlaceholder
  );
}

export const ChatMessageList = memo(function ChatMessageList({
  messages,
  displayMessages,
  isStreaming,
  awaitingResponse,
  streamingContent,
  displayedText,
  speakingMessageId,
  turnUiState,
  thinkingElapsed: _thinkingElapsed, // 不再使用，因为 CoTBlock 有自己的计时器
  wsConnected,
  quickSend,
  bottomRef,
  onScroll,
  onMessageContextMenu,
  onQuoteQuestion,
  pendingPills,
  messagesContainerRef,
  activeTools: _activeTools = [],
  activityTimeline = [],
  getToolDisplayName = (t) => t,
  streamingDomRef,
  usePlainStreamingText = false,
  useStructuredStreamingMarkdown = false,
  markdownComponents,
  allowCotDisplay = true,
  emptyConversationPlaceholder,
}: ChatMessageListProps) {
  const { settings } = useSettings();
  const assistantName = settings.aiName || 'OpenClaw';
  const [pageByMsgId, setPageByMsgId] = useState<Record<number, number>>({});
  const [bottomSpacerHeight, setBottomSpacerHeight] = useState(0);
  const contentMeasureRef = useRef<HTMLDivElement | null>(null);
  const streamingParseCacheRef = useRef<{ input: string; output: ReturnType<typeof parseOptionBox> } | null>(null);
  const finalizedParseCacheRef = useRef<
    Map<number, { input: string; output: ReturnType<typeof parseOptionBox> }>
  >(new Map());

  const handlePageChange = useCallback((msgId: number, page: number) => {
    setPageByMsgId((prev) => ({ ...prev, [msgId]: page }));
  }, []);

  const updateBottomSpacerHeight = useCallback(() => {
    const wrap = messagesContainerRef.current;
    const content = contentMeasureRef.current;
    if (!wrap || !content) {
      setBottomSpacerHeight(0);
      return;
    }

    const viewportHeight = wrap.clientHeight;
    const maxSpacerHeight = Math.round(viewportHeight * MAX_BOTTOM_SPACER_VIEWPORT_RATIO);
    const isTurnActive = awaitingResponse || isStreaming;
    const userMsgs = content.querySelectorAll('.chat-message.user');
    const lastUserMsg = userMsgs[userMsgs.length - 1] as HTMLElement | undefined;
    const nextHeight = (() => {
      if (isTurnActive) return maxSpacerHeight;
      if (!lastUserMsg) return 0;

      const contentRect = content.getBoundingClientRect();
      const userRect = lastUserMsg.getBoundingClientRect();
      const contentBelowLatestUser = Math.max(0, contentRect.bottom - userRect.top);
      const neededHeight = Math.floor(viewportHeight - contentBelowLatestUser - 16);
      return Math.max(0, Math.min(maxSpacerHeight, neededHeight));
    })();

    setBottomSpacerHeight((current) => (
      Math.abs(current - nextHeight) <= 1 ? current : nextHeight
    ));
  }, [awaitingResponse, isStreaming, messagesContainerRef]);

  useLayoutEffect(() => {
    updateBottomSpacerHeight();

    const wrap = messagesContainerRef.current;
    const content = contentMeasureRef.current;
    if (!wrap || !content) return;
    if (typeof ResizeObserver === 'undefined' || typeof requestAnimationFrame === 'undefined') return;

    const resizeObserver = new ResizeObserver(updateBottomSpacerHeight);
    resizeObserver.observe(wrap);
    resizeObserver.observe(content);

    const frame = requestAnimationFrame(updateBottomSpacerHeight);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [
    updateBottomSpacerHeight,
    messagesContainerRef,
    messages.length,
    displayMessages.length,
    isStreaming,
    awaitingResponse,
    streamingContent,
    displayedText,
    pendingPills?.length,
    activityTimeline.length,
  ]);

  // 检查任何来源的思维链标记：streamingContent 或 最后一条 assistant 消息的 content
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
  const msgContentHasCot = lastAssistantMsg?.isStreaming &&
    typeof lastAssistantMsg.content === 'string' &&
    hasAssistantCotMarkers(lastAssistantMsg.content);
  const streamingHasCot = typeof streamingContent === 'string' && hasAssistantCotMarkers(streamingContent);
  const hasCotAnywhere = streamingHasCot || msgContentHasCot;

  // 当 AI 已经开始输出内容（非空 assistant 消息存在）时，不再显示占位 indicator
  // 真正的状态徽章会显示在消息头部
  const assistantHasContent = lastAssistantMsg?.isStreaming &&
    (lastAssistantMsg.content as string)?.trim().length > 0;

  /** 已有任意 assistant 行（含空占位）时不再画列表顶独立指示器，避免与行内 CoT/徽章双「思考中」 */
  const hasAnyAssistant = messages.some((m) => m.role === 'assistant');

  const showTypingIndicator = (awaitingResponse || isStreaming) &&
    !hasAnyAssistant &&
    !hasCotAnywhere &&
    !assistantHasContent;
  const lastAssistantId = [...messages].reverse().find(m => m.role === 'assistant')?.id;

  /* OCT-LAYOUT-ANCHOR-2026-04-01：末条已是「空内容的流式 assistant」时，不再画独立的思考/typing 条，避免与该行双叠。退回：删此变量及下方 !emptyStreamingAssistantTail 条件。 */
  const tailMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const emptyStreamingAssistantTail =
    !!tailMsg &&
    tailMsg.role === 'assistant' &&
    !!tailMsg.isStreaming &&
    !(typeof tailMsg.content === 'string' ? tailMsg.content : '').trim();
  const shouldHoldSendAnchorSpacer = awaitingResponse || isStreaming;

  return (
    <div
      className="chat-messages-wrap"
      style={{ overflowAnchor: 'none' }}
      onScroll={onScroll}
      ref={messagesContainerRef}
    >
      <div className="chat-messages">
        <div className="chat-messages-content" ref={contentMeasureRef}>
          {messages.length === 0 && (
            emptyConversationPlaceholder ?? (
            <div className="chat-empty">
              <span className="empty-icon">✦</span>
              <span>输入消息开始对..</span>
            </div>
            )
          )}
          {showTypingIndicator && !emptyStreamingAssistantTail && (
            isTurnUiThinking(turnUiState.phase) ? (
              // 思考阶段：用 CoTBlock 占位面板替代 chat-thinking 条（无末条空 assistant 时）
              <div className="cot-stream-wrapper">
                <CoTBlock
                  content=""
                  isStreaming={true}
                  isPlaceholder={true}
                />
              </div>
            ) : (
              // 其他等待阶段（typing / tool_executing）：保持原有样式
              <div className="chat-thinking">
                <span className="msg-label">◆ {assistantName}</span>
                {getTurnUiBadgeLabel(turnUiState.phase) && (
                  <span className="agent-status-badge">{getTurnUiBadgeLabel(turnUiState.phase)}</span>
                )}
                <span className="processing-blocks typing-dots">
                  <span className="block" />
                  <span className="block" />
                  <span className="block" />
                </span>
              </div>
            )
          )}
          {displayMessages.map((msg) => {
        const isStreamingMsg = msg.role === 'assistant' && msg.isStreaming;

        const {
          textToShow,
          cotContent: streamingCotContent,
          cotStarted: streamingCotStarted,
          optionsToShow,
          totalPages,
          isTaskList,
          isReflectiveQuestions,
          forcePills,
          segments: segmentsToShow,
          raw,
        } = useMsgParse({
          msg,
          isStreamingMsg: !!isStreamingMsg,
          streamingContent,
          displayedText,
          allowCotDisplay,
          usePlainStreamingText,
          streamingParseCacheRef,
          finalizedParseCacheRef,
        });

        const inlineThinkingPlaceholder =
          msg.role === 'assistant' &&
          msg.id === lastAssistantId &&
          isStreamingMsg &&
          !raw.trim() &&
          isTurnUiThinking(turnUiState.phase);
        return (
          <React.Fragment key={msg.id}>
            <ChatMessageItem
              key={`item-${msg.id}`}
              msg={msg}
              assistantName={assistantName}
              raw={raw}
              textToShow={textToShow}
              optionsToShow={optionsToShow}
              isTaskList={isTaskList}
              isReflectiveQuestions={isReflectiveQuestions}
              forcePills={forcePills}
              totalPages={totalPages}
              segments={segmentsToShow}
              currentPage={pageByMsgId[msg.id] ?? 1}
              onPageChange={handlePageChange}
              isStreamingMsg={!!msg.isStreaming}
              turnUiState={turnUiState}
              speakingMessageId={speakingMessageId}
              wsConnected={wsConnected}
              quickSend={quickSend}
              onContextMenu={onMessageContextMenu}
              onQuoteQuestion={onQuoteQuestion}
            isLastAssistant={msg.role === 'assistant' && msg.id === lastAssistantId}
              streamingDomRef={msg.isStreaming ? streamingDomRef : undefined}
              usePlainStreamingText={usePlainStreamingText}
              useStructuredStreamingMarkdown={useStructuredStreamingMarkdown}
              markdownComponents={markdownComponents}
              cotContent={msg.role === 'assistant' && streamingCotContent != null ? streamingCotContent : undefined}
              cotStarted={msg.role === 'assistant' && streamingCotStarted}
              cotStreaming={isStreamingMsg && (streamingCotStarted || !!streamingCotContent)}
              inlineThinkingPlaceholder={inlineThinkingPlaceholder}
              activityTimeline={msg.id === lastAssistantId ? activityTimeline : []}
              getToolDisplayName={getToolDisplayName}
            />
          </React.Fragment>
        );
          })}
          {pendingPills && pendingPills.length > 0 && (
            <div className="response-tray-inline">
              <div className="response-tray-inline__pills">
                {pendingPills.map((pill: string, i: number) => (
                  <button
                    key={i}
                    className="response-tray-inline__pill"
                    title={pill}
                    onClick={() => onQuoteQuestion(pill)}
                  >
                    {pill}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div ref={bottomRef as React.Ref<HTMLDivElement>} style={{ height: 0, margin: 0, padding: 0 }} />
        <div
          className="chat-bottom-spacer"
          style={{ height: shouldHoldSendAnchorSpacer ? '60vh' : bottomSpacerHeight }}
          aria-hidden
        />
      </div>
    </div>
  );
}, areChatMessageListPropsEqual);

export default ChatMessageList;
