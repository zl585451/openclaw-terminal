import React, { memo, useEffect, useRef } from 'react';
import type ReactMarkdown from 'react-markdown';
import { type OptionItem, type RenderSegment } from '../../utils/optionBoxParser';
import { getAssistantVisibleMain } from '../../utils/cotExtract';
import OptionBox from '../../components/OptionBox';
import TaskList from '../../components/TaskList';
import QuestionCards from '../../components/QuestionCards';
import ActivityPanel from '../../components/ActivityPanel';
import CoTBlock from '../../components/CoTBlock';
import type { ChatMessage, TurnSegmentLite } from './chatTypes';
import type { ActivityEntry } from '../../hooks/useMessages';
import type { TurnUiState } from '../../core/turnUiState';
import StreamingMarkdownContent from './StreamingMarkdownContent';
import { filterActivityEntriesForInlineTools } from './activityTimelineFilters';
import {
  buildFinalizedTimeline,
  isTurnUiActivityStreaming,
  isTurnUiThinking,
  stripRenderAndPillsMarkers,
  filterExpectedEffect,
} from './messageListHelpers';
import { MsgCopyButton, TypewriterCursor } from './MessageAtoms';
import { ToolGroup } from './InlineToolGroup';
import FinalizedMarkdownContent from './FinalizedMarkdownContent';
import SystemMessage from './SystemMessage';
import { MessageMeta, MessageHeader } from './MessageHeader';

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
      // preamble = 工具调用前的过渡正文，默认折叠成"过程"块，
      // 避免与工具后重新生成的最终答案重复显示（根治调研类重复回复）。
      if (seg.type === 'preamble') {
        out.push(
          <div key={seg.segId} className="inline-preamble inline-preamble-collapsed">
            <CoTBlock content={c} labelOverride="过程" />
          </div>,
        );
        continue;
      }
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

export default ChatMessageItem;
