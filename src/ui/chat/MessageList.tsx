import React, { useState, useRef, useCallback, memo, useLayoutEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { parseOptionBox } from '../../utils/optionBoxParser';
import { hasAssistantCotMarkers } from '../../utils/cotExtract';
import CoTBlock from '../../components/CoTBlock';
import { useSettings } from '../../contexts/SettingsContext';
import type { ChatMessage } from './chatTypes';
import type { ActivityEntry } from '../../hooks/useMessages';
import type { TurnUiState } from '../../core/turnUiState';
import { useMsgParse } from '../../hooks/useMsgParse';
import {
  getTurnUiBadgeLabel,
  isTurnUiThinking,
} from './messageListHelpers';
import ChatMessageItem from './ChatMessageItem';

const MAX_BOTTOM_SPACER_VIEWPORT_RATIO = 0.6;

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
