import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { TurnFSM, deriveLegacyFlags, TurnPhase } from '../core/turnFSM';
import { useWebSocket } from './useWebSocket';
import type { WorkbenchRoundtripContext } from '../workbench/types';
import type { PermissionConfig } from '../utils/permissionCheck';
import type { UseTypewriterReturn } from './useTypewriter';
import type { ChatMessage, UploadedFile } from '../ui/chat/chatTypes';
import type { ClarifyCardSpec } from '../core/clarifyCard/types';
import { getAssistantVisibleMain } from '../utils/cotExtract';
import type { TypingSoundMode } from '../utils/clickSound';
import { useProject } from '../contexts/ProjectContext';
import { useTokenUsage } from './useTokenUsage';
import { useActivityTimeline } from './useActivityTimeline';
import { useStreamPainting } from './useStreamPainting';
import type { ActivityEntry } from './useActivityTimeline';
import { emptyTurnUiState, reduceTurnUi, type TurnUiEvent, type TurnUiState } from '../core/turnUiState';
export type { TurnUiPhase, TurnUiState } from '../core/turnUiState';
export type { ActivityEntryType, ActivityEntry } from './useActivityTimeline';

// ── Util helpers ──────────────────────────────────────────────────────────────
export {
  preferDoneTextWhenMoreComplete,
  shouldSuppressAssistantTextForClarify,
  clearStreamingBubbleContent,
  markExecutingToolEventsStopped,
  finalizeStoppedAssistantMessage,
} from '../core/turnStream/streamingBufferOps';
import { recoverOctStreamFromEndFailure, useStreamFinalize } from './messages/useStreamFinalize';
import { useTurnSegmentRouter } from './messages/useTurnSegmentRouter';
import { useChatStreamRouter } from './messages/useChatStreamRouter';
import { useSendMessage } from './messages/useSendMessage';

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
  // painter 逐字揭示心跳；收尾兜底据此判断 painter 是否仍在推进，避免打断揭示动画
  const streamPaintLastRevealTsRef = useRef(0);
  const pendingSystemReplyMap = useRef<Map<string, boolean>>(new Map());
  const pendingClarifyOpenRef = useRef(false);
  // UI-facing projection for activity/status badges; turnFSM owns lifecycle.
  const turnUiStateRef = useRef<TurnUiState>(emptyTurnUiState());
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
  const { finalizeStreamingAssistantMessage, scheduleFinalizeFallback } = useStreamFinalize({
    oct,
    setMessages,
    fullTextRef,
    finalizeFallbackTimerRef,
    pendingStreamFinalizeRef,
    streamPaintLastRevealTsRef,
  });

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
        lastRevealTsRef: streamPaintLastRevealTsRef,
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

  const { segProtocolActiveRef, resetForNewTurn: resetSegProtocolForNewTurn, handleChatSeg } = useTurnSegmentRouter({
    oct,
    setMessages,
    lastSentRequestId,
    reduceTurnUiRef,
    streamingMessageRef,
    fullTextRef,
    systemReplyBufferRef,
    setStreamingRenderText,
    streamingDomRef,
    setAwaitingResponse,
    setAgentPhase,
    scheduleCotSyncFromFullText,
    startPainting,
    ensureStreamingAssistantMessage,
  });

  const chatStreamRouter = useChatStreamRouter({
    oct,
    setMessages,
    lastSentRequestId,
    segProtocolActiveRef,
    reduceTurnUiRef,
    setAwaitingResponse,
    setAgentPhase,
    pendingSystemReplyMap,
    systemReplyBufferRef,
    streamingMessageRef,
    fullTextRef,
    scheduleCotSyncFromFullText,
    startPainting,
    ensureStreamingAssistantMessage,
    clearRoundTimeout,
    setActiveTools,
    removeTimelineTypes,
    pendingClarifyOpenRef,
    setStreamingRenderText,
    pendingStreamFinalizeRef,
    stopPainting,
    scheduleFinalizeFallback,
    recoverOctStreamFromEndFailure,
    setModelName,
    setFromSystemReply,
    setApiKeyInfo,
    setThinkMode,
    setRuntimeMode,
    setCompactions,
    setQueueInfo,
    getNextMessageId,
    setThinkingElapsed,
    scroll,
    onToolEventTimeline,
    onClarifyOpen,
    onKeepaliveTimeline,
    onUsage,
    setGatewayCapabilities,
  });

  // ── useWebSocket ──────────────────────────────────────────────────────────
  const ws = useWebSocket({
    onChatSeg: handleChatSeg,
    ...chatStreamRouter,
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

  const { sendMessage, quickSend, stopCurrentResponse } = useSendMessage({
    oct,
    setMessages,
    permissions,
    scroll,
    getNextMessageId,
    activeProject,
    typewriter,
    ws,
    lastSentRequestId,
    reduceTurnUiRef,
    resetSegProtocolForNewTurn,
    setThinkMode,
    pendingSystemReplyMap,
    resetUsage,
    resetTimeline,
    streamingMessageRef,
    fullTextRef,
    setStreamingRenderText,
    stopPainting,
    pendingStreamFinalizeRef,
    finalizeFallbackTimerRef,
    setAwaitingResponse,
    setAgentPhase,
    startRoundTimeout,
    setActiveTools,
    resetWithThinkingPlaceholder,
    setPendingPills,
    clearRoundTimeout,
    recoverOctStreamFromEndFailure,
    removeTimelineTypes,
    transportPacingMs,
  });

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
