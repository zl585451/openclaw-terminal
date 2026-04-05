/**
 * useTypewriter.ts — RAF-based per-character animation
 *
 * 特性：
 * - useEffect + 16ms polling interval 启动 RAF 循环
 * - RAF tick() 使用 budgetRef 时间预算决定每帧显示多少字符
 * - MAX_CHARS_PER_FRAME = 12，CATCHUP_THRESHOLD = 20
 * - catchUpBoost 在缓冲区积压时加速追赶
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { playClickSound, resetSoundCounter } from '../utils/clickSound';
import { parseOptionBox } from '../utils/optionBoxParser';
import { extractAssistantCotAndMain } from '../utils/cotExtract';

export type TypingSoundMode = 'off' | 'typewriter' | 'soft' | 'bubble';

export interface UseTypewriterOptions {
  baseDelayMs: number;
  typingSound: TypingSoundMode;
  onFinished: (finalText: string) => void;
}

export interface UseTypewriterReturn {
  feed: (fullText: string) => void;
  finish: () => void;
  reset: () => void;
  displayedText: string;
  isTyping: boolean;
}

// ── 常量 ────────────────────────────────────────────────

const MAX_CHARS_PER_FRAME = 2;
const BATCH_FRAMES = 1;

// ── 字符工具函数 ────────────────────────────────────────

function getNextCharIndex(text: string, idx: number): number {
  if (idx >= text.length) return idx;
  const code = text.charCodeAt(idx);
  if (code >= 0xd800 && code <= 0xdbff && idx + 1 < text.length) {
    const next = text.charCodeAt(idx + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return idx + 2;
  }
  return idx + 1;
}

function charDelayMs(ch: string, base: number): number {
  if (ch === '\n') return base * 1.2;
  if ('。！？…'.includes(ch) || '.!?'.includes(ch)) return base * 1.12;
  if (',，、;；'.includes(ch)) return base * 1.06;
  return base;
}

function computeRangeCostMs(text: string, start: number, end: number, base: number): number {
  let cost = 0;
  let i = start;
  while (i < end) {
    const ni = getNextCharIndex(text, i);
    cost += charDelayMs(text.slice(i, ni), base);
    i = ni;
  }
  return cost;
}

function isWordChar(ch: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(ch);
}

function pickPreferredNextIndex(text: string, idx: number, maxChars: number): number {
  if (idx >= text.length) return idx;
  const firstEnd = getNextCharIndex(text, idx);
  const firstCh = text.slice(idx, firstEnd);
  if (!isWordChar(firstCh)) return firstEnd;

  let i = idx;
  let used = 0;
  while (used < maxChars && i < text.length) {
    const ni = getNextCharIndex(text, i);
    if (!isWordChar(text.slice(i, ni))) break;
    i = ni;
    used += 1;
  }
  if (used < maxChars && i < text.length) {
    const ni = getNextCharIndex(text, i);
    if (text.slice(i, ni) === ' ') return ni;
  }
  return i;
}

// ── Hook ────────────────────────────────────────────────

export function useTypewriter(options: UseTypewriterOptions): UseTypewriterReturn {
  const { baseDelayMs, typingSound, onFinished } = options;

  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // ── 内部 refs ──
  const fullTextRef = useRef('');           // 累积的原始全文
  const visibleTextRef = useRef('');        // 解析后的可见正文
  const displayedLenRef = useRef(0);        // 当前已显示的字符数
  const streamDoneRef = useRef(false);       // 流是否已结束
  const rafRef = useRef<number | null>(null);
  const budgetRef = useRef(0);
  const lastTsRef = useRef(0);
  const startTsRef = useRef(0);
  const frameCountRef = useRef(0);

  // ── feed：外部每次传入累积全文 ──
  const feed = useCallback((rawFullText: string) => {
    fullTextRef.current = rawFullText;
    const { mainContent } = extractAssistantCotAndMain(rawFullText);
    try {
      const parsed = parseOptionBox(mainContent || '');
      visibleTextRef.current = (parsed.text ?? '').toString();
    } catch {
      visibleTextRef.current = mainContent || '';
    }
    if (displayedLenRef.current > visibleTextRef.current.length) {
      displayedLenRef.current = visibleTextRef.current.length;
    }
  }, []);

  // ── finish：通知流已结束 ──
  const finish = useCallback(() => {
    streamDoneRef.current = true;
  }, []);

  // ── reset：新一轮对话开始 ──
  const reset = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    fullTextRef.current = '';
    visibleTextRef.current = '';
    displayedLenRef.current = 0;
    streamDoneRef.current = false;
    budgetRef.current = 0;
    lastTsRef.current = 0;
    startTsRef.current = 0;
    frameCountRef.current = 0;
    setDisplayedText('');
    setIsTyping(false);
  }, []);

  // ── RAF tick 循环 ──
  useEffect(() => {
    const tryStart = () => {
      if (rafRef.current !== null) return;

      if (streamDoneRef.current && visibleTextRef.current.length === 0) {
        setIsTyping(false);
        const raw = fullTextRef.current;
        onFinishedRef.current(raw);
        fullTextRef.current = '';
        visibleTextRef.current = '';
        displayedLenRef.current = 0;
        streamDoneRef.current = false;
        budgetRef.current = 0;
        lastTsRef.current = 0;
        startTsRef.current = 0;
        frameCountRef.current = 0;
        setDisplayedText('');
        return;
      }

      if (visibleTextRef.current.length === 0) return;
      if (displayedLenRef.current >= visibleTextRef.current.length && !streamDoneRef.current) return;

      setIsTyping(true);
      budgetRef.current = 10;
      startTsRef.current = performance.now();
      lastTsRef.current = 0;
      frameCountRef.current = 0;
      resetSoundCounter();

      const tick = (ts: number) => {
        if (!lastTsRef.current) lastTsRef.current = ts;
        const dt = Math.min(80, ts - lastTsRef.current);
        lastTsRef.current = ts;

        const full = visibleTextRef.current;
        const fullLen = full.length;
        let idx = displayedLenRef.current;

        const elapsed = ts - startTsRef.current;
        const backlog = fullLen - idx;
        let catchUpBoost = 0;
        if (!streamDoneRef.current && elapsed > 900 && backlog > 48) {
          catchUpBoost = Math.min((backlog - 48) * 0.12, 18);
          if (elapsed > 1800 && backlog > 120) {
            catchUpBoost += Math.min((backlog - 120) * 0.08, 16);
          }
        }

        if (streamDoneRef.current && idx < fullLen) {
          budgetRef.current += 900;
        }

        budgetRef.current += dt + catchUpBoost;

        let typedThisFrame = 0;
        const dynamicFrameCap = streamDoneRef.current
          ? Math.min(MAX_CHARS_PER_FRAME + 4, 8)
          : backlog > 80
            ? Math.min(MAX_CHARS_PER_FRAME + 2, 6)
            : MAX_CHARS_PER_FRAME;

        while (typedThisFrame < dynamicFrameCap && idx < fullLen) {
          const remain = dynamicFrameCap - typedThisFrame;
          // 流式阶段强制逐字符推进，避免“按词/按段蹦出来”。
          // 只在 stream done 后再允许更激进的收尾追赶。
          let targetIdx = !streamDoneRef.current
            ? getNextCharIndex(full, idx)
            : pickPreferredNextIndex(full, idx, remain);
          if (targetIdx <= idx) targetIdx = getNextCharIndex(full, idx);
          const effectiveBaseDelay = streamDoneRef.current
            ? Math.max(1, baseDelayMs * 0.38)
            : backlog > 120
              ? Math.max(1, baseDelayMs * 0.58)
              : backlog > 64
                ? Math.max(1, baseDelayMs * 0.78)
                : baseDelayMs;
          const cost = computeRangeCostMs(full, idx, targetIdx, effectiveBaseDelay);
          if (budgetRef.current < cost) {
            const singleIdx = getNextCharIndex(full, idx);
            const singleCost = computeRangeCostMs(full, idx, singleIdx, effectiveBaseDelay);
            if (budgetRef.current < singleCost) break;
            budgetRef.current -= singleCost;
            idx = singleIdx;
            typedThisFrame += 1;
            continue;
          }
          budgetRef.current -= cost;
          let count = 0;
          let j = idx;
          while (j < targetIdx && count < remain) {
            j = getNextCharIndex(full, j);
            count += 1;
          }
          idx = targetIdx;
          typedThisFrame += count;
        }

        if (idx !== displayedLenRef.current) {
          displayedLenRef.current = idx;
          frameCountRef.current += 1;
          if (frameCountRef.current >= BATCH_FRAMES || idx >= fullLen) {
            setDisplayedText(full.slice(0, idx));
            frameCountRef.current = 0;
          }
          if (typingSound !== 'off') playClickSound(typingSound);
        }

        if (idx >= fullLen && streamDoneRef.current) {
          rafRef.current = null;
          setIsTyping(false);
          onFinishedRef.current(fullTextRef.current);
          fullTextRef.current = '';
          visibleTextRef.current = '';
          displayedLenRef.current = 0;
          streamDoneRef.current = false;
          budgetRef.current = 0;
          lastTsRef.current = 0;
          startTsRef.current = 0;
          frameCountRef.current = 0;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setDisplayedText('');
            });
          });
          return;
        }

        if (idx >= fullLen && !streamDoneRef.current) {
          rafRef.current = null;
          setIsTyping(false);
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    const poll = setInterval(tryStart, 16);
    return () => {
      clearInterval(poll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [baseDelayMs, typingSound]);

  return { feed, finish, reset, displayedText, isTyping };
}
