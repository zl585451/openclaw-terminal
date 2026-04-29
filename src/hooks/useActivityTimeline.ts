import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSISTANT_COT_MARKER_SPECS } from '../utils/cotExtract';
import type { GatewayKeepalivePayload, GatewayToolPayload } from '../types/gateway';

export type ActivityEntryType =
  | 'thinking_placeholder'
  | 'cot'
  | 'tool_call'
  | 'tool_result'
  | 'keepalive_hint';

export interface ActivityEntry {
  id: string;
  type: ActivityEntryType;
  timestamp: number;
  content?: string;
  toolName?: string;
  argsPreview?: string;
  callId?: string;
  resultPreview?: string;
  elapsedMs?: number;
  isError?: boolean;
  hint?: string;
  keepaliveElapsedMs?: number;
}

function buildArgsPreview(args: Record<string, unknown> | undefined): string {
  if (!args) return '';
  return Object.entries(args)
    .map(([key, value]) =>
      `${key}: ${typeof value === 'string' ? value.slice(0, 60) : JSON.stringify(value).slice(0, 60)}`
    )
    .join(', ')
    .slice(0, 120);
}

export function useActivityTimeline(_messages: unknown[]) {
  const [activityTimeline, setActivityTimeline] = useState<ActivityEntry[]>([]);
  const activityIdCounter = useRef(0);
  const nextActivityId = useCallback(() => `act_${++activityIdCounter.current}`, []);
  const cotSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestFullTextRef = useRef('');

  const resetTimeline = useCallback(() => {
    activityIdCounter.current = 0;
    setActivityTimeline([]);
  }, []);

  const resetWithThinkingPlaceholder = useCallback(() => {
    activityIdCounter.current = 0;
    setActivityTimeline([{
      id: `act_${++activityIdCounter.current}`,
      type: 'thinking_placeholder',
      timestamp: Date.now(),
      hint: '让我想想...',
    }]);
  }, []);

  const removeTypes = useCallback((types: ActivityEntryType[]) => {
    setActivityTimeline((prev) => prev.filter((entry) => !types.includes(entry.type)));
  }, []);

  const removeTrailingKeepaliveHint = useCallback(() => {
    setActivityTimeline((prev) => {
      const last = prev[prev.length - 1];
      if (last?.type !== 'keepalive_hint') return prev;
      return prev.slice(0, -1);
    });
  }, []);

  const upsertCotEntry = useCallback((cotText: string) => {
    const trimmedCot = cotText.trim();
    if (!trimmedCot) return;
    setActivityTimeline((prev) => {
      const existingCotIdx = prev.findIndex((entry) => entry.type === 'cot');
      if (existingCotIdx !== -1) {
        const updated = [...prev];
        updated[existingCotIdx] = { ...updated[existingCotIdx], content: trimmedCot };
        return updated;
      }
      const filtered = prev.filter((entry) => entry.type !== 'thinking_placeholder');
      return [
        ...filtered,
        { id: nextActivityId(), type: 'cot', timestamp: Date.now(), content: trimmedCot },
      ];
    });
  }, [nextActivityId]);

  const scheduleCotSyncFromFullText = useCallback((fullText: string) => {
    latestFullTextRef.current = fullText;
    if (cotSyncTimerRef.current) return;
    cotSyncTimerRef.current = setTimeout(() => {
      cotSyncTimerRef.current = null;
      const currentFull = latestFullTextRef.current;

      /** 与 cotExtract.ts findNextTag 一致：取全文中最靠前的一组开标签 */
      let chosen: { spec: (typeof ASSISTANT_COT_MARKER_SPECS)[number]; index: number } | null = null;
      for (const spec of ASSISTANT_COT_MARKER_SPECS) {
        const idx = currentFull.indexOf(spec.open);
        if (idx === -1) continue;
        if (!chosen || idx < chosen.index) {
          chosen = { spec, index: idx };
        }
      }
      if (!chosen) return;

      const innerStart = chosen.index + chosen.spec.open.length;
      const closeIdx = currentFull.indexOf(chosen.spec.close, innerStart);
      const rawInner = closeIdx === -1 ? currentFull.slice(innerStart) : currentFull.slice(innerStart, closeIdx);

      upsertCotEntry(rawInner);
    }, 300);
  }, [upsertCotEntry]);

  const onToolEvent = useCallback((payload: GatewayToolPayload) => {
    if (payload.type === 'tool_call') {
      removeTrailingKeepaliveHint();
      setActivityTimeline((prev) => [
        ...prev,
        {
          id: nextActivityId(),
          type: 'tool_call',
          timestamp: Date.now(),
          toolName: payload.tool,
          callId: payload.callId,
          argsPreview: buildArgsPreview(payload.args as Record<string, unknown> | undefined),
        },
      ]);
      return;
    }
    if (payload.type === 'tool_result') {
      setActivityTimeline((prev) => [
        ...prev,
        {
          id: nextActivityId(),
          type: 'tool_result',
          timestamp: Date.now(),
          toolName: payload.tool,
          callId: payload.callId,
          resultPreview: payload.resultPreview?.slice(0, 120),
          elapsedMs: payload.elapsedMs,
          isError: payload.state === 'error',
        },
      ]);
    }
  }, [nextActivityId, removeTrailingKeepaliveHint]);

  const onKeepalive = useCallback((payload: GatewayKeepalivePayload) => {
    const { phase, elapsedMs, toolName } = payload;

    let hint = '';
    if (phase === 'waiting_first_token') {
      if (elapsedMs < 2000) hint = '让我想想...';
      else if (elapsedMs < 6000) hint = '分析你的问题中...';
      else if (elapsedMs < 12000) hint = '这个需要好好想一下...';
      else hint = '还在努力思考，请稍等...';
    } else if (phase === 'tool_running') {
      hint = toolName ? `正在使用 ${toolName}...` : '正在调用工具...';
    } else if (phase === 'waiting_continuation') {
      hint = '整理工具返回的结果...';
    } else if (phase === 'streaming') {
      hint = '继续整理中...';
    }

    setActivityTimeline((prev) => {
      const last = prev[prev.length - 1];
      if (last?.type === 'keepalive_hint') {
        return [...prev.slice(0, -1), { ...last, hint, keepaliveElapsedMs: elapsedMs }];
      }
      return [
        ...prev,
        { id: nextActivityId(), type: 'keepalive_hint', timestamp: Date.now(), hint, keepaliveElapsedMs: elapsedMs },
      ];
    });
  }, [nextActivityId]);

  useEffect(() => {
    return () => {
      if (cotSyncTimerRef.current != null) {
        clearTimeout(cotSyncTimerRef.current);
        cotSyncTimerRef.current = null;
      }
    };
  }, []);

  return {
    activityTimeline,
    onToolEvent,
    onKeepalive,
    resetTimeline,
    resetWithThinkingPlaceholder,
    removeTypes,
    scheduleCotSyncFromFullText,
  };
}
