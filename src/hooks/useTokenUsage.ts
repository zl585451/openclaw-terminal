import { useCallback, useEffect, useRef, useState } from 'react';

type UsagePayload = Record<string, unknown>;

export function useTokenUsage() {
  const [tokenIn, setTokenIn] = useState<number | null>(null);
  const [tokenOut, setTokenOut] = useState<number | null>(null);
  const [ctxUsed, setCtxUsed] = useState<number | null>(null);
  const [ctxMax, setCtxMax] = useState<number | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [, setSession] = useState<string | null>(null);

  /** usage 事件 RAF 合并：同一帧多条合并后再 setState */
  const usageBatchRef = useRef<Array<{ usage: UsagePayload; isSnapshot: boolean }>>([]);
  const usageFlushRafRef = useRef<number | null>(null);

  const scheduleUsageFlush = useCallback(() => {
    if (usageFlushRafRef.current != null) return;
    usageFlushRafRef.current = requestAnimationFrame(() => {
      usageFlushRafRef.current = null;
      const batch = usageBatchRef.current;
      usageBatchRef.current = [];
      if (batch.length === 0) return;
      for (const { usage, isSnapshot } of batch) {
        const inputTokensRaw = usage.inputTokens ?? usage.prompt_tokens;
        const outputTokensRaw = usage.outputTokens ?? usage.completion_tokens;
        const costRaw = usage.cost;
        const ctxUsedRaw = usage.ctxUsed ?? usage.context_tokens;
        const ctxMaxRaw = usage.ctxMax;
        const sessionRaw = usage.session;

        if (typeof inputTokensRaw === 'number') {
          if (isSnapshot) setTokenIn(inputTokensRaw);
          else setTokenIn((v) => (v ?? 0) + inputTokensRaw);
        }
        if (typeof outputTokensRaw === 'number') {
          if (isSnapshot) setTokenOut(outputTokensRaw);
          else setTokenOut((v) => (v ?? 0) + outputTokensRaw);
        }
        if (costRaw != null) {
          const n = Number(costRaw);
          if (!Number.isNaN(n)) {
            if (isSnapshot) setCost(n);
            else setCost((v) => (v ?? 0) + n);
          }
        }
        if (typeof ctxUsedRaw === 'number') setCtxUsed(ctxUsedRaw);
        if (typeof ctxMaxRaw === 'number') setCtxMax(ctxMaxRaw);
        if (typeof sessionRaw === 'string' || sessionRaw === null) setSession(sessionRaw);
      }
    });
  }, []);

  const onUsage = useCallback((usage: UsagePayload, isSnapshot: boolean) => {
    usageBatchRef.current.push({ usage, isSnapshot });
    scheduleUsageFlush();
  }, [scheduleUsageFlush]);

  const resetUsage = useCallback(() => {
    setTokenIn(null);
    setTokenOut(null);
    setCtxUsed(null);
    setCtxMax(null);
    setCost(null);
    setSession(null);
    usageBatchRef.current = [];
    if (usageFlushRafRef.current != null) {
      cancelAnimationFrame(usageFlushRafRef.current);
      usageFlushRafRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (usageFlushRafRef.current != null) {
        cancelAnimationFrame(usageFlushRafRef.current);
        usageFlushRafRef.current = null;
      }
    };
  }, []);

  return {
    tokenIn,
    tokenOut,
    ctxUsed,
    ctxMax,
    cost,
    onUsage,
    resetUsage,
    // 供 useMessages 内部（系统回复解析等）复用；不影响 useMessages 对外 API
    setTokenIn,
    setTokenOut,
    setCtxUsed,
    setCtxMax,
    setCost,
  };
}

