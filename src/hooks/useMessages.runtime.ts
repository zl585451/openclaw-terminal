import { useCallback, useEffect, type MutableRefObject } from 'react';
import { StreamState, type StreamRouter } from '../core/streamRouter';
import { TurnPhase, type TurnFSM } from '../core/turnFSM';
import type { BlockIngest } from '../core/blockIngest';
import { useStreamPainting } from './useStreamPainting';
import type { ChatMessage } from '../ui/chat/chatTypes';
import type { TypingSoundMode } from '../utils/clickSound';
import type React from 'react';
import type { ActivityEntryType } from './useActivityTimeline';
import {
  applyStreamingFinalizeFallback,
  ensureStreamingAssistantMessageState,
  finalizeStreamingAssistantMessages,
  recoverOctStreamFromEndFailure,
  sanitizeAssistantText,
  type ActiveToolState,
} from './useMessages.helpers';

interface UseMessagesRuntimeArgs {
  oct: { fsm: TurnFSM; stream: StreamRouter; ingest: BlockIngest };
  scroll: {
    reconcile: () => void;
  };
  getNextMessageId: () => number;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  streamSpeedMsRef: MutableRefObject<number>;
  typingSound: TypingSoundMode;
  typingSoundVolume: number;
  streamingMessageRef: MutableRefObject<string>;
  fullTextRef: MutableRefObject<string>;
  streamingDomRef: MutableRefObject<HTMLPreElement | null>;
  pendingFullTextSyncRafRef: MutableRefObject<number | null>;
  setStreamingRenderText: React.Dispatch<React.SetStateAction<string>>;
  pendingStreamFinalizeRef: MutableRefObject<boolean>;
  lastStreamReconcileMsRef: MutableRefObject<number>;
  finalizeFallbackTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  roundTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setAwaitingResponse: React.Dispatch<React.SetStateAction<boolean>>;
  setAgentPhase: React.Dispatch<React.SetStateAction<'idle' | 'thinking' | 'typing' | 'tool_executing'>>;
  setActiveTools: React.Dispatch<React.SetStateAction<ActiveToolState[]>>;
  removeTimelineTypes: (types: ActivityEntryType[]) => void;
}

export function useMessagesRuntime({
  oct,
  scroll,
  getNextMessageId,
  setMessages,
  streamSpeedMsRef,
  typingSound,
  typingSoundVolume,
  streamingMessageRef,
  fullTextRef,
  streamingDomRef,
  pendingFullTextSyncRafRef,
  setStreamingRenderText,
  pendingStreamFinalizeRef,
  lastStreamReconcileMsRef,
  finalizeFallbackTimerRef,
  roundTimeoutRef,
  setAwaitingResponse,
  setAgentPhase,
  setActiveTools,
  removeTimelineTypes,
}: UseMessagesRuntimeArgs) {
  const finalizeStreamingAssistantMessage = useCallback((rawText?: string) => {
    const finalRaw = sanitizeAssistantText(rawText ?? fullTextRef.current ?? '');
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
      finalizeFallbackTimerRef.current = null;
    }
    pendingStreamFinalizeRef.current = false;
    try {
      const p = oct.fsm.getPhase();
      if (p === TurnPhase.STREAMING || p === TurnPhase.STREAM_PAUSED) {
        oct.fsm.onStreamEnd();
      }
      if (oct.fsm.getPhase() === TurnPhase.STREAM_COMPLETE) {
        oct.fsm.onRenderDone();
      }
      oct.fsm.onTurnFinish();
    } catch (e) {
      console.warn('[useMessages] fsm.onTurnFinish error, force-resetting to IDLE:', e);
      oct.fsm.resetToIdle();
    }
    oct.ingest.reset();
    setMessages((prev) => finalizeStreamingAssistantMessages(prev, finalRaw));
  }, [finalizeFallbackTimerRef, fullTextRef, oct, pendingStreamFinalizeRef, setMessages]);

  const scheduleFinalizeFallback = useCallback((rawText?: string) => {
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
    }
    finalizeFallbackTimerRef.current = setTimeout(() => {
      finalizeFallbackTimerRef.current = null;
      const fallbackRaw = sanitizeAssistantText(rawText ?? fullTextRef.current ?? '');
      setMessages((prev) => applyStreamingFinalizeFallback(prev, fallbackRaw));
      try {
        recoverOctStreamFromEndFailure(oct);
      } catch {
        /* ignore */
      }
    }, 180);
  }, [finalizeFallbackTimerRef, fullTextRef, oct, setMessages]);

  const { startPainting, stopPainting } = useStreamPainting(
    {
      ...oct,
      __streamPainting: {
        scrollReconcile: scroll.reconcile,
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
    scroll.reconcile,
  );

  const ensureStreamingAssistantMessage = useCallback(() => {
    if (pendingFullTextSyncRafRef.current != null) return;
    pendingFullTextSyncRafRef.current = requestAnimationFrame(() => {
      pendingFullTextSyncRafRef.current = null;
      const buf = fullTextRef.current;
      setMessages((prev) => ensureStreamingAssistantMessageState(prev, getNextMessageId(), Date.now(), buf));
    });
  }, [fullTextRef, getNextMessageId, pendingFullTextSyncRafRef, setMessages]);

  const clearRoundTimeout = useCallback(() => {
    if (roundTimeoutRef.current != null) {
      clearTimeout(roundTimeoutRef.current);
      roundTimeoutRef.current = null;
    }
  }, [roundTimeoutRef]);

  const startRoundTimeout = useCallback(() => {
    clearRoundTimeout();
    roundTimeoutRef.current = setTimeout(() => {
      roundTimeoutRef.current = null;
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
        oct.stream.abortToIdle();
      } catch {}
      try {
        recoverOctStreamFromEndFailure(oct);
      } catch {}
    }, 10 * 60 * 1000);
  }, [
    clearRoundTimeout,
    getNextMessageId,
    oct,
    removeTimelineTypes,
    roundTimeoutRef,
    setActiveTools,
    setAgentPhase,
    setAwaitingResponse,
    setMessages,
  ]);

  useEffect(() => {
    const { stream, ingest } = oct;

    const applyRawToMessages = () => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.isStreaming) {
          return prev.map((m, idx) =>
            idx === prev.length - 1
              ? (m.isStreamingRaw ? m : { ...m, isStreamingRaw: true })
              : m,
          );
        }
        return [
          ...prev,
          {
            id: getNextMessageId(),
            role: 'assistant' as const,
            content: '',
            isStreaming: true,
            isStreamingRaw: true,
            timestamp: Date.now(),
          },
        ];
      });
    };

    const unsubscribe = stream.subscribe((event) => {
      if (event.type === 'tokens') {
        ingest.ingest(event.payload.batch);
        const raw = ingest.getAccumulatedRaw();
        streamingMessageRef.current = raw;
        fullTextRef.current = raw;
        applyRawToMessages();
        startPainting();
      }
      if (event.type === 'state' && event.payload.state === StreamState.COMPLETED) {
        queueMicrotask(() => {
          if (finalizeFallbackTimerRef.current != null) {
            clearTimeout(finalizeFallbackTimerRef.current);
            finalizeFallbackTimerRef.current = null;
          }
          pendingStreamFinalizeRef.current = true;
          stopPainting();
          try { stream.close(); } catch (e) { console.warn('[useMessages] stream.close', e); }
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [
    finalizeFallbackTimerRef,
    fullTextRef,
    getNextMessageId,
    oct,
    pendingStreamFinalizeRef,
    pendingFullTextSyncRafRef,
    setMessages,
    startPainting,
    streamingMessageRef,
    stopPainting,
  ]);

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
  }, [finalizeFallbackTimerRef, roundTimeoutRef, stopPainting]);

  return {
    startPainting,
    stopPainting,
    ensureStreamingAssistantMessage,
    clearRoundTimeout,
    startRoundTimeout,
    scheduleFinalizeFallback,
  };
}
