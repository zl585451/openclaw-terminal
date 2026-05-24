import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import type { TurnFSM } from '../core/turnFSM';
import type { StreamRouter } from '../core/streamRouter';
import { getAssistantVisibleMain } from '../utils/cotExtract';
import { playClickSound, type TypingSoundMode } from '../utils/clickSound';

type OctRuntimeLike = { fsm: TurnFSM; stream: StreamRouter };

type StreamPaintingContext = {
  scrollReconcile: () => void;
  streamSpeedMsRef: React.MutableRefObject<number>;
  typingSound: TypingSoundMode;
  typingSoundVolume: number;
  fullTextRef: React.MutableRefObject<string>;
  streamingDomRef: React.MutableRefObject<HTMLPreElement | null>;
  onVisibleText?: (text: string) => void;
  finalizeStreamingAssistantMessage: (rawText?: string) => void;
  pendingStreamFinalizeRef: React.MutableRefObject<boolean>;
  lastStreamReconcileMsRef: React.MutableRefObject<number>;
  /**
   * When a streaming DOM node is available, the paint loop already writes
   * directly to textContent. Publishing the same text back to React on every
   * tick makes the whole chat tree rerender at typing cadence, which is much
   * more expensive than the DOM write. Keep this opt-in for structured
   * streaming renderers that do not provide a direct DOM sink.
   */
  publishDomTextToReact?: boolean;
};

export function useStreamPainting(
  oct: OctRuntimeLike & { __streamPainting?: StreamPaintingContext },
  _setMessages: React.Dispatch<React.SetStateAction<any[]>>,
  _scrollReconcile: () => void,
) {
  const ctx = oct.__streamPainting;
  if (!ctx) {
    throw new Error('[useStreamPainting] missing __streamPainting context');
  }
  const {
    scrollReconcile,
    streamSpeedMsRef,
    typingSound,
    typingSoundVolume,
    fullTextRef,
    streamingDomRef,
    onVisibleText,
    finalizeStreamingAssistantMessage,
    pendingStreamFinalizeRef,
    lastStreamReconcileMsRef,
    publishDomTextToReact = false,
  } = ctx;

  const streamPaintRafRef = useRef<number | null>(null);
  const streamPaintShownLenRef = useRef(0);
  const streamPaintBudgetRef = useRef(0);
  const streamPaintLastTsRef = useRef(0);
  const lastVisibleTextRef = useRef('');
  const runStreamPaintTickRef = useRef<() => void>(() => {});
  const stopAfterFinalizeRef = useRef(false);

  const publishVisibleText = useCallback((text: string) => {
    if (lastVisibleTextRef.current === text) return;
    lastVisibleTextRef.current = text;
    onVisibleText?.(text);
  }, [onVisibleText]);

  runStreamPaintTickRef.current = () => {
    streamPaintRafRef.current = null;
    const now = performance.now();
    if (!streamPaintLastTsRef.current) streamPaintLastTsRef.current = now;
    const dt = Math.min(80, now - streamPaintLastTsRef.current);
    if (dt < 24 && !pendingStreamFinalizeRef.current) {
      streamPaintRafRef.current = requestAnimationFrame(() => runStreamPaintTickRef.current());
      return;
    }
    streamPaintLastTsRef.current = now;
    const raw = fullTextRef.current;
    const el = streamingDomRef.current;
    const main = getAssistantVisibleMain(raw);
    const targetLen = main.length;
    let shown = streamPaintShownLenRef.current;
    if (shown > targetLen) {
      shown = targetLen;
      streamPaintShownLenRef.current = shown;
    }
    const behind = targetLen - shown;

    if (!el) {
      if (behind > 0) {
        let effectiveMs = Math.max(6, streamSpeedMsRef.current);
        if (!pendingStreamFinalizeRef.current && behind > 80) effectiveMs *= 0.85;
        if (pendingStreamFinalizeRef.current) effectiveMs = Math.max(6, effectiveMs * 0.75);
        streamPaintBudgetRef.current += dt / effectiveMs;
        let step = Math.floor(streamPaintBudgetRef.current);
        if (step <= 0 && streamPaintBudgetRef.current >= 0.82) step = 1;
        step = Math.min(behind, Math.max(0, Math.min(step, 4)));
        if (step > 0) {
          streamPaintBudgetRef.current = Math.max(0, streamPaintBudgetRef.current - step);
          shown = Math.min(targetLen, shown + step);
          streamPaintShownLenRef.current = shown;
          publishVisibleText(main.slice(0, shown));
        }
        streamPaintRafRef.current = requestAnimationFrame(() => runStreamPaintTickRef.current());
        return;
      }
      if (targetLen > 0) {
        publishVisibleText(main);
      }
      if (pendingStreamFinalizeRef.current) {
        finalizeStreamingAssistantMessage(raw);
      }
      return;
    }

    if (behind > 0) {
      // effectiveMs: controls chars/sec via budget accumulation.
      // Deliberately avoid large catch-up multipliers — they make text
      // feel like it "dumps all at once" when the model responds fast.
      let effectiveMs = Math.max(6, streamSpeedMsRef.current);
      // Mild catch-up when far behind (still streaming): slightly faster
      if (!pendingStreamFinalizeRef.current && behind > 80) effectiveMs *= 0.85;
      // After stream ends: finish at a capped speed, not an instant dump
      if (pendingStreamFinalizeRef.current) effectiveMs = Math.max(6, effectiveMs * 0.75);

      streamPaintBudgetRef.current += dt / effectiveMs;
      let step = Math.floor(streamPaintBudgetRef.current);
      if (step <= 0 && streamPaintBudgetRef.current >= 0.82) {
        step = 1;
      }
      // Step cap: 4 chars/tick max — keeps animation visible at any speed setting
      step = Math.min(behind, Math.max(0, Math.min(step, 4)));

      if (step > 0) {
        streamPaintBudgetRef.current = Math.max(0, streamPaintBudgetRef.current - step);
        shown = Math.min(targetLen, shown + step);
        streamPaintShownLenRef.current = shown;
        const visibleText = main.slice(0, shown);
        el.textContent = visibleText;
        if (publishDomTextToReact) publishVisibleText(visibleText);
        if (typingSound !== 'off') {
          for (let i = 0; i < step; i++) {
            playClickSound(typingSound, typingSoundVolume);
          }
        }
      }
    } else if (targetLen > 0) {
      el.textContent = main;
      if (publishDomTextToReact) publishVisibleText(main);
    }

    try {
      const t = performance.now();
      // 略拉长间隔，减轻与 textContent 触发布局在同一帧内叠 getBoundingClientRect 的「拖住」感
      if (t - lastStreamReconcileMsRef.current >= 120) {
        lastStreamReconcileMsRef.current = t;
        scrollReconcile();
      }
    } catch {
      /* ignore */
    }

    const rawEnd = fullTextRef.current;
    const mainEnd = getAssistantVisibleMain(rawEnd).length;
    if (streamPaintShownLenRef.current < mainEnd) {
      streamPaintRafRef.current = requestAnimationFrame(() => runStreamPaintTickRef.current());
      return;
    }

    if (pendingStreamFinalizeRef.current) {
      finalizeStreamingAssistantMessage(rawEnd);
      if (stopAfterFinalizeRef.current) {
        stopAfterFinalizeRef.current = false;
        if (streamPaintRafRef.current != null) {
          cancelAnimationFrame(streamPaintRafRef.current);
          streamPaintRafRef.current = null;
        }
        streamPaintBudgetRef.current = 0;
        streamPaintLastTsRef.current = 0;
        streamPaintShownLenRef.current = 0;
      }
    }
  };

  const startPainting = useCallback(() => {
    if (streamPaintRafRef.current != null) return;
    streamPaintRafRef.current = requestAnimationFrame(() => runStreamPaintTickRef.current());
  }, []);

  const stopPainting = useCallback(() => {
    // If we are finalizing, let the paint loop run to completion and stop itself.
    if (pendingStreamFinalizeRef.current) {
      stopAfterFinalizeRef.current = true;
      startPainting();
      return;
    }
    if (streamPaintRafRef.current != null) {
      cancelAnimationFrame(streamPaintRafRef.current);
      streamPaintRafRef.current = null;
    }
    streamPaintBudgetRef.current = 0;
    streamPaintLastTsRef.current = 0;
    streamPaintShownLenRef.current = 0;
    lastVisibleTextRef.current = '';
    onVisibleText?.('');
  }, [onVisibleText, pendingStreamFinalizeRef, startPainting]);

  useEffect(() => {
    return () => stopPainting();
  }, [stopPainting]);

  return { startPainting, stopPainting };
}

