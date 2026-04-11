import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { TurnFSM, deriveLegacyFlags, TurnPhase } from '../core/turnFSM';
import { StreamRouter, StreamState } from '../core/streamRouter';
import { BlockIngest } from '../core/blockIngest';
import { useWebSocket } from './useWebSocket';
import type { WorkbenchRoundtripContext } from '../workbench/types';
import { workbenchBus } from '../workbench/WorkbenchBus';
import { toWorkbenchCommand } from '../workbench/types';
import { checkPermission, getDangerMatch } from '../utils/permissionCheck';
import type { PermissionConfig } from '../utils/permissionCheck';
import type { UseTypewriterReturn } from './useTypewriter';
import type { ChatMessage, UploadedFile } from '../ui/chat/ChatTab.v2';
import { extractAssistantCotAndMain, hasAssistantCotMarkers, stripTextToolAnnotations } from '../utils/cotExtract';
import { stripThinkModeMarker } from '../utils/socraticTemplates';
import { playClickSound, resetSoundCounter, type TypingSoundMode } from '../utils/clickSound';

// ── Streak helpers ────────────────────────────────────────────────────────────
function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getStreakData(): { streak: number; lastActiveDate: string } {
  try {
    const raw = localStorage.getItem('oct_streak');
    if (raw) return JSON.parse(raw) as { streak: number; lastActiveDate: string };
  } catch {}
  return { streak: 0, lastActiveDate: '' };
}

function touchStreak(): number {
  const today = getTodayStr();
  const data = getStreakData();
  if (data.lastActiveDate === today) return data.streak;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = data.lastActiveDate === yesterday ? data.streak + 1 : 1;
  try {
    localStorage.setItem('oct_streak', JSON.stringify({ streak: newStreak, lastActiveDate: today }));
  } catch {}
  return newStreak;
}

// ── Util helpers ──────────────────────────────────────────────────────────────
function isSystemCommand(text: string): boolean {
  const t = (text || '').trim();
  return /^\/\w/.test(t);
}

function recoverOctStreamFromEndFailure(oct: { stream: StreamRouter; fsm: TurnFSM }): void {
  try {
    oct.stream.abortToIdle();
  } catch {
    /* ignore */
  }
  try {
    if (oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
      oct.fsm.onToken();                  // → STREAMING
    }
    if (oct.fsm.getPhase() === TurnPhase.STREAMING ||
        oct.fsm.getPhase() === TurnPhase.STREAM_PAUSED) {
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

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ActiveTool {
  callId: string;
  tool: string;
  state: 'executing' | 'done' | 'error';
  resultPreview?: string;
}

export interface UseMessagesOptions {
  oct: { fsm: TurnFSM; stream: StreamRouter; ingest: BlockIngest };
  typewriter: UseTypewriterReturn;
  scroll: {
    reconcile: () => void;
    scrollAfterUserSend: () => void;
  };
  getNextMessageId: () => number;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  permissions: PermissionConfig;
  streamSpeedMs: number;
  typingSound: TypingSoundMode;
  typingSoundVolume: number;
  onStatusChange?: (
    wsConnected: boolean,
    isStreaming: boolean,
    modelName?: string,
    tokenIn?: number | null,
    tokenOut?: number | null,
    ctxUsed?: number | null,
    ctxMax?: number | null,
  ) => void;
}

export interface UseMessagesReturn {
  wsConnected: boolean;
  wsReconnecting: boolean;
  wsError: string | null;
  nocturneOnline: boolean;
  fsmPhase: TurnPhase;
  isStreaming: boolean;
  awaitingResponse: boolean;
  agentPhase: 'idle' | 'thinking' | 'typing' | 'tool_executing';
  thinkingElapsed: number;
  activeTools: ActiveTool[];
  tokenIn: number | null;
  tokenOut: number | null;
  ctxUsed: number | null;
  ctxMax: number | null;
  modelName: string;
  thinkMode: string;
  pendingPills: string[] | null;
  streak: number;
  fullTextRef: MutableRefObject<string>;
  streamingDomRef: MutableRefObject<HTMLPreElement | null>;
  sendMessage: (text: string, imageDataUrl: string | null, files?: UploadedFile[], workbenchContext?: WorkbenchRoundtripContext) => Promise<void>;
  quickSend: (content: string) => void;
}

export function useMessages({
  oct,
  typewriter,
  scroll,
  getNextMessageId,
  messages,
  setMessages,
  permissions,
  streamSpeedMs,
  typingSound,
  typingSoundVolume,
  onStatusChange,
}: UseMessagesOptions): UseMessagesReturn {
  const transportPacingMs = 4;
  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
  const streamSpeedMsRef = useRef(streamSpeedMs);
  streamSpeedMsRef.current = streamSpeedMs;
  // ── State ─────────────────────────────────────────────────────────────────
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [agentPhase, setAgentPhase] = useState<'idle' | 'thinking' | 'typing' | 'tool_executing'>('idle');
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [tokenIn, setTokenIn] = useState<number | null>(null);
  const [tokenOut, setTokenOut] = useState<number | null>(null);
  const [ctxUsed, setCtxUsed] = useState<number | null>(null);
  const [ctxMax, setCtxMax] = useState<number | null>(null);
  const [, setCost] = useState<number | null>(null);
  const [, setSession] = useState<string | null>(null);
  const [, setApiKeyInfo] = useState<string>('--');
  const [thinkMode, setThinkMode] = useState<string>('off');
  const [, setRuntimeMode] = useState<string>('direct');
  const [, setCompactions] = useState<number | null>(null);
  const [, setQueueInfo] = useState<string>('--');
  const [modelName, setModelName] = useState('--');
  const [pendingPills, setPendingPills] = useState<string[] | null>(null);
  const [fsmPhase, setFsmPhase] = useState(() => oct.fsm.getPhase());
  const [streak, setStreak] = useState<number>(() => getStreakData().streak);
  /** 流式阶段 reconcile 每帧调用会引发大量 layout；限制频率 */
  const lastStreamReconcileMsRef = useRef(0);
  /** usage 事件 RAF 合并：同一帧多条合并后再 setState */
  const usageBatchRef = useRef<Array<{ usage: any; isSnapshot: boolean }>>([]);
  const usageFlushRafRef = useRef<number | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const streamingMessageRef = useRef('');
  const fullTextRef = useRef<string>('');
  const streamingDomRef = useRef<HTMLPreElement | null>(null);
  const pendingFullTextSyncRafRef = useRef<number | null>(null);
  /** 流式正文 DOM 直写 RAF 链（把大 chunk 拆成多帧铺开，像刷油漆） */
  const streamPaintRafRef = useRef<number | null>(null);
  /** 已向 <pre> 展示的「正文」字符数（相对 extract 后的 main） */
  const streamPaintShownLenRef = useRef(0);
  /** 直写节奏预算，限制每帧只追加极少字符，减少“蹦字感” */
  const streamPaintBudgetRef = useRef(0);
  const streamPaintLastTsRef = useRef(0);
  const pendingStreamFinalizeRef = useRef(false);
  const finalizeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runStreamPaintTickRef = useRef<() => void>(() => {});
  const pendingSystemReplyMap = useRef<Map<string, boolean>>(new Map());
  const lastSentRequestId = useRef<string>('');
  const systemReplyBufferRef = useRef('');
  // ── isStreaming (memo) ────────────────────────────────────────────────────
  const isStreaming = useMemo(() => {
    const lf = deriveLegacyFlags(fsmPhase);
    const last = messages[messages.length - 1];
    return (
      lf.isStreaming ||
      lf.isRendering ||
      (!!last?.isStreaming && last.role === 'assistant')
    );
  }, [fsmPhase, messages]);
  const finalizeStreamingAssistantMessage = useCallback((rawText?: string) => {
    const finalRaw = stripTextToolAnnotations(stripThinkModeMarker(rawText ?? fullTextRef.current ?? ''));
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
      finalizeFallbackTimerRef.current = null;
    }
    pendingStreamFinalizeRef.current = false;
    streamPaintShownLenRef.current = 0;
    streamPaintBudgetRef.current = 0;
    streamPaintLastTsRef.current = 0;
    // Advance FSM through any intermediate states that may have been skipped,
    // then complete the turn. If anything throws, force-reset to IDLE so the
    // next turn can start cleanly.
    try {
      const p = oct.fsm.getPhase();
      if (p === TurnPhase.STREAMING || p === TurnPhase.STREAM_PAUSED) {
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
    oct.ingest.reset();
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.isStreaming) {
        return prev.map((msg, idx) =>
          idx === prev.length - 1
            ? { ...msg, content: finalRaw || msg.content, isStreaming: false, isStreamingRaw: false }
            : msg
        );
      }
      return prev;
    });
  }, [oct, setMessages]);

  const scheduleFinalizeFallback = useCallback((rawText?: string) => {
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
    }
    finalizeFallbackTimerRef.current = setTimeout(() => {
      finalizeFallbackTimerRef.current = null;
      const fallbackRaw = stripTextToolAnnotations(stripThinkModeMarker(rawText ?? fullTextRef.current ?? ''));
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!(last?.role === 'assistant' && last.isStreaming)) {
          return prev;
        }
        if (fallbackRaw.trim()) {
          return prev.map((msg, idx) =>
            idx === prev.length - 1
              ? { ...msg, content: fallbackRaw, isStreaming: false, isStreamingRaw: false }
              : msg
          );
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
    const markers = hasAssistantCotMarkers(raw);
    const main = markers ? extractAssistantCotAndMain(raw).mainContent : raw;
    const targetLen = main.length;
    let shown = streamPaintShownLenRef.current;
    if (shown > targetLen) {
      shown = targetLen;
      streamPaintShownLenRef.current = shown;
    }
    const behind = targetLen - shown;

    if (!el) {
      if (behind > 0) {
        streamPaintRafRef.current = requestAnimationFrame(() => runStreamPaintTickRef.current());
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
        el.textContent = main.slice(0, shown);
        if (typingSound !== 'off') {
          for (let i = 0; i < step; i++) {
            playClickSound(typingSound, typingSoundVolume);
          }
        }
      }
    } else if (targetLen > 0) {
      el.textContent = main;
    }

    try {
      const t = performance.now();
      // 略拉长间隔，减轻与 textContent 触发布局在同一帧内叠 getBoundingClientRect 的「拖住」感
      if (t - lastStreamReconcileMsRef.current >= 120) {
        lastStreamReconcileMsRef.current = t;
        scrollRef.current.reconcile();
      }
    } catch {
      /* ignore */
    }

    const rawEnd = fullTextRef.current;
    const mainEnd = hasAssistantCotMarkers(rawEnd)
      ? extractAssistantCotAndMain(rawEnd).mainContent.length
      : rawEnd.length;
    if (streamPaintShownLenRef.current < mainEnd) {
      streamPaintRafRef.current = requestAnimationFrame(() => runStreamPaintTickRef.current());
      return;
    }

    if (pendingStreamFinalizeRef.current) {
      finalizeStreamingAssistantMessage(rawEnd);
    }
  };

  const scheduleStreamUiTick = useCallback(() => {
    if (streamPaintRafRef.current != null) return;
    streamPaintRafRef.current = requestAnimationFrame(() => runStreamPaintTickRef.current());
  }, []);

  // ── ensureStreamingAssistantMessage ───────────────────────────────────────
  const ensureStreamingAssistantMessage = useCallback(() => {
    if (pendingFullTextSyncRafRef.current != null) return;
    pendingFullTextSyncRafRef.current = requestAnimationFrame(() => {
      pendingFullTextSyncRafRef.current = null;
      const buf = fullTextRef.current;
      const visibleMain = hasAssistantCotMarkers(buf)
        ? extractAssistantCotAndMain(buf).mainContent
        : buf;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          return prev;
        }
        if (!visibleMain || !visibleMain.trim()) return prev;
        return [
          ...prev,
          {
            id: getNextMessageId(),
            role: 'assistant' as const,
            content: buf,
            isStreaming: true,
            timestamp: Date.now(),
          },
        ];
      });
    });
  }, [getNextMessageId, setMessages]);

  const scheduleUsageFlush = useCallback(() => {
    if (usageFlushRafRef.current != null) return;
    usageFlushRafRef.current = requestAnimationFrame(() => {
      usageFlushRafRef.current = null;
      const batch = usageBatchRef.current;
      usageBatchRef.current = [];
      if (batch.length === 0) return;
      for (const { usage, isSnapshot } of batch) {
        if (usage.inputTokens != null) {
          if (isSnapshot) setTokenIn(usage.inputTokens);
          else setTokenIn((v) => (v ?? 0) + usage.inputTokens);
        }
        if (usage.outputTokens != null) {
          if (isSnapshot) setTokenOut(usage.outputTokens);
          else setTokenOut((v) => (v ?? 0) + usage.outputTokens);
        }
        if (usage.cost != null) {
          if (isSnapshot) setCost(Number(usage.cost));
          else setCost((v) => (v ?? 0) + Number(usage.cost));
        }
        if (usage.ctxUsed != null) setCtxUsed(usage.ctxUsed);
        if (usage.ctxMax != null) setCtxMax(usage.ctxMax);
        if (usage.session != null) setSession(usage.session);
      }
    });
  }, []);

  // ── useWebSocket ──────────────────────────────────────────────────────────
  const ws = useWebSocket({
    onChatDelta: (content, isDelta, isSystemReply) => {
      if (!content) return;
      if (!isSystemReply) {
        setAwaitingResponse(false);
        if (isDelta) setAgentPhase('typing');
      }

      const pendingSysDelta = isSystemReply || (pendingSystemReplyMap.current.get(lastSentRequestId.current) ?? false);
      if (pendingSysDelta) {
        systemReplyBufferRef.current = isDelta
          ? systemReplyBufferRef.current + content
          : content;
        // 系统命令只保留一份最终输出，不走流式占位，避免重复渲染。
      } else {
        if (isDelta) {
          streamingMessageRef.current += content;
        } else {
          streamingMessageRef.current = content;
        }
        fullTextRef.current = streamingMessageRef.current;

        if (isDelta && oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
          try { oct.fsm.onToken(); } catch {}
        }

        scheduleStreamUiTick();
        ensureStreamingAssistantMessage();
      }
    },

    onChatDone: (content, systemReplyHint) => {
      const currentRequestId = lastSentRequestId.current;
      const systemReply = systemReplyHint || (pendingSystemReplyMap.current.get(currentRequestId) ?? false);
      pendingSystemReplyMap.current.delete(currentRequestId);

      if (!systemReply) {
        setAwaitingResponse(false);
        setAgentPhase('idle');
        setActiveTools([]);
      }

      if (!systemReply) {
        const fallbackText = stripTextToolAnnotations(stripThinkModeMarker(String(content || '').trim()));
        if (fallbackText && !fullTextRef.current.trim()) {
          streamingMessageRef.current = fallbackText;
          fullTextRef.current = fallbackText;
          ensureStreamingAssistantMessage();
        }
        try {
          oct.stream.end();
          scheduleFinalizeFallback(fallbackText);
        } catch {
          recoverOctStreamFromEndFailure(oct);
          const fb = fallbackText;
          if (fb) {
            streamingMessageRef.current = fb;
            fullTextRef.current = fb;
            pendingStreamFinalizeRef.current = true;
            scheduleStreamUiTick();
            ensureStreamingAssistantMessage();
          } else {
            scheduleFinalizeFallback('');
          }
        }
        return;
      }

      let finalStreamContent = systemReplyBufferRef.current || content;
      systemReplyBufferRef.current = '';
      if (finalStreamContent) {
        if (!systemReply) {
          streamingMessageRef.current = finalStreamContent;
          fullTextRef.current = finalStreamContent;
        }
      }

      const text = finalStreamContent;
      if (systemReply && text.startsWith('🦞')) {
        const modelMatch = text.match(/Model:\s*(.+)/);
        const tokensMatch = text.match(/Tokens:\s*([\d.]+)k?\s*\/\s*([\d.]+)k/i);
        const ctxMatch1 = text.match(/Context:\s*([\d.]+)\s*\/\s*([\d.]+)k\s*\((\d+)%\)/i);
        const ctxMatch2 = text.match(/Context:\s*([\d.]+)k\s*tokens/i);

        if (modelMatch) setModelName(modelMatch[1].trim());
        if (tokensMatch) {
          setTokenIn(parseFloat(tokensMatch[1]) * 1000);
          setCtxMax(parseFloat(tokensMatch[2]) * 1000);
        }
        if (ctxMatch1) {
          setCtxUsed(parseFloat(ctxMatch1[1]) * 1000);
          setCtxMax(parseFloat(ctxMatch1[2]) * 1000);
        } else if (ctxMatch2) {
          setCtxUsed(parseFloat(ctxMatch2[1]) * 1000);
        }

        const apiKeyMatch = text.match(/api-key\s*\(([^)]+)\)/i);
        const thinkMatch = text.match(/(?:Reasoning|Think):\s*(\S+)/i);
        const runtimeMatch = text.match(/Runtime:\s*(\S+)/i);
        const compactMatch = text.match(/Compactions:\s*(\d+)/i);
        const queueMatch = text.match(/Queue:\s*(.+)/i);

        if (apiKeyMatch) setApiKeyInfo(`api-key (${apiKeyMatch[1]})`);
        if (thinkMatch) setThinkMode(thinkMatch[1]);
        if (runtimeMatch) setRuntimeMode(runtimeMatch[1]);
        if (compactMatch) setCompactions(parseInt(compactMatch[1]));
        if (queueMatch) setQueueInfo(queueMatch[1].trim());
      }

      setMessages((prev) => {
        const cleanedPrev = systemReply
          ? prev.filter((msg) => !(msg.role === 'assistant' && msg.isStreaming))
          : prev;
        const last = cleanedPrev[cleanedPrev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          return cleanedPrev.map((msg, idx) =>
            idx === cleanedPrev.length - 1
              ? { ...msg, content: finalStreamContent, isStreaming: false }
              : msg
          );
        }
        if (finalStreamContent) {
          const textContent = finalStreamContent.trim();
          if (!textContent) return cleanedPrev;
          if (last?.role === 'assistant' && !last.isStreaming && last.content?.trim() === textContent) {
            return cleanedPrev;
          }
          return [
            ...cleanedPrev,
            {
              id: getNextMessageId(),
              role: 'assistant' as const,
              content: textContent,
                isStreaming: false,
                isSystemReply: systemReply,
                timestamp: Date.now(),
              },
          ];
        }
        return cleanedPrev;
      });
    },

    onAgentPhase: (phase, elapsed) => {
      setAgentPhase(phase);
      if (phase === 'thinking' && elapsed != null) setThinkingElapsed(elapsed);
      if (phase === 'idle' || phase === 'typing') setThinkingElapsed(0);
    },

    onToolEvent: (payload) => {
      if (payload.type === 'tool_call') {
        setActiveTools((prev) => {
          const next = [
            ...prev,
            { callId: payload.callId, tool: payload.tool, state: 'executing' as const },
          ];
          if (prev.length === 0 && next.length > 0) {
            requestAnimationFrame(() => { scroll.reconcile(); });
          }
          return next;
        });
      } else if (payload.type === 'tool_result') {
        const finalState = (payload.state === 'error' ? 'error' : 'done') as 'done' | 'error';
        setActiveTools((prev) =>
          prev.map((t) =>
            t.callId === payload.callId
              ? { ...t, state: finalState, resultPreview: payload.resultPreview }
              : t
          )
        );
      }
    },

    onWorkbenchEvent: (event) => {
      workbenchBus.dispatch(toWorkbenchCommand(event));
    },

    onUsage: (usage, isSnapshot) => {
      usageBatchRef.current.push({ usage, isSnapshot });
      scheduleUsageFlush();
    },

    onModelName: (name) => setModelName(name),
  });

  // ── FSM subscribe ─────────────────────────────────────────────────────────
  useEffect(() => {
    return oct.fsm.subscribe((phase) => {
      setFsmPhase(phase);
    });
  }, [oct.fsm]);

  // ── OCT stream subscription ───────────────────────────────────────────────
  useEffect(() => {
    const { stream, ingest } = oct;

    const applyRawToMessages = () => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          return prev.map((m, idx) =>
            idx === prev.length - 1
              ? (
                  m.isStreamingRaw
                    ? m
                    : { ...m, isStreamingRaw: true }
                )
              : m
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
        scheduleStreamUiTick();
      }
        if (event.type === 'state' && event.payload.state === StreamState.COMPLETED) {
        queueMicrotask(() => {
          // 取消 fallback 定时器：流式结束，由 runStreamPaintTick 负责终止，不需要 fallback 抢先
          if (finalizeFallbackTimerRef.current != null) {
            clearTimeout(finalizeFallbackTimerRef.current);
            finalizeFallbackTimerRef.current = null;
          }
          pendingStreamFinalizeRef.current = true;
          scheduleStreamUiTick();
          try { stream.close(); } catch (e) { console.warn('[useMessages] stream.close', e); }
        });
      }
    });

    return () => { unsubscribe(); };
  }, [oct, getNextMessageId, setMessages, scheduleStreamUiTick]);

  // ── pendingPills: reset on messages change ────────────────────────────────
  useEffect(() => {
    setPendingPills(null);
  }, [messages]);

  // ── onStatusChange notification ───────────────────────────────────────────
  useEffect(() => {
    onStatusChange?.(ws.wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax);
  }, [ws.wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax, onStatusChange]);

  // ── streamPaintRafRef / usageFlushRafRef cleanup ───────────────────────────
  useEffect(() => {
    return () => {
      if (finalizeFallbackTimerRef.current != null) {
        clearTimeout(finalizeFallbackTimerRef.current);
        finalizeFallbackTimerRef.current = null;
      }
      if (streamPaintRafRef.current != null) {
        cancelAnimationFrame(streamPaintRafRef.current);
        streamPaintRafRef.current = null;
      }
      if (usageFlushRafRef.current != null) {
        cancelAnimationFrame(usageFlushRafRef.current);
        usageFlushRafRef.current = null;
      }
    };
  }, []);

  // ── sendMessage ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (
    text: string,
    imageDataUrl: string | null,
    files?: UploadedFile[],
    workbenchContext?: WorkbenchRoundtripContext
  ) => {
    if (!text.trim() && !imageDataUrl && !files?.length) return;

    let contentToSend = text;
    let fileRefs = '';

    if (files && files.length > 0) {
      fileRefs = '\n\n[附件]' + files.map((f) => {
        const size = f.size < 1024 ? `${f.size}B` : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)}KB` : `${(f.size / (1024 * 1024)).toFixed(1)}MB`;
        if (f.path) return `\n- ${f.name} (${size}): ${f.path}`;
        if (f.isText && f.content) return `\n\`\`\`${f.ext}\n${f.content}\n\`\`\``;
        return `\n- ${f.name} (${size}) [无路径]`;
      }).join('');
    }

    if (imageDataUrl) {
      contentToSend = (text ? `${text}\n` : '') + '[用户发送了一张图片，请根据上下文回复]';
    }

    const fullContentForAMY = contentToSend + fileRefs;
    const displayContent = contentToSend + (files && files.length > 0 ? '\n\n📎 ' + files.map((f) => f.name).join(', ') : '');

    const permCheck = checkPermission(fullContentForAMY, permissions);
    if (!permCheck.allowed) {
      window.alert(permCheck.reason || '此操作已被权限设置拦截');
      return;
    }
    const dangerMatch = getDangerMatch(fullContentForAMY);
    if (dangerMatch) {
      const ok = window.confirm(
        `危险操作警告\n\n检测到: ${dangerMatch.desc}\n级别: ${dangerMatch.level}\n\n确认仍要发送此消息？`
      );
      if (!ok) return;
    }

    const newRequestId = Date.now().toString();
    lastSentRequestId.current = newRequestId;
    const cmdIsSystem = !imageDataUrl && !files?.length && isSystemCommand(fullContentForAMY);
    const thinkCmdMatch = fullContentForAMY.trim().match(/^\/(?:think|cot)\s+(off|low|medium|high)\b/i);
    if (thinkCmdMatch) setThinkMode(thinkCmdMatch[1].toLowerCase());
    pendingSystemReplyMap.current.set(newRequestId, cmdIsSystem);
    streamingMessageRef.current = '';
    fullTextRef.current = '';
    streamPaintShownLenRef.current = 0;
    streamPaintBudgetRef.current = 0;
    streamPaintLastTsRef.current = 0;
    pendingStreamFinalizeRef.current = false;
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
      finalizeFallbackTimerRef.current = null;
    }
    if (streamPaintRafRef.current != null) {
      cancelAnimationFrame(streamPaintRafRef.current);
      streamPaintRafRef.current = null;
    }
    typewriter.reset();
    resetSoundCounter();
    oct.ingest.reset();
    if (!cmdIsSystem) {
      setAwaitingResponse(true);
      setAgentPhase('thinking');
    }
    setActiveTools([]);
    setStreak(touchStreak());
    setPendingPills(null);
    setMessages((prev) => {
      const next: ChatMessage[] = [
        ...prev,
        {
          id: getNextMessageId(),
          role: 'user' as const,
          content: displayContent,
          timestamp: Date.now(),
          imageDataUrl: imageDataUrl || undefined,
          files: files,
        },
      ];
      if (!cmdIsSystem) {
        next.push({
          id: getNextMessageId(),
          role: 'assistant' as const,
          content: '',
          isStreaming: true,
          isStreamingRaw: true,
          timestamp: Date.now(),
        });
      }
      return next;
    });
    scroll.scrollAfterUserSend();

    if (!cmdIsSystem) {
      try {
        oct.stream.abortToIdle();
        if (oct.fsm.getPhase() !== TurnPhase.IDLE) {
          oct.fsm.onCancel();   // STREAMING/… → CANCELLED → IDLE
        }
        oct.fsm.onUserTyping();
        oct.fsm.onUserSubmit();
        oct.fsm.onRequestStart();
        oct.ingest.reset();
        oct.stream.open();
      } catch (e) {
        console.warn('[useMessages] oct runtime (send)', e);
      }
    }

    const roundtripContext = workbenchContext ?? workbenchBus.getContext('continue');
    const result = await ws.send(fullContentForAMY, imageDataUrl || undefined, files, transportPacingMs, roundtripContext);
    if (!result?.success && !cmdIsSystem) {
      setAwaitingResponse(false);
      console.warn('[useMessages] Send failed:', result);
      try {
        oct.stream.abortToIdle();
        recoverOctStreamFromEndFailure(oct);
      } catch (e) {
        console.warn('[useMessages] send failed cleanup', e);
      }
    }
  }, [getNextMessageId, permissions, scroll.scrollAfterUserSend, oct, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── quickSend ─────────────────────────────────────────────────────────────
  const quickSend = useCallback((content: string) => {
    if (!content.trim()) return;

    const permCheck = checkPermission(content.trim(), permissions);
    if (!permCheck.allowed) {
      window.alert(permCheck.reason || '此操作已被权限设置拦截');
      return;
    }
    const dangerMatch = getDangerMatch(content.trim());
    if (dangerMatch) {
      const ok = window.confirm(
        `危险操作警告\n\n检测到: ${dangerMatch.desc}\n级别: ${dangerMatch.level}\n\n确认仍要发送此消息？`
      );
      if (!ok) return;
    }

    const newRequestId = Date.now().toString();
    lastSentRequestId.current = newRequestId;
    const isSystem = isSystemCommand(content.trim());
    const thinkCmdMatch = content.trim().match(/^\/(?:think|cot)\s+(off|low|medium|high)\b/i);
    if (thinkCmdMatch) setThinkMode(thinkCmdMatch[1].toLowerCase());
    pendingSystemReplyMap.current.set(newRequestId, isSystem);
    streamingMessageRef.current = '';
    fullTextRef.current = '';
    streamPaintShownLenRef.current = 0;
    streamPaintBudgetRef.current = 0;
    streamPaintLastTsRef.current = 0;
    pendingStreamFinalizeRef.current = false;
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
      finalizeFallbackTimerRef.current = null;
    }
    if (streamPaintRafRef.current != null) {
      cancelAnimationFrame(streamPaintRafRef.current);
      streamPaintRafRef.current = null;
    }
    typewriter.reset();
    resetSoundCounter();
    oct.ingest.reset();
    if (!isSystem) {
      setAwaitingResponse(true);
      setAgentPhase('thinking');
    }
    setActiveTools([]);
    setPendingPills(null);
    setMessages((prev) => {
      const next: ChatMessage[] = [
        ...prev,
        { id: getNextMessageId(), role: 'user', content: content.trim(), timestamp: Date.now() },
      ];
      if (!isSystem) {
        next.push({
          id: getNextMessageId(),
          role: 'assistant' as const,
          content: '',
          isStreaming: true,
          isStreamingRaw: true,
          timestamp: Date.now(),
        });
      }
      return next;
    });
    scroll.scrollAfterUserSend();
    if (!isSystem) {
      try {
        oct.stream.abortToIdle();
        if (oct.fsm.getPhase() !== TurnPhase.IDLE) {
          oct.fsm.onCancel();   // STREAMING/… → CANCELLED → IDLE
        }
        oct.fsm.onUserTyping();
        oct.fsm.onUserSubmit();
        oct.fsm.onRequestStart();
        oct.ingest.reset();
        oct.stream.open();
      } catch (e) {
        console.warn('[useMessages] oct runtime (quickSend)', e);
      }
    }
    ws.send(content.trim(), undefined, undefined, transportPacingMs, workbenchBus.getContext('continue')).then((result) => {
      if (!result?.success && !isSystem) {
        setAwaitingResponse(false);
        try {
          oct.stream.abortToIdle();
          recoverOctStreamFromEndFailure(oct);
        } catch (e) {
          console.warn('[useMessages] quickSend failed cleanup', e);
        }
      }
    });
  }, [getNextMessageId, permissions, scroll.scrollAfterUserSend, oct, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    wsConnected: ws.wsConnected,
    wsReconnecting: ws.wsReconnecting,
    wsError: ws.wsError,
    nocturneOnline: ws.nocturneOnline,
    fsmPhase,
    isStreaming,
    awaitingResponse,
    agentPhase,
    thinkingElapsed,
    activeTools,
    tokenIn,
    tokenOut,
    ctxUsed,
    ctxMax,
    modelName,
    thinkMode,
    pendingPills,
    streak,
    fullTextRef,
    streamingDomRef,
    sendMessage,
    quickSend,
  };
}
