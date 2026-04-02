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

const MAX_CHARS_PER_FRAME = 6;
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
  if (ch === '\n') return base * 2;
  if ('。！？…'.includes(ch) || '.!?'.includes(ch)) return base * 1.5;
  if (',，、;；'.includes(ch)) return base * 1.5;
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

      // 流已结束但可见正文为空 → 直接完成，避免 FSM 卡住
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
        setDisplayedText('');
        return;
      }

      if (visibleTextRef.current.length === 0) return;
      if (displayedLenRef.current >= visibleTextRef.current.length && !streamDoneRef.current) return;

      setIsTyping(true);
      budgetRef.current = 30;
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

        // 追赶加速
        const elapsed = ts - startTsRef.current;
        const backlog = fullLen - idx;
        let catchUpBoost = 0;
        if (elapsed > 1000 && !streamDoneRef.current) {
          if (backlog > 40) catchUpBoost = Math.min((backlog - 40) * 0.15, 12);
          if (backlog > 200) catchUpBoost = 12 + Math.min((backlog - 200) * 0.2, 25);
        }

        // stream 结束后加速收尾
        if (streamDoneRef.current && idx < fullLen) {
          budgetRef.current += 300;
        }

        budgetRef.current += dt + catchUpBoost;

        // 推进字符
        let typedThisFrame = 0;

        while (typedThisFrame < MAX_CHARS_PER_FRAME && idx < fullLen) {
          const remain = MAX_CHARS_PER_FRAME - typedThisFrame;
          let targetIdx = pickPreferredNextIndex(full, idx, remain);
          if (targetIdx <= idx) targetIdx = getNextCharIndex(full, idx);
          const cost = computeRangeCostMs(full, idx, targetIdx, baseDelayMs);
          if (budgetRef.current < cost) {
            const singleIdx = getNextCharIndex(full, idx);
            const singleCost = computeRangeCostMs(full, idx, singleIdx, baseDelayMs);
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
          // 每 BATCH_FRAMES 帧 flush 一次到 React state
          if (frameCountRef.current >= BATCH_FRAMES) {
            setDisplayedText(full.slice(0, idx));
            frameCountRef.current = 0;
          }
          if (typingSound !== 'off') playClickSound(typingSound);
        }

        // 追完且流已结束 → 收尾
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
          // 延迟两帧再清空 displayedText，避免末尾抖动
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setDisplayedText('');
            });
          });
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    // 16ms polling interval 启动 RAF
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
