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
  /** 逐字揭示进度心跳：painter 每帧揭示新内容时写入 performance.now()，
   *  供收尾兜底判断"painter 是否仍在推进"，避免兜底打断揭示动画。 */
  lastRevealTsRef?: React.MutableRefObject<number>;
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
    lastRevealTsRef,
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
      // 正文变短（新段开始/续轮清空）→ 揭示进度回退到新长度，从头打字
      shown = targetLen;
    }

    const gap = targetLen - shown;
    if (gap > 0) {
      // 逐字揭示：每帧只揭示间隙的一部分（下限 2 字）。
      // 这样无论后端是逐字发，还是 Agent / 强制收尾一次性发一整段，
      // 前端都按打字机节奏揭示——视觉流式与后端分块彻底解耦。
      const step = Math.max(2, Math.ceil(gap / 6));
      shown = Math.min(targetLen, shown + step);
      if (lastRevealTsRef) lastRevealTsRef.current = now;
    }
    streamPaintShownLenRef.current = shown;

    const visible = shown >= targetLen ? main : main.slice(0, shown);

    if (el) {
      el.textContent = visible;
      if (publishDomTextToReact) publishVisibleText(visible);
    } else if (targetLen > 0 || pendingStreamFinalizeRef.current) {
      // inline 路径无 <pre> sink，正文经 React state 驱动 markdown 渲染
      publishVisibleText(visible);
    }
    if (gap > 0 && typingSound !== 'off') {
      playClickSound(typingSound, typingSoundVolume);
    }

    // 还没揭示到当前末尾 → 继续下一帧（间隙较大时分帧打完）
    const mainEnd = getAssistantVisibleMain(fullTextRef.current).length;
    if (streamPaintShownLenRef.current < mainEnd) {
      streamPaintRafRef.current = requestAnimationFrame(() => runStreamPaintTickRef.current());
      return;
    }

    // 已追平当前内容。若流未结束，停帧等待下一个 delta 触发 startPainting() 唤醒；
    // 若已收到 done（pendingFinalize）则定稿。
    if (pendingStreamFinalizeRef.current) {
      finalizeStreamingAssistantMessage(fullTextRef.current);
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

