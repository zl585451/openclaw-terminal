import { useState, useRef, useCallback, useEffect } from 'react';
import { playClickSound, resetSoundCounter } from '../utils/clickSound';
import { parseOptionBox } from '../utils/optionBoxParser';

export interface UseTypewriterOptions {
  baseDelayMs: number;
  typingSound: 'off' | 'typewriter' | 'soft' | 'bubble';
  onFinished: (finalText: string) => void;
}

export interface UseTypewriterReturn {
  feed: (fullText: string) => void;
  finish: () => void;
  reset: () => void;
  displayedText: string;
  isTyping: boolean;
}

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

function isWordChar(ch: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(ch);
}

function charDelayMs(ch: string, base: number): number {
  const d = Math.max(base, 40);
  if (ch === '\n') return d + d * 2.5;
  if ('。！？…'.includes(ch)) return d + d * 2;
  if ('.!?'.includes(ch)) return d + d * 1.5;
  if (',，、;；'.includes(ch)) return d + d * 0.6;
  return d;
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

  // ── 内部 refs：只有 hook 内部读写 ──
  const fullTextRef = useRef('');           // 累积的原始全文
  const visibleTextRef = useRef('');        // 解析后的可见正文
  const displayedLenRef = useRef(0);        // 当前已显示的字符数
  const streamDoneRef = useRef(false);      // 流是否已结束
  const rafRef = useRef<number | null>(null);
  const budgetRef = useRef(0);
  const lastTsRef = useRef(0);
  const startTsRef = useRef(0);

  // ── feed：外部每次传入累积全文 ──
  const feed = useCallback((rawFullText: string) => {
    fullTextRef.current = rawFullText;
    // 解析出可见正文（去掉 [pills]、[cot] 等标签内容）
    try {
      const parsed = parseOptionBox(rawFullText || '');
      visibleTextRef.current = (parsed.text ?? '').toString();
    } catch {
      visibleTextRef.current = rawFullText || '';
    }
    // 夹紧：如果可见文本因为标签被剥离而变短，避免 slice 越界
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
    setDisplayedText('');
    setIsTyping(false);
  }, []);

  // ── 唯一的 tick 循环 ──
  useEffect(() => {
    // 只要有新内容且 tick 未运行，就启动
    const tryStart = () => {
      if (rafRef.current !== null) return; // 已在运行

      // 流已结束但 parseOptionBox 后可见正文为空（仅 CoT/标签内内容等）：不能走 RAF，
      // 否则永远不触发 onFinished，TurnFSM 会卡在 RENDER_COMPLETE，下次发送报 Invalid transition。
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

      if (visibleTextRef.current.length === 0) return; // 流未结束且暂无可显示正文
      if (displayedLenRef.current >= visibleTextRef.current.length && !streamDoneRef.current) return;

      setIsTyping(true);
      budgetRef.current = 20;
      startTsRef.current = performance.now();
      lastTsRef.current = 0;
      resetSoundCounter();

      const tick = (ts: number) => {
        if (!lastTsRef.current) lastTsRef.current = ts;
        const dt = Math.min(80, ts - lastTsRef.current);
        lastTsRef.current = ts;

        const full = visibleTextRef.current;
        const fullLen = full.length;
        let idx = displayedLenRef.current;

        // 追赶：平缓曲线
        const elapsed = ts - startTsRef.current;
        const backlog = fullLen - idx;
        let catchUpBoost = 0;
        if (elapsed > 2000 && !streamDoneRef.current) {
          if (backlog > 60) catchUpBoost = Math.min((backlog - 60) * 0.12, 10);
          if (backlog > 200) catchUpBoost = 10 + Math.min((backlog - 200) * 0.15, 20);
        }

        // stream 结束后加速收尾
        if (streamDoneRef.current && idx < fullLen) {
          budgetRef.current += 300;
        }

        budgetRef.current += dt + catchUpBoost;

        // 推进字符
        let typedThisFrame = 0;
        while (typedThisFrame < 4 && idx < fullLen) {
          const remain = 4 - typedThisFrame;
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
          setDisplayedText(full.slice(0, idx));
          if (typingSound !== 'off') playClickSound(typingSound);
        }

        // 追完且流已结束 → 收尾
        if (idx >= fullLen && streamDoneRef.current) {
          rafRef.current = null;
          setIsTyping(false);
          // 回调：让 ChatTab 做 FSM/ingest 清理和 isStreaming:false
          onFinishedRef.current(fullTextRef.current);
          // 内部重置 refs（不触发渲染）
          fullTextRef.current = '';
          visibleTextRef.current = '';
          displayedLenRef.current = 0;
          streamDoneRef.current = false;
          budgetRef.current = 0;
          lastTsRef.current = 0;
          // 关键：延迟两帧再清空 displayedText
          // onFinished 触发 setMessages isStreaming:false，React 需要一帧提交
          // 过早 setDisplayedText('') 会导致内容消失一帧再出现（末尾抖动）
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setDisplayedText('');
            });
          });
          return;
        }

        // 还没追完或流还没结束 → 继续
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    // 用 interval 轮询是否需要启动（16ms = 约 60fps）
    // 这比依赖 useEffect deps 更可靠，因为 feed() 只写 ref 不触发重渲染
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
