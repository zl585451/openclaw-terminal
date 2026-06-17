import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import type { TurnFSM } from '../core/turnFSM';
import { getAssistantVisibleMain } from '../utils/cotExtract';
import { playClickSound, type TypingSoundMode } from '../utils/clickSound';

type OctRuntimeLike = { fsm: TurnFSM };

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
    typingSound,
    typingSoundVolume,
    fullTextRef,
    streamingDomRef,
    onVisibleText,
    finalizeStreamingAssistantMessage,
    pendingStreamFinalizeRef,
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
    if (dt < 16 && !pendingStreamFinalizeRef.current) {
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
        shown = targetLen;
        streamPaintShownLenRef.current = shown;
        publishVisibleText(main);
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
      shown = targetLen;
      streamPaintShownLenRef.current = shown;
      el.textContent = main;
      if (publishDomTextToReact) publishVisibleText(main);
      if (typingSound !== 'off') playClickSound(typingSound, typingSoundVolume);
    } else if (targetLen > 0) {
      el.textContent = main;
      if (publishDomTextToReact) publishVisibleText(main);
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

  // 用 ResizeObserver 监听流式元素高度变化来触发滚动对齐，
  // 避免在 RAF 循环里定时调用 getBoundingClientRect 造成 layout thrashing。
  useEffect(() => {
    const el = streamingDomRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      try { scrollReconcile(); } catch { /* ignore */ }
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

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

