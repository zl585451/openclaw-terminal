import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { TurnFSM, deriveLegacyFlags, TurnPhase } from '../core/turnFSM';
import { useWebSocket } from './useWebSocket';
import type { WorkbenchRoundtripContext } from '../workbench/types';
import { workbenchBus } from '../workbench/WorkbenchBus';
import { toWorkbenchCommand } from '../workbench/types';
import { guardMessagePermission } from '../utils/permissionCheck';
import type { PermissionConfig } from '../utils/permissionCheck';
import type { UseTypewriterReturn } from './useTypewriter';
import type { ChatMessage, UploadedFile, ToolEventItem } from '../ui/chat/chatTypes';
import type { RenderBlock } from '../types/renderProtocol';
import type { ClarifyCardSpec } from '../core/clarifyCard/types';
import { getAssistantVisibleMain, normalizeAssistantTranscriptContent } from '../utils/cotExtract';
import { emptyTurnSegmentState, orderedSegments, reduceSegmentEvent, type SegmentEvent, type TurnSegment, type TurnSegmentState } from '../core/turnSegments';
import { parseSystemReplyStatus } from '../utils/systemReplyParser';
import { resetSoundCounter, type TypingSoundMode } from '../utils/clickSound';
import { useProject } from '../contexts/ProjectContext';
import { useTokenUsage } from './useTokenUsage';
import { useActivityTimeline } from './useActivityTimeline';
import { useStreamPainting } from './useStreamPainting';
import type { ActivityEntry } from './useActivityTimeline';
import { emptyTurnUiState, reduceTurnUi, type TurnUiEvent, type TurnUiState } from '../core/turnUiState';
export type { TurnUiPhase, TurnUiState } from '../core/turnUiState';
export type { ActivityEntryType, ActivityEntry } from './useActivityTimeline';

// ── Util helpers ──────────────────────────────────────────────────────────────
function isSystemCommand(text: string): boolean {
  const t = (text || '').trim();
  return /^\/\w/.test(t);
}

function recoverOctStreamFromEndFailure(oct: { fsm: TurnFSM }): void {
  try {
    if (oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
      oct.fsm.onToken();                  // → STREAMING
    }
    if (oct.fsm.getPhase() === TurnPhase.STREAM_PAUSED) {
      oct.fsm.onStreamResume();            // → STREAMING
    }
    if (oct.fsm.getPhase() === TurnPhase.STREAMING) {
      oct.fsm.onStreamEnd();              // → STREAM_COMPLETE
    }
    if (oct.fsm.getPhase() === TurnPhase.STREAM_COMPLETE) {
      oct.fsm.onRenderDone();             // → RENDER_COMPLETE
    }
    oct.fsm.onTurnFinish();               // → TURN_FINISHED → IDLE
  } catch (e) {
    console.warn('[useMessages] recoverOctStreamFromEndFailure', e);
    oct.fsm.resetToIdle();                // last-resort force reset
  }
}

export function preferDoneTextWhenMoreComplete(currentRaw: string, doneText: string): string {
  const current = currentRaw || '';
  const done = doneText || '';
  if (!done.trim()) return current;
  if (!current.trim()) return done;
  if (done.length > current.length) return done;
  return current;
}

export function shouldSuppressAssistantTextForClarify(pendingClarifyOpen: boolean, doneText: string): boolean {
  return pendingClarifyOpen && !String(doneText || '').trim();
}

// 段协议内部重置：新正文段接管显示时清空最后一个流式 assistant 气泡正文。
// 仍保留气泡本身、工具卡片和段快照，避免上一轮正文与最终答案在同一气泡里累加重复。
export function clearStreamingBubbleContent<T extends { role: string; isStreaming?: boolean; content?: string }>(
  messages: T[],
): T[] {
  const last = messages[messages.length - 1];
  if (last?.role === 'assistant' && last.isStreaming) {
    return messages.map((m, i) =>
      i === messages.length - 1 ? { ...m, content: '' } : m,
    );
  }
  return messages;
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ActiveTool {
  callId: string;
  tool: string;
  state: 'executing' | 'done' | 'error';
  resultPreview?: string;
}

export interface GatewayCapabilities {
  model?: string;
  toolsSupport?: 'supported' | 'unknown' | 'unsupported';
  capabilitySource?: string;
  supportsTools?: boolean;
  supportsStreamOptions?: boolean;
  mcpReady?: boolean;
  mcpServers?: number;
  mcpConnectedServers?: number;
}

export interface UseMessagesOptions {
  oct: { fsm: TurnFSM };
  typewriter: UseTypewriterReturn;
  scroll: {
    reconcile: () => void;
    scrollAfterUserSend: () => void;
  };
  getNextMessageId: () => number;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  permissions: PermissionConfig;
  streamSpeedMs: number;
  typingSound: TypingSoundMode;
  typingSoundVolume: number;
  onStatusChange?: (
    wsConnected: boolean,
    isStreaming: boolean,
    modelName?: string,
    tokenIn?: number | null,
    tokenOut?: number | null,
    ctxUsed?: number | null,
    ctxMax?: number | null,
  ) => void;
  onClarifyOpen?: (spec: ClarifyCardSpec) => void;
}

export interface UseMessagesReturn {
  wsConnected: boolean;
  wsReconnecting: boolean;
  wsError: string | null;
  memoryOnline: boolean;
  fsmPhase: TurnPhase;
  isStreaming: boolean;
  awaitingResponse: boolean;
  agentPhase: 'idle' | 'thinking' | 'typing' | 'tool_executing';
  turnUiState: TurnUiState;
  thinkingElapsed: number;
  activeTools: ActiveTool[];
  activityTimeline: ActivityEntry[];
  gatewayCapabilities: GatewayCapabilities | null;
  tokenIn: number | null;
  tokenOut: number | null;
  ctxUsed: number | null;
  ctxMax: number | null;
  modelName: string;
  thinkMode: string;
  pendingPills: string[] | null;
  streak: number;
  fullTextRef: MutableRefObject<string>;
  streamingRenderText: string;
  streamingDomRef: MutableRefObject<HTMLPreElement | null>;
  sendMessage: (text: string, imageDataUrl: string | null, files?: UploadedFile[], workbenchContext?: WorkbenchRoundtripContext) => Promise<void>;
  quickSend: (content: string) => void;
  stopCurrentResponse: () => Promise<void>;
}

export function useMessages({
  oct,
  typewriter,
  scroll,
  getNextMessageId,
  messages,
  setMessages,
  permissions,
  streamSpeedMs,
  typingSound,
  typingSoundVolume,
  onStatusChange,
  onClarifyOpen,
}: UseMessagesOptions): UseMessagesReturn {
  const transportPacingMs = 4;
  const { activeProject } = useProject();
  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
  const streamSpeedMsRef = useRef(streamSpeedMs);
  streamSpeedMsRef.current = streamSpeedMs;
  // ── State ─────────────────────────────────────────────────────────────────
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [agentPhase, setAgentPhase] = useState<'idle' | 'thinking' | 'typing' | 'tool_executing'>('idle');
  const [turnUiState, setTurnUiState] = useState<TurnUiState>(() => emptyTurnUiState());
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const [gatewayCapabilities, setGatewayCapabilities] = useState<GatewayCapabilities | null>(null);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [, setApiKeyInfo] = useState<string>('--');
  const [thinkMode, setThinkMode] = useState<string>('off');
  const [, setRuntimeMode] = useState<string>('direct');
  const [, setCompactions] = useState<number | null>(null);
  const [, setQueueInfo] = useState<string>('--');
  const [modelName, setModelName] = useState('--');
  const [pendingPills, setPendingPills] = useState<string[] | null>(null);
  const [fsmPhase, setFsmPhase] = useState(() => oct.fsm.getPhase());
  const [streamingRenderText, setStreamingRenderText] = useState('');
  /** 流式阶段 reconcile 每帧调用会引发大量 layout；限制频率 */
  const lastStreamReconcileMsRef = useRef(0);
  const {
    tokenIn,
    tokenOut,
    ctxUsed,
    ctxMax,
    onUsage,
    resetUsage,
    setFromSystemReply,
  } = useTokenUsage();
  const {
    activityTimeline,
    onToolEvent: onToolEventTimeline,
    onKeepalive: onKeepaliveTimeline,
    resetTimeline,
    resetWithThinkingPlaceholder,
    removeTypes: removeTimelineTypes,
    scheduleCotSyncFromFullText,
  } = useActivityTimeline(messages);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const streamingMessageRef = useRef('');
  const fullTextRef = useRef<string>('');
  const streamingDomRef = useRef<HTMLPreElement | null>(null);
  const pendingFullTextSyncRafRef = useRef<number | null>(null);
  const pendingStreamFinalizeRef = useRef(false);
  const finalizeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSystemReplyMap = useRef<Map<string, boolean>>(new Map());
  const pendingClarifyOpenRef = useRef(false);
  // B2/B3: 段协议状态——按 turnId 累积段。B3 起接管显示。
  const turnSegmentsRef = useRef<{ turnId?: string; state: TurnSegmentState }>({
    state: emptyTurnSegmentState(),
  });
  // UI-facing projection for activity/status badges; turnFSM owns lifecycle.
  const turnUiStateRef = useRef<TurnUiState>(emptyTurnUiState());
  // 当前回合是否有段事件到达（有则以段驱动显示，无则兜底走旧扁平流路径）。
  const segProtocolActiveRef = useRef(false);
  const lastSentRequestId = useRef<string>('');
  const systemReplyBufferRef = useRef('');
  const roundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ROUND_TIMEOUT_MS = 10 * 60 * 1000;
  // ── isStreaming (memo) ────────────────────────────────────────────────────
  const isStreaming = useMemo(() => {
    const lf = deriveLegacyFlags(fsmPhase);
    const last = messages[messages.length - 1];
    return (
      lf.isStreaming ||
      lf.isRendering ||
      (!!last?.isStreaming && last.role === 'assistant')
    );
  }, [fsmPhase, messages]);
  const finalizeStreamingAssistantMessage = useCallback((rawText?: string) => {
    const finalRaw = normalizeAssistantTranscriptContent(rawText ?? fullTextRef.current ?? '');
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
      finalizeFallbackTimerRef.current = null;
    }
    pendingStreamFinalizeRef.current = false;
    // Advance FSM through any intermediate states that may have been skipped,
    // then complete the turn. If anything throws, force-reset to IDLE so the
    // next turn can start cleanly.
    try {
      if (oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
        oct.fsm.onToken();        // → STREAMING
      }
      if (oct.fsm.getPhase() === TurnPhase.STREAM_PAUSED) {
        oct.fsm.onStreamResume(); // → STREAMING
      }
      if (oct.fsm.getPhase() === TurnPhase.STREAMING) {
        oct.fsm.onStreamEnd();    // → STREAM_COMPLETE
      }
      if (oct.fsm.getPhase() === TurnPhase.STREAM_COMPLETE) {
        oct.fsm.onRenderDone();   // → RENDER_COMPLETE
      }
      oct.fsm.onTurnFinish();     // → TURN_FINISHED → IDLE
    } catch (e) {
      console.warn('[useMessages] fsm.onTurnFinish error, force-resetting to IDLE:', e);
      oct.fsm.resetToIdle();
    }
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.isStreaming) {
        return prev.map((msg, idx) =>
          idx === prev.length - 1
            ? { ...msg, content: finalRaw || msg.content, isStreaming: false, isStreamingRaw: false }
            : msg
        );
      }
      return prev;
    });
  }, [oct, setMessages]);

  const scheduleFinalizeFallback = useCallback((rawText?: string) => {
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
    }
    finalizeFallbackTimerRef.current = setTimeout(() => {
      finalizeFallbackTimerRef.current = null;
      const fallbackRaw = normalizeAssistantTranscriptContent(rawText ?? fullTextRef.current ?? '');
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!(last?.role === 'assistant' && last.isStreaming)) {
          return prev;
        }
        if (fallbackRaw.trim()) {
          return prev.map((msg, idx) =>
            idx === prev.length - 1
              ? { ...msg, content: fallbackRaw, isStreaming: false, isStreamingRaw: false }
              : msg
          );
        }
        return prev.filter((_, idx) => idx !== prev.length - 1);
      });
      try {
        recoverOctStreamFromEndFailure(oct);
      } catch {
        /* ignore */
      }
    }, 180);
  }, [oct, setMessages]);

  const { startPainting, stopPainting } = useStreamPainting(
    {
      ...oct,
      __streamPainting: {
        scrollReconcile: scrollRef.current.reconcile,
        streamSpeedMsRef,
        typingSound,
        typingSoundVolume,
        fullTextRef,
        streamingDomRef,
        onVisibleText: setStreamingRenderText,
        finalizeStreamingAssistantMessage,
        pendingStreamFinalizeRef,
        lastStreamReconcileMsRef,
      },
    },
    setMessages,
    scrollRef.current.reconcile,
  );

  // ── ensureStreamingAssistantMessage ───────────────────────────────────────
  const ensureStreamingAssistantMessage = useCallback(() => {
    if (pendingFullTextSyncRafRef.current != null) return;
    pendingFullTextSyncRafRef.current = requestAnimationFrame(() => {
      pendingFullTextSyncRafRef.current = null;
      const buf = fullTextRef.current;
      const visibleMain = getAssistantVisibleMain(buf);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          return prev;
        }
        if (!visibleMain || !visibleMain.trim()) return prev;
        return [
          ...prev,
          {
            id: getNextMessageId(),
            role: 'assistant' as const,
            content: buf,
            isStreaming: true,
            timestamp: Date.now(),
          },
        ];
      });
    });
  }, [getNextMessageId, setMessages]);

  const clearRoundTimeout = useCallback(() => {
    if (roundTimeoutRef.current != null) {
      clearTimeout(roundTimeoutRef.current);
      roundTimeoutRef.current = null;
    }
  }, []);

  const reduceTurnUiRef = useCallback((event: TurnUiEvent) => {
    setTurnUiState((current) => {
      const next = reduceTurnUi(current, event);
      turnUiStateRef.current = next;
      return next;
    });
  }, []);

  const startRoundTimeout = useCallback(() => {
    clearRoundTimeout();
    roundTimeoutRef.current = setTimeout(() => {
      roundTimeoutRef.current = null;
      reduceTurnUiRef({ kind: 'error', message: 'Round timed out' });
      setAwaitingResponse(false);
      setAgentPhase('idle');
      setActiveTools([]);
      removeTimelineTypes(['keepalive_hint']);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const timeoutText = '⏱️ 本轮请求超时（10 分钟），已自动结束。你可以重试，或先让我用不依赖工具的方式回答。';
        if (last?.role === 'assistant' && last.isStreaming) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              isStreaming: false,
              isStreamingRaw: false,
              content: timeoutText,
              isSystemReply: true,
              timestamp: Date.now(),
            },
          ];
        }
        return [
          ...prev,
          {
            id: getNextMessageId(),
            role: 'assistant' as const,
            content: timeoutText,
            isStreaming: false,
            isSystemReply: true,
            timestamp: Date.now(),
          },
        ];
      });
      try {
        recoverOctStreamFromEndFailure(oct);
      } catch {}
    }, ROUND_TIMEOUT_MS);
  }, [ROUND_TIMEOUT_MS, clearRoundTimeout, getNextMessageId, oct, reduceTurnUiRef, setMessages]);

  // ── useWebSocket ──────────────────────────────────────────────────────────
  const ws = useWebSocket({
    onChatSeg: (seg, turnId) => {
      const currentTurnId = lastSentRequestId.current;
      if (turnId && currentTurnId && turnId !== currentTurnId) return;
      // 新回合：重置段状态
      const slot = turnSegmentsRef.current;
      if (turnId && slot.turnId !== turnId) {
        slot.turnId = turnId;
        slot.state = emptyTurnSegmentState();
      }
      slot.state = reduceSegmentEvent(slot.state, seg as unknown as SegmentEvent);

      // ── B3 渲染切换 ────────────────────────────────────────────────────────
      const s = seg as unknown as SegmentEvent;
      if (s.op === 'delta') {
        const activeSeg = slot.state.segments[s.segId] as TurnSegment | undefined;
        if (activeSeg && (activeSeg.type === 'text' || activeSeg.type === 'final')) {
          reduceTurnUiRef({ kind: 'seg_text_delta' });
        }
      }

      // 新可见正文段开启：段协议激活 + 如果已有旧正文段则清空显示（自动 reset）
      if (s.op === 'open' && (s.type === 'text' || s.type === 'final')) {
        segProtocolActiveRef.current = true;
        const newSegId = s.segId;
        const hasOlderTextSeg = slot.state.order
          .filter((id) => id !== newSegId)
          .some((id) => {
            const prior = slot.state.segments[id] as TurnSegment | undefined;
            return prior?.type === 'text' || prior?.type === 'final';
          });
        if (hasOlderTextSeg) {
          // 工具调用后新一轮文字段开始——清空流式气泡正文，等最终答案填充
          streamingMessageRef.current = '';
          fullTextRef.current = '';
          systemReplyBufferRef.current = '';
          setStreamingRenderText('');
          if (streamingDomRef.current) {
            try { streamingDomRef.current.textContent = ''; } catch {}
          }
          setMessages((prev) => clearStreamingBubbleContent(prev));
        }
      }

      // 正文段增量：用段内容驱动 fullTextRef（跨段永不拼接）
      if (s.op === 'delta') {
        const activeSeg = slot.state.segments[s.segId] as TurnSegment | undefined;
        if (activeSeg && (activeSeg.type === 'text' || activeSeg.type === 'final')) {
          setAwaitingResponse(false);
          setAgentPhase('typing');
          // 只取本段内容——不跨段累加，这正是根治重复的关键
          fullTextRef.current = activeSeg.content;
          streamingMessageRef.current = activeSeg.content;
          scheduleCotSyncFromFullText(fullTextRef.current);
          if (oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
            try { oct.fsm.onToken(); } catch {}
          }
          startPainting();
          ensureStreamingAssistantMessage();
        }
      }

      // ── B3 inline：段边界（开/合）时把有序段快照挂到流式气泡 ───────────────
      // 仅在结构变化时更新（非每字），驱动 inline 工具卡片在正文流中按序渲染。
      if (s.op === 'open' || s.op === 'close') {
        const snapshot = orderedSegments(slot.state).map((seg2) => ({
          segId: seg2.segId,
          index: seg2.index,
          type: seg2.type,
          content: seg2.content,
          open: seg2.open,
          ...(seg2.meta ? { meta: seg2.meta } : {}),
        }));
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!(last?.role === 'assistant' && last.isStreaming)) return prev;
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, turnSegments: snapshot } : m,
          );
        });
      }
    },
    onChatDelta: (content, isDelta, isSystemReply, turnId) => {
      const currentTurnId = lastSentRequestId.current;
      if (turnId && currentTurnId && turnId !== currentTurnId) return;
      if (!content) return;
      // B3：段协议激活时，文字增量由 onChatSeg 驱动，跳过扁平流处理（防双写）。
      // done=false 的 delta 跳过；done=true（最终文本快照）仍走下面 onChatDone 处理。
      if (!isSystemReply && isDelta && segProtocolActiveRef.current) return;
      if (!isSystemReply) {
        if (isDelta) reduceTurnUiRef({ kind: 'seg_text_delta' });
        setAwaitingResponse(false);
        if (isDelta) setAgentPhase('typing');
      }

      const pendingSystemReplyKey = turnId || currentTurnId;
      const pendingSysDelta = isSystemReply || (pendingSystemReplyMap.current.get(pendingSystemReplyKey) ?? false);
      if (pendingSysDelta) {
        systemReplyBufferRef.current = isDelta
          ? systemReplyBufferRef.current + content
          : content;
        // 系统命令只保留一份最终输出，不走流式占位，避免重复渲染。
      } else {
        if (isDelta) {
          streamingMessageRef.current += content;
        } else {
          streamingMessageRef.current = content;
        }
        fullTextRef.current = streamingMessageRef.current;

        scheduleCotSyncFromFullText(fullTextRef.current);

        if (isDelta && oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
          try { oct.fsm.onToken(); } catch {}
        }

        startPainting();
        ensureStreamingAssistantMessage();
      }
    },

    onChatDone: (content, systemReplyHint, turnId, renderBlocks?: RenderBlock[]) => {
      const currentRequestId = lastSentRequestId.current;
      if (turnId && currentRequestId && turnId !== currentRequestId) return;
      clearRoundTimeout();
      const systemReplyKey = turnId || currentRequestId;
      const systemReply = systemReplyHint || (pendingSystemReplyMap.current.get(systemReplyKey) ?? false);
      pendingSystemReplyMap.current.delete(systemReplyKey);

      if (!systemReply) {
        reduceTurnUiRef({ kind: 'done' });
        setAwaitingResponse(false);
        setAgentPhase('idle');
        setActiveTools([]);
        removeTimelineTypes(['keepalive_hint', 'thinking_placeholder']);
      }

      if (!systemReply) {
        const shouldSuppressClarifyText = shouldSuppressAssistantTextForClarify(
          pendingClarifyOpenRef.current,
          content,
        );
        pendingClarifyOpenRef.current = false;
        if (shouldSuppressClarifyText) {
          streamingMessageRef.current = '';
          fullTextRef.current = '';
          setStreamingRenderText('');
          pendingStreamFinalizeRef.current = false;
          stopPainting();
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last.isStreaming) {
              return prev.slice(0, -1);
            }
            return prev;
          });
          recoverOctStreamFromEndFailure(oct);
          return;
        }
        const fallbackText = normalizeAssistantTranscriptContent(String(content || '').trim());
        // B3：段协议激活时信任 fullTextRef（段派生，仅含最终答案段）。
        // 旧路径的 done.content 是所有轮次正文的拼接，用它覆盖会把工具前正文带回来。
        const finalText = segProtocolActiveRef.current
          ? (fullTextRef.current || fallbackText)
          : preferDoneTextWhenMoreComplete(fullTextRef.current, fallbackText);
        if (finalText !== fullTextRef.current) {
          streamingMessageRef.current = finalText;
          fullTextRef.current = finalText;
          ensureStreamingAssistantMessage();
        }
        pendingStreamFinalizeRef.current = true;
        stopPainting();
        scheduleFinalizeFallback(finalText);
        return;
      }

      let finalStreamContent = systemReplyBufferRef.current || content;
      systemReplyBufferRef.current = '';
      if (finalStreamContent) {
        if (!systemReply) {
          streamingMessageRef.current = finalStreamContent;
          fullTextRef.current = finalStreamContent;
        }
      }

      const text = finalStreamContent;
      if (systemReply && text.startsWith('🦞')) {
        const status = parseSystemReplyStatus(text);
        if (status.modelName) setModelName(status.modelName);
        if (status.tokenIn != null || status.ctxMax != null || status.ctxUsed != null) {
          setFromSystemReply({
            ...(status.tokenIn != null ? { tokenIn: status.tokenIn } : {}),
            ...(status.ctxMax != null ? { ctxMax: status.ctxMax } : {}),
            ...(status.ctxUsed != null ? { ctxUsed: status.ctxUsed } : {}),
          });
        }
        if (status.apiKeyInfo) setApiKeyInfo(status.apiKeyInfo);
        if (status.thinkMode) setThinkMode(status.thinkMode);
        if (status.runtimeMode) setRuntimeMode(status.runtimeMode);
        if (status.compactions != null) setCompactions(status.compactions);
        if (status.queueInfo) setQueueInfo(status.queueInfo);
      }

      setMessages((prev) => {
        const cleanedPrev = systemReply
          ? prev.filter((msg) => !(msg.role === 'assistant' && msg.isStreaming))
          : prev;
        const last = cleanedPrev[cleanedPrev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          return cleanedPrev.map((msg, idx) =>
            idx === cleanedPrev.length - 1
              ? { ...msg, content: finalStreamContent, isStreaming: false, renderBlocks }
              : msg
          );
        }
        if (finalStreamContent) {
          const textContent = finalStreamContent.trim();
          if (!textContent) return cleanedPrev;
          if (last?.role === 'assistant' && !last.isStreaming && last.content?.trim() === textContent) {
            return cleanedPrev;
          }
          return [
            ...cleanedPrev,
            {
              id: getNextMessageId(),
              role: 'assistant' as const,
              content: textContent,
                isStreaming: false,
                isSystemReply: systemReply,
                timestamp: Date.now(),
                renderBlocks,
              },
          ];
        }
        return cleanedPrev;
      });
    },

    onAgentPhase: (phase, elapsed) => {
      reduceTurnUiRef({ kind: 'agent_phase', phase });
      setAgentPhase(phase);
      if (phase === 'thinking' && elapsed != null) setThinkingElapsed(elapsed);
      if (phase === 'idle' || phase === 'typing') setThinkingElapsed(0);
    },

    onToolEvent: (payload) => {
      if (payload.type === 'tool_call') {
        reduceTurnUiRef({ kind: 'tool_call' });
        setActiveTools((prev) => {
          const next = [
            ...prev,
            { callId: payload.callId, tool: payload.tool, state: 'executing' as const },
          ];
          if (prev.length === 0 && next.length > 0) {
            requestAnimationFrame(() => { scroll.reconcile(); });
          }
          return next;
        });
        // 同步写入当前 streaming 消息的 toolEvents
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          const last = prev[lastIdx];
          if (!last || last.role !== 'assistant' || !last.isStreaming) return prev;
          const newEvent: ToolEventItem = {
            callId: payload.callId || payload.tool + '_' + Date.now(),
            tool: payload.tool,
            args: payload.args as Record<string, unknown> | undefined,
            state: 'executing',
            startedAt: Date.now(),
          };
          return [...prev.slice(0, lastIdx), { ...last, toolEvents: [...(last.toolEvents || []), newEvent] }];
        });
        onToolEventTimeline(payload);
      } else if (payload.type === 'tool_result') {
        const finalState = (payload.state === 'error' ? 'error' : 'done') as 'done' | 'error';
        reduceTurnUiRef(
          finalState === 'error'
            ? { kind: 'error', message: payload.error || 'Tool failed' }
            : { kind: 'tool_result' },
        );
        setActiveTools((prev) =>
          prev.map((t) =>
            t.callId === payload.callId
              ? { ...t, state: finalState, resultPreview: payload.resultPreview }
              : t
          )
        );
        // 同步更新消息里对应卡片的状态
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          const last = prev[lastIdx];
          if (!last || last.role !== 'assistant' || !last.toolEvents?.length) return prev;
          const updatedEvents = last.toolEvents.map((evt) =>
            evt.callId !== payload.callId ? evt : {
              ...evt,
              state: finalState,
              resultPreview: payload.resultPreview,
              error: payload.error,
              elapsedMs: payload.elapsedMs,
            }
          );
          return [...prev.slice(0, lastIdx), { ...last, toolEvents: updatedEvents }];
        });
        onToolEventTimeline(payload);
      }
    },

    onClarifyOpen: (spec) => {
      reduceTurnUiRef({ kind: 'clarify' });
      pendingClarifyOpenRef.current = true;
      onClarifyOpen?.(spec);
    },

    onKeepalive: (payload) => {
      reduceTurnUiRef({ kind: 'keepalive', phase: payload?.phase });
      onKeepaliveTimeline(payload);
    },

    onWorkbenchEvent: (event) => {
      workbenchBus.dispatch(toWorkbenchCommand(event));
    },

    onUsage: (usage, isSnapshot) => {
      onUsage(usage, isSnapshot);
    },

    onModelName: (name) => setModelName(name),
    onGatewayCapabilities: (caps) => {
      setGatewayCapabilities(caps);
      if (caps?.model) setModelName(caps.model);
    },
  });

  // ── FSM subscribe ─────────────────────────────────────────────────────────
  useEffect(() => {
    return oct.fsm.subscribe((phase) => {
      setFsmPhase(phase);
    });
  }, [oct.fsm]);

  // ── pendingPills: reset on messages change ────────────────────────────────
  useEffect(() => {
    setPendingPills(null);
  }, [messages]);

  // ── onStatusChange notification ───────────────────────────────────────────
  useEffect(() => {
    onStatusChange?.(ws.wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax);
  }, [ws.wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax, onStatusChange]);

  // ── cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (roundTimeoutRef.current != null) {
        clearTimeout(roundTimeoutRef.current);
        roundTimeoutRef.current = null;
      }
      if (finalizeFallbackTimerRef.current != null) {
        clearTimeout(finalizeFallbackTimerRef.current);
        finalizeFallbackTimerRef.current = null;
      }
      stopPainting();
    };
  }, [stopPainting]);

  const stopCurrentResponse = useCallback(async () => {
    clearRoundTimeout();
    reduceTurnUiRef({ kind: 'cancel' });
    setAwaitingResponse(false);
    setAgentPhase('idle');
    setActiveTools([]);
    removeTimelineTypes(['keepalive_hint', 'thinking_placeholder']);
    stopPainting();
    pendingStreamFinalizeRef.current = false;
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
      finalizeFallbackTimerRef.current = null;
    }
    try {
      if (oct.fsm.getPhase() !== TurnPhase.IDLE) {
        oct.fsm.onCancel();
      }
    } catch (e) {
      console.warn('[useMessages] stopCurrentResponse local cleanup', e);
      try { oct.fsm.resetToIdle(); } catch {}
    }
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!(last?.role === 'assistant' && last.isStreaming)) return prev;
      const content = typeof last.content === 'string' && last.content.trim()
        ? last.content
        : '已停止当前任务。';
      return prev.map((msg, idx) =>
        idx === prev.length - 1
          ? { ...msg, content, isStreaming: false, isStreamingRaw: false }
          : msg,
      );
    });
    const result = await ws.cancel();
    if (!result?.success) {
      console.warn('[useMessages] cancel failed:', result);
    }
  }, [clearRoundTimeout, oct, reduceTurnUiRef, removeTimelineTypes, setMessages, stopPainting, ws]);

  async function _sendMessageCore(options: {
    text: string;
    displayContent: string;
    fullContentForAMY: string;
    isSystem: boolean;
    newRequestId: string;
    imageDataUrl?: string;
    files?: UploadedFile[];
    workbenchContext?: WorkbenchRoundtripContext;
  }): Promise<void> {
    const {
      text,
      displayContent,
      fullContentForAMY,
      isSystem,
      newRequestId,
      imageDataUrl,
      files,
      workbenchContext,
    } = options;

    lastSentRequestId.current = newRequestId;
    reduceTurnUiRef({ kind: 'submit', turnId: newRequestId });
    segProtocolActiveRef.current = false; // B3：新回合重置，等第一个 seg 事件激活
    const thinkCmdMatch = text.trim().match(/^\/(?:think|cot)\s+(off|low|medium|high)\b/i);
    if (thinkCmdMatch) setThinkMode(thinkCmdMatch[1].toLowerCase());
    pendingSystemReplyMap.current.set(newRequestId, isSystem);
    resetUsage();
    resetTimeline();
    streamingMessageRef.current = '';
    fullTextRef.current = '';
    setStreamingRenderText('');
    stopPainting();
    pendingStreamFinalizeRef.current = false;
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
      finalizeFallbackTimerRef.current = null;
    }
    typewriter.reset();
    resetSoundCounter();
    if (!isSystem) {
      setAwaitingResponse(true);
      setAgentPhase('thinking');
      startRoundTimeout();
    }
    setActiveTools([]);
    resetWithThinkingPlaceholder();
    setPendingPills(null);
    setMessages((prev) => {
      const next: ChatMessage[] = [
        ...prev,
        {
          id: getNextMessageId(),
          role: 'user' as const,
          content: displayContent,
          timestamp: Date.now(),
          imageDataUrl: imageDataUrl || undefined,
          files: files,
        },
      ];
      if (!isSystem) {
        next.push({
          id: getNextMessageId(),
          role: 'assistant' as const,
          content: '',
          isStreaming: true,
          isStreamingRaw: true,
          timestamp: Date.now(),
        });
      }
      return next;
    });
    scroll.scrollAfterUserSend();

    if (!isSystem) {
      try {
        if (oct.fsm.getPhase() !== TurnPhase.IDLE) {
          oct.fsm.onCancel();   // STREAMING/… → CANCELLED → IDLE
        }
        oct.fsm.onUserTyping();
        oct.fsm.onUserSubmit();
        oct.fsm.onRequestStart();
        oct.fsm.onStreamOpen();
      } catch (e) {
        console.warn('[useMessages] oct runtime (_sendMessageCore)', e);
      }
    }

    const roundtripContext = workbenchContext ?? workbenchBus.getContext('continue');
    const result = await ws.send(
      fullContentForAMY,
      imageDataUrl,
      files,
      transportPacingMs,
      roundtripContext,
      newRequestId,
      activeProject,
    );
    if (!result?.success && !isSystem) {
      clearRoundTimeout();
      reduceTurnUiRef({ kind: 'error', message: result?.error || 'Send failed' });
      setAwaitingResponse(false);
      console.warn('[useMessages] Send failed:', result);
      try {
        if (oct.fsm.getPhase() !== TurnPhase.IDLE) {
          oct.fsm.onError();
        }
      } catch (e) {
        console.warn('[useMessages] send failed cleanup', e);
        recoverOctStreamFromEndFailure(oct);
      }
    }
  }

  // ── sendMessage ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (
    text: string,
    imageDataUrl: string | null,
    files?: UploadedFile[],
    workbenchContext?: WorkbenchRoundtripContext
  ) => {
    if (!text.trim() && !imageDataUrl && !files?.length) return;

    const displayText = text.trim();
    let gatewayPayloadText = text;
    let fileRefs = '';

    if (files && files.length > 0) {
      fileRefs = '\n\n[附件]' + files.map((f) => {
        const size = f.size < 1024 ? `${f.size}B` : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)}KB` : `${(f.size / (1024 * 1024)).toFixed(1)}MB`;
        if (f.path) return `\n- ${f.name} (${size}): ${f.path}`;
        if (f.isText && f.content) return `\n\`\`\`${f.ext}\n${f.content}\n\`\`\``;
        return `\n- ${f.name} (${size}) [无路径]`;
      }).join('');
    }

    const fullContentForAMY = gatewayPayloadText + fileRefs;
    const displayContent = displayText + (files && files.length > 0 ? `${displayText ? '\n\n' : ''}📎 ` + files.map((f) => f.name).join(', ') : '');

    if (!guardMessagePermission(fullContentForAMY, permissions)) return;

    const cmdIsSystem = !imageDataUrl && !files?.length && isSystemCommand(fullContentForAMY);
    await _sendMessageCore({
      text: fullContentForAMY,
      displayContent,
      fullContentForAMY,
      isSystem: cmdIsSystem,
      newRequestId: Date.now().toString(),
      imageDataUrl: imageDataUrl || undefined,
      files,
      workbenchContext,
    });
  }, [activeProject, getNextMessageId, permissions, scroll.scrollAfterUserSend, oct, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── quickSend ─────────────────────────────────────────────────────────────
  const quickSend = useCallback((content: string) => {
    if (!content.trim()) return;

    if (!guardMessagePermission(content.trim(), permissions)) return;

    const isSystem = isSystemCommand(content.trim());
    void _sendMessageCore({
      text: content.trim(),
      displayContent: content.trim(),
      fullContentForAMY: content.trim(),
      isSystem,
      newRequestId: Date.now().toString(),
    });
  }, [activeProject, getNextMessageId, permissions, scroll.scrollAfterUserSend, oct, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    wsConnected: ws.wsConnected,
    wsReconnecting: ws.wsReconnecting,
    wsError: ws.wsError,
    memoryOnline: ws.memoryOnline,
    fsmPhase,
    isStreaming,
    awaitingResponse,
    agentPhase,
    turnUiState,
    thinkingElapsed,
    activeTools,
    activityTimeline,
    gatewayCapabilities,
    tokenIn,
    tokenOut,
    ctxUsed,
    ctxMax,
    modelName,
    thinkMode,
    pendingPills,
    streak: 0,
    fullTextRef,
    streamingRenderText,
    streamingDomRef,
    sendMessage,
    quickSend,
    stopCurrentResponse,
  };
}
