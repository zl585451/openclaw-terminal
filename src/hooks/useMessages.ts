import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { TurnFSM, deriveLegacyFlags, TurnPhase } from '../core/turnFSM';
import { StreamRouter, StreamState } from '../core/streamRouter';
import { BlockIngest } from '../core/blockIngest';
import { useWebSocket } from './useWebSocket';
import { useCanvas } from '../contexts/CanvasContext';
import type { CanvasRoundtripContext } from '../contexts/CanvasContext';
import { checkPermission, getDangerMatch } from '../utils/permissionCheck';
import type { PermissionConfig } from '../utils/permissionCheck';
import type { UseTypewriterReturn } from './useTypewriter';
import type { ChatMessage, UploadedFile } from '../ui/chat/ChatTab.v2';
import { extractAssistantCotAndMain, hasAssistantCotMarkers } from '../utils/cotExtract';
import { stripThinkModeMarker } from '../utils/socraticTemplates';

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
  return /^\/(status|restart|stop|new|think\s+\w+|model|provider|memory|help)\b/.test(t);
}

function recoverOctStreamFromEndFailure(oct: { stream: StreamRouter; fsm: TurnFSM }): void {
  try {
    oct.stream.abortToIdle();
  } catch {
    /* ignore */
  }
  try {
    if (oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
      oct.fsm.onToken();
    }
    if (oct.fsm.getPhase() === TurnPhase.STREAMING) {
      oct.fsm.onStreamEnd();
      oct.fsm.onRenderDone();
    }
    oct.fsm.onTurnFinish();
  } catch (e) {
    console.warn('[useMessages] recoverOctStreamFromEndFailure', e);
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
  pendingPills: string[] | null;
  streak: number;
  fullTextRef: MutableRefObject<string>;
  streamingDomRef: MutableRefObject<HTMLPreElement | null>;
  sendMessage: (text: string, imageDataUrl: string | null, files?: UploadedFile[], canvasContext?: CanvasRoundtripContext) => Promise<void>;
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
  onStatusChange,
}: UseMessagesOptions): UseMessagesReturn {
  const canvas = useCanvas();
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
  const [, setThinkMode] = useState<string>('off');
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
  const runStreamPaintTickRef = useRef<() => void>(() => {});
  const pendingSystemReplyMap = useRef<Map<string, boolean>>(new Map());
  const lastSentRequestId = useRef<string>('');
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
    const finalRaw = stripThinkModeMarker(rawText ?? fullTextRef.current ?? '');
    pendingStreamFinalizeRef.current = false;
    streamPaintShownLenRef.current = 0;
    streamPaintBudgetRef.current = 0;
    streamPaintLastTsRef.current = 0;
    try { oct.fsm.onTurnFinish(); } catch (e) { console.warn('[useMessages] fsm.onTurnFinish', e); }
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
      let effectiveMs = Math.max(3, streamSpeedMsRef.current);
      if (behind > 32) effectiveMs *= 0.9;
      if (behind > 96) effectiveMs *= 0.82;
      if (pendingStreamFinalizeRef.current) effectiveMs *= 0.7;

      streamPaintBudgetRef.current += dt / effectiveMs;
      let step = Math.floor(streamPaintBudgetRef.current);
      if (step <= 0 && streamPaintBudgetRef.current >= 0.82) {
        step = 1;
      }
      step = Math.min(behind, Math.max(0, Math.min(step, pendingStreamFinalizeRef.current ? 5 : 3)));

      if (step > 0) {
        streamPaintBudgetRef.current = Math.max(0, streamPaintBudgetRef.current - step);
        shown = Math.min(targetLen, shown + step);
        streamPaintShownLenRef.current = shown;
        el.textContent = main.slice(0, shown);
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
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          return prev;
        }
        if (!buf || !buf.trim()) return prev;
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
    onChatDelta: (content, isDelta) => {
      if (!content) return;
      setAwaitingResponse(false);
      if (isDelta) setAgentPhase('typing');

      const pendingSysDelta = pendingSystemReplyMap.current.get(lastSentRequestId.current) ?? false;
      if (pendingSysDelta) {
        if (isDelta) {
          streamingMessageRef.current += content;
          fullTextRef.current += content;
        } else {
          streamingMessageRef.current = content;
          fullTextRef.current = content;
        }
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

    onChatDone: (content) => {
      setAwaitingResponse(false);
      setAgentPhase('idle');
      setActiveTools([]);
      const currentRequestId = lastSentRequestId.current;
      const systemReply = pendingSystemReplyMap.current.get(currentRequestId) ?? false;
      pendingSystemReplyMap.current.delete(currentRequestId);

      if (!systemReply) {
        try {
          oct.stream.end();
        } catch {
          recoverOctStreamFromEndFailure(oct);
          const fb = String(content || '').trim();
          if (fb) {
            streamingMessageRef.current = fb;
            fullTextRef.current = fb;
            pendingStreamFinalizeRef.current = true;
            scheduleStreamUiTick();
            ensureStreamingAssistantMessage();
          }
        }
        return;
      }

      let finalStreamContent = streamingMessageRef.current || content;
      if (finalStreamContent) {
        streamingMessageRef.current = finalStreamContent;
        fullTextRef.current = finalStreamContent;
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

    onCanvasEvent: (event) => {
      canvas.applyCanvasEvent(event);
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
    canvasContext?: CanvasRoundtripContext
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
    pendingSystemReplyMap.current.set(newRequestId, cmdIsSystem);
    streamingMessageRef.current = '';
    fullTextRef.current = '';
    streamPaintShownLenRef.current = 0;
    streamPaintBudgetRef.current = 0;
    streamPaintLastTsRef.current = 0;
    pendingStreamFinalizeRef.current = false;
    if (streamPaintRafRef.current != null) {
      cancelAnimationFrame(streamPaintRafRef.current);
      streamPaintRafRef.current = null;
    }
    typewriter.reset();
    oct.ingest.reset();
    if (!cmdIsSystem) {
      setAwaitingResponse(true);
      setAgentPhase('thinking');
    }
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
        if (oct.fsm.getPhase() === TurnPhase.IDLE) {
          oct.fsm.onUserTyping();
        }
        oct.fsm.onUserSubmit();
        oct.fsm.onRequestStart();
        oct.ingest.reset();
        oct.stream.open();
      } catch (e) {
        console.warn('[useMessages] oct runtime (send)', e);
      }
    }

    const result = await ws.send(fullContentForAMY, imageDataUrl || undefined, files, transportPacingMs, canvasContext);
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
  }, [getNextMessageId, permissions, scroll.scrollAfterUserSend, oct]); // eslint-disable-line react-hooks/exhaustive-deps

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
    pendingSystemReplyMap.current.set(newRequestId, isSystem);
    streamingMessageRef.current = '';
    fullTextRef.current = '';
    streamPaintShownLenRef.current = 0;
    streamPaintBudgetRef.current = 0;
    streamPaintLastTsRef.current = 0;
    pendingStreamFinalizeRef.current = false;
    if (streamPaintRafRef.current != null) {
      cancelAnimationFrame(streamPaintRafRef.current);
      streamPaintRafRef.current = null;
    }
    typewriter.reset();
    oct.ingest.reset();
    if (!isSystem) {
      setAwaitingResponse(true);
      setAgentPhase('thinking');
    }
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
        if (oct.fsm.getPhase() === TurnPhase.IDLE) {
          oct.fsm.onUserTyping();
        }
        oct.fsm.onUserSubmit();
        oct.fsm.onRequestStart();
        oct.ingest.reset();
        oct.stream.open();
      } catch (e) {
        console.warn('[useMessages] oct runtime (quickSend)', e);
      }
    }
    ws.send(content.trim(), undefined, undefined, transportPacingMs).then((result) => {
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
  }, [getNextMessageId, permissions, scroll.scrollAfterUserSend, oct]); // eslint-disable-line react-hooks/exhaustive-deps

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
    pendingPills,
    streak,
    fullTextRef,
    streamingDomRef,
    sendMessage,
    quickSend,
  };
}
