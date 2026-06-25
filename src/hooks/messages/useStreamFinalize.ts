import React, { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { TurnFSM, TurnPhase } from '../../core/turnFSM';
import { normalizeAssistantTranscriptContent } from '../../utils/cotExtract';
import type { ChatMessage } from '../../ui/chat/chatTypes';
import { finalizeStreamingAssistantBubble } from '../../core/turnStream/streamingBufferOps';

export function recoverOctStreamFromEndFailure(oct: { fsm: TurnFSM }): void {
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

export interface UseStreamFinalizeDeps {
  oct: { fsm: TurnFSM };
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  fullTextRef: MutableRefObject<string>;
  finalizeFallbackTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  pendingStreamFinalizeRef: MutableRefObject<boolean>;
  streamPaintLastRevealTsRef: MutableRefObject<number>;
}

export function useStreamFinalize({
  oct,
  setMessages,
  fullTextRef,
  finalizeFallbackTimerRef,
  pendingStreamFinalizeRef,
  streamPaintLastRevealTsRef,
}: UseStreamFinalizeDeps) {
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
      return finalizeStreamingAssistantBubble(prev, finalRaw);
    });
  }, [oct, setMessages]);

  const scheduleFinalizeFallback = useCallback((rawText?: string) => {
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
    }
    finalizeFallbackTimerRef.current = setTimeout(() => {
      finalizeFallbackTimerRef.current = null;
      // painter 仍在逐字揭示（最近 160ms 内有揭示）→ 顺延兜底，别打断打字机动画。
      // 仅当 painter 真正停止推进时才强制定稿。
      if (performance.now() - streamPaintLastRevealTsRef.current < 160) {
        scheduleFinalizeFallback(rawText);
        return;
      }
      const fallbackRaw = normalizeAssistantTranscriptContent(rawText ?? fullTextRef.current ?? '');
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!(last?.role === 'assistant' && last.isStreaming)) {
          return prev;
        }
        if (fallbackRaw.trim()) {
          return finalizeStreamingAssistantBubble(prev, fallbackRaw);
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

  return { finalizeStreamingAssistantMessage, scheduleFinalizeFallback };
}
