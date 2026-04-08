import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { parseOptionBox, type OptionItem, type RenderSegment } from '../../utils/optionBoxParser';
import { extractAssistantCotAndMain, hasAssistantCotMarkers } from '../../utils/cotExtract';
import { summarizeCotForDisplay } from '../../utils/cotSummary';
import { blockRouter } from '../../core/blockRouter';
import { blocksToSegments } from '../../core/blockAdapter';
import OptionBox from '../../components/OptionBox';
import TaskList from '../../components/TaskList';
import QuestionCards from '../../components/QuestionCards';
import CoTBlock from '../../components/CoTBlock';
import AmyAvatar from '../../components/AmyAvatar';
import { useSettings } from '../../contexts/SettingsContext';
import { getCachedPreprocessedMarkdown } from '../../utils/markdownPreprocess';
import type { ChatMessage } from './ChatTab.v2';

// ── 时间格式化 ───────────────────────────────────────────────────────────

const formatTime = (timestamp: string | number | undefined): string => {
  if (timestamp === undefined || timestamp === null) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

const formatFullTime = (timestamp: string | number | undefined): string => {
  if (timestamp === undefined || timestamp === null) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

// ── 原子组件 ─────────────────────────────────────────────────────────────

function MsgCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (_) {}
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

const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkMath];
const MARKDOWN_REHYPE_PLUGINS = [rehypeKatex];
const CHAT_MERMAID_RENDER_LIMIT = 1;

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
        if (streaming || segmentKey?.includes('stream')) {
          return content || '';
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
  agentPhase: 'idle' | 'thinking' | 'typing' | 'tool_executing';
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
  /** 打字机 DOM ref，供 AssistantMessageBody 直接写 textContent */
  streamingDomRef?: React.RefObject<HTMLPreElement | null>;
  /** 流式阶段跳过 markdown/block 解析，直接渲染纯文本，降低重排抖动 */
  usePlainStreamingText?: boolean;
  /** Markdown 组件配置 */
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
  /** 从 [cot]…[/cot] 提取的思维链；null/undefined 表示本条无 CoT */
  cotContent?: string | null;
  /** 兼容旧接口：当前已不再用于驱动思维链流式渲染 */
  cotStreaming?: boolean;
  /**
   * OCT-LAYOUT-ANCHOR-2026-04-01
   * 网关仍在 thinking、本条 assistant 尚无任何字符时，把「思考中」CoT 占位画在本条消息头旁，
   * 避免与独立 cot-stream-wrapper 双行叠放导致头像/列表在首 token 时跳动。
   * 退回：删此 prop 及相关分支，恢复 ChatMessageList 内独立的 thinking CoT 块（仅改回 TSX 即可）。
   */
  inlineThinkingPlaceholder?: boolean;
  isMobileViewport?: boolean;
}

const MessageMeta = memo(function MessageMeta({ timestamp }: { timestamp: string | number | undefined }) {
  const [hoverTime, setHoverTime] = useState(false);
  return (
    <span
      className="msg-timestamp"
      onMouseEnter={() => setHoverTime(true)}
      onMouseLeave={() => setHoverTime(false)}
      style={{
        color: hoverTime ? 'var(--accent)' : 'var(--text-secondary)',
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
    agentPhase,
    suppressPhaseBadge,
    assistantName,
  }: {
    msg: ChatMessage;
    isStreamingMsg: boolean;
    agentPhase: 'idle' | 'thinking' | 'typing' | 'tool_executing';
    /** 与头部带内 CoT 并存且 phase 为 thinking 时隐藏，避免与 CoT 标题双「思考中」 */
    suppressPhaseBadge?: boolean;
    assistantName: string;
  }) {
    const showBadge =
      isStreamingMsg &&
      agentPhase !== 'idle' &&
      !(suppressPhaseBadge && agentPhase === 'thinking');
    return (
      <div className="msg-header">
        {msg.role === 'user' ? (
          <span className="msg-label">YOU ▶</span>
        ) : (
          <div className="amy-header-row">
            <AmyAvatar isStreaming={false} size={32} />
            <span
              style={{
                color: 'var(--accent)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '2px',
              }}
            >
              {assistantName}
            </span>
            <span className={`agent-status-slot ${showBadge ? 'is-visible' : ''}`} aria-hidden={!showBadge}>
              <span className="agent-status-badge">
                {agentPhase === 'thinking' ? '思考中' : agentPhase === 'tool_executing' ? '调用工具中' : '打字中'}
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
    a.agentPhase === b.agentPhase &&
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
  markdownComponents,
}: AssistantMessageBodyProps & { markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] }) {
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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.minHeight = '';
        });
      });
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
        {/* 正文由 useMessages 的 RAF 写 textContent，避免每帧 React 协调整棵 ChatTab */}
        <pre
          ref={streamingDomRef as React.LegacyRef<HTMLPreElement> | undefined}
          className="msg-content msg-content-streaming msg-content-streaming-root"
        />
        <TypewriterCursor show />
      </div>
    );
  }

  return (
    <div
      ref={bubbleRef}
      className="msg-assistant-body"
      style={isStreamingMsg ? { display: 'flex', flexDirection: 'column' } : undefined}
    >
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
                  content={cleanedText}
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
      {isStreamingMsg && <TypewriterCursor show />}
    </div>
  );
});

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
    agentPhase,
    speakingMessageId,
    wsConnected,
    quickSend,
    onContextMenu,
    onQuoteQuestion,
    segments,
    isLastAssistant,
    streamingDomRef,
    usePlainStreamingText = false,
    markdownComponents,
    cotContent,
    cotStreaming,
    inlineThinkingPlaceholder = false,
    isMobileViewport = false,
  } = props;

  // showCotInline: finalized CoT (not streaming) — show full summarized content
  const showCotInline = msg.role === 'assistant' && !isStreamingMsg && cotContent != null;
  // showCotStreaming: CoT is actively being streamed right now
  const showCotStreaming = msg.role === 'assistant' && isStreamingMsg && !!cotStreaming && cotContent != null;
  const displayCotContent = showCotInline
    ? summarizeCotForDisplay(cotContent, textToShow || raw || '', { compact: isMobileViewport })
    : null;
  const showLightweightThinkingBadge =
    msg.role === 'assistant' &&
    isStreamingMsg &&
    !inlineThinkingPlaceholder &&
    !showCotStreaming &&  // suppress badge when real CoT is streaming
    agentPhase === 'thinking';
  const showHeaderBand = showCotInline || showCotStreaming || inlineThinkingPlaceholder || showLightweightThinkingBadge;

  return (
    <MessageRow
      msg={msg}
      raw={raw}
      speakingMessageId={speakingMessageId}
      isStreamingMsg={isStreamingMsg}
      onContextMenu={onContextMenu}
    >
      {showHeaderBand ? (
        <div className="assistant-header-band assistant-header-band--stable">
          <MessageHeader
            msg={msg}
            isStreamingMsg={isStreamingMsg}
            agentPhase={agentPhase}
            suppressPhaseBadge
            assistantName={assistantName}
          />
          <div className="cot-stream-wrapper cot-stream-wrapper--header-inline">
            <CoTBlock
              content={
                showCotInline    ? (displayCotContent ?? cotContent ?? '')
                : showCotStreaming ? (cotContent ?? '')
                : ''
              }
              isStreaming={inlineThinkingPlaceholder || showLightweightThinkingBadge || showCotStreaming}
              isPlaceholder={inlineThinkingPlaceholder}
              compactStreaming={showLightweightThinkingBadge}
              labelOverride={showLightweightThinkingBadge ? '思考中' : undefined}
              placeholderHint={showLightweightThinkingBadge ? '思维链将在回复完成后显示。' : undefined}
            />
          </div>
        </div>
      ) : (
        <MessageHeader msg={msg} isStreamingMsg={isStreamingMsg} agentPhase={agentPhase} assistantName={assistantName} />
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

/** 列表渲染用稳定引用，避免每条 user 消息因新对象触发无意义子树更新 */
const STABLE_EMPTY_OPTIONS: OptionItem[] = [];
const USER_ROW_PARSE_PLACEHOLDER = {
  text: '',
  options: STABLE_EMPTY_OPTIONS,
  totalPages: undefined as number | undefined,
  isTaskList: false,
  isReflectiveQuestions: false,
  forcePills: undefined as boolean | undefined,
  segments: undefined as RenderSegment[] | undefined,
};

export interface ChatMessageListProps {
  messages: ChatMessage[];
  displayMessages: ChatMessage[];
  isStreaming: boolean;
  awaitingResponse: boolean;
  streamingContent: string;
  displayedText: string;
  speakingMessageId: number | null;
  agentPhase: 'idle' | 'thinking' | 'typing' | 'tool_executing';
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
  getToolDisplayName?: (tool: string) => string;
  streamingDomRef?: React.RefObject<HTMLPreElement | null>;
  usePlainStreamingText?: boolean;
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
  allowCotDisplay?: boolean;
}

export const ChatMessageList = function ChatMessageList({
  messages,
  displayMessages,
  isStreaming,
  awaitingResponse,
  streamingContent,
  displayedText,
  speakingMessageId,
  agentPhase,
  thinkingElapsed: _thinkingElapsed, // 不再使用，因为 CoTBlock 有自己的计时器
  wsConnected,
  quickSend,
  bottomRef,
  onScroll,
  onMessageContextMenu,
  onQuoteQuestion,
  pendingPills,
  messagesContainerRef,
  activeTools = [],
  getToolDisplayName = (t) => t,
  streamingDomRef,
  usePlainStreamingText = false,
  markdownComponents,
  allowCotDisplay = true,
}: ChatMessageListProps) {
  const { settings } = useSettings();
  const assistantName = settings.aiName || 'OpenClaw';
  const [pageByMsgId, setPageByMsgId] = useState<Record<number, number>>({});
  const [isMobileViewport, setIsMobileViewport] = useState(() => (
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 720px)').matches : false
  ));
  const streamingParseCacheRef = useRef<{ input: string; output: ReturnType<typeof parseOptionBox> } | null>(null);
  const finalizedParseCacheRef = useRef<
    Map<number, { input: string; output: ReturnType<typeof parseOptionBox> }>
  >(new Map());

  const handlePageChange = useCallback((msgId: number, page: number) => {
    setPageByMsgId((prev) => ({ ...prev, [msgId]: page }));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(max-width: 720px)');
    const apply = () => setIsMobileViewport(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

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

  return (
    <div
      className="chat-messages-wrap"
      style={{ overflowAnchor: 'none' }}
      onScroll={onScroll}
      ref={messagesContainerRef}
    >
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <span className="empty-icon">✦</span>
            <span>输入消息开始对..</span>
          </div>
        )}
        {showTypingIndicator && !emptyStreamingAssistantTail && (
          agentPhase === 'thinking' ? (
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
              {agentPhase === 'typing' && <span className="agent-status-badge">打字中</span>}
              {agentPhase === 'tool_executing' && <span className="agent-status-badge">正在调用工具...</span>}
              <span className="processing-blocks typing-dots">
                <span className="block" />
                <span className="block" />
                <span className="block" />
              </span>
            </div>
          )
        )}
        {displayMessages.map((msg) => {
        const raw = typeof msg.content === 'string'
          ? msg.content
          : String((msg.content as any)?.text ?? (msg.content as any)?.content ?? msg.content ?? '');
        // 占位消息（isStreamingRaw + 空内容）：不跳过，让 streamingDomRef 能 attach
        // 打字机依赖 DOM 节点存在才能直接写 textContent
        const isStreamingMsg = msg.role === 'assistant' && msg.isStreaming;
        const fullContent =
          isStreamingMsg
            ? (
                (msg.isStreamingRaw && raw.trim())
                  ? raw
                  : (streamingContent || raw)
              )
            : raw;
        const displayedLength = displayedText.length;

        // ═══ CoT 分离：支持 [cot]…[/cot] 和 <think>…</think> 两种格式 ═══
        const { cotContent: streamingCotContent, mainContent: mainTextFull } =
          allowCotDisplay && msg.role === 'assistant' && fullContent
            ? !hasAssistantCotMarkers(fullContent)
              ? { cotContent: null, mainContent: fullContent }
              : extractAssistantCotAndMain(fullContent)
            : { cotContent: null, mainContent: fullContent };
        const display = isStreamingMsg ? mainTextFull.slice(0, displayedLength) : mainTextFull;
        const shouldBypassStreamingParse =
          usePlainStreamingText && msg.role === 'assistant' && isStreamingMsg;
        const parsed =
          msg.role === 'user'
            ? USER_ROW_PARSE_PLACEHOLDER
            : msg.role === 'assistant'
              ? (() => {
                  if (shouldBypassStreamingParse) {
                    return {
                      text: display,
                      options: STABLE_EMPTY_OPTIONS,
                      totalPages: undefined,
                      isTaskList: false,
                      isReflectiveQuestions: false,
                      forcePills: undefined,
                      segments: undefined,
                    };
                  }
                  const fc = typeof fullContent === 'string' ? fullContent : '';
                  // 如果已经通过 streamingCotContent 提取了 CoT 内容，
                  // 就把剥离了 [cot]...[/cot] 的纯正文传给 blockRouter，
                  // 避免 blockRouter 再次把 [cot] 解析成 segment 造成双重渲染
                  const cotStrippedContent = streamingCotContent !== null
                    ? mainTextFull
                    : fc;
                  // 流式阶段（非 raw）：缓存解析结果，避免每帧重跑解析器
                  if (isStreamingMsg) {
                    const cached = streamingParseCacheRef.current;
                    if (cached && cached.input === cotStrippedContent) return cached.output;
                    const blocks = blockRouter(cotStrippedContent);
                    const bridgedText = blocksToSegments(blocks).map((s) => s.content).join('');
                    const result = parseOptionBox(bridgedText);
                    streamingParseCacheRef.current = { input: cotStrippedContent, output: result };
                    return result;
                  }
                  // 非流式（最终渲染）
                  // 同样使用剥离 CoT 的内容，避免 parseOptionBox 重复解析 [cot]
                  // CoT 统一由消息循环外部的 CoTBlock 渲染（使用通用提取器）
                  const { mainContent: nonStreamingCotStripped } = extractAssistantCotAndMain(fc);
                  const cachedFinal = finalizedParseCacheRef.current.get(msg.id);
                  if (cachedFinal && cachedFinal.input === nonStreamingCotStripped) {
                    return cachedFinal.output;
                  }
                  const blocks = blockRouter(nonStreamingCotStripped);
                  const bridgedText = blocksToSegments(blocks).map((s) => s.content).join('');
                  const finalParsed = parseOptionBox(bridgedText);
                  finalizedParseCacheRef.current.set(msg.id, {
                    input: nonStreamingCotStripped,
                    output: finalParsed,
                  });
                  return finalParsed;
                })()
              : {
                  text: display,
                  options: STABLE_EMPTY_OPTIONS,
                  totalPages: undefined,
                  isTaskList: false,
                  isReflectiveQuestions: false,
                  forcePills: undefined,
                  segments: undefined,
                };
        const textToShow = msg.role === 'assistant'
          ? isStreamingMsg
            ? (display as string)
            : parsed.text?.trim()
              ? parsed.text
              : mainTextFull
          : (display as string);
        const optionsToShow = parsed.options;
        const totalPages = parsed.totalPages;
        const isTaskList = !!parsed.isTaskList;
        const isReflectiveQuestions = !!parsed.isReflectiveQuestions;
        const forcePills = parsed.forcePills;
        const segmentsToShow = parsed.segments;
        const inlineThinkingPlaceholder =
          msg.role === 'assistant' &&
          msg.id === lastAssistantId &&
          isStreamingMsg &&
          !raw.trim() &&
          agentPhase === 'thinking';
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
              agentPhase={agentPhase}
              speakingMessageId={speakingMessageId}
              wsConnected={wsConnected}
              quickSend={quickSend}
              onContextMenu={onMessageContextMenu}
              onQuoteQuestion={onQuoteQuestion}
            isLastAssistant={msg.role === 'assistant' && msg.id === lastAssistantId}
            streamingDomRef={msg.isStreaming ? streamingDomRef : undefined}
            usePlainStreamingText={usePlainStreamingText}
              markdownComponents={markdownComponents}
            cotContent={msg.role === 'assistant' && streamingCotContent != null ? streamingCotContent : undefined}
              cotStreaming={isStreamingMsg && !!streamingCotContent}
              inlineThinkingPlaceholder={inlineThinkingPlaceholder}
              isMobileViewport={isMobileViewport}
            />
            {/* 工具调用卡片：紧跟当前 streaming assistant 消息之后 */}
            {isStreamingMsg && activeTools.length > 0 && (
              <div className="tool-calls-container">
                {activeTools.map((tool) => (
                  <div
                    key={tool.callId}
                    className={`tool-call-card tool-call-card--${tool.state}`}
                  >
                    <div className="tool-call-card__icon">
                      {tool.state === 'executing' && <span className="tool-call-card__spinner" />}
                      {tool.state === 'done' && <span>✅</span>}
                      {tool.state === 'error' && <span>❌</span>}
                    </div>
                    <div className="tool-call-card__content">
                      <span className="tool-call-card__text">
                        {tool.state === 'executing' && <>🔧 正在调用 {getToolDisplayName(tool.tool)}...</>}
                        {tool.state === 'done' && <>✅ {getToolDisplayName(tool.tool)} 完成</>}
                        {tool.state === 'error' && <>❌ {getToolDisplayName(tool.tool)} 失败</>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                  onClick={() => quickSend(pill)}
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef as React.Ref<HTMLDivElement>} style={{ height: 0, margin: 0, padding: 0 }} />
        {/* 底部 spacer：保持较大的支撑，确保发送后用户消息可以顶到上方目标位 */}
        <div style={{ height: '60vh', flexShrink: 0, pointerEvents: 'none' }} aria-hidden />
      </div>
    </div>
  );
};

export default ChatMessageList;
