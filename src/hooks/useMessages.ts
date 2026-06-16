import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { TurnFSM, deriveLegacyFlags, TurnPhase } from '../core/turnFSM';
import { StreamRouter, StreamState } from '../core/streamRouter';
import { BlockIngest } from '../core/blockIngest';
import { useWebSocket } from './useWebSocket';
import type { WorkbenchRoundtripContext } from '../workbench/types';
import { workbenchBus } from '../workbench/WorkbenchBus';
import { toWorkbenchCommand } from '../workbench/types';
import { guardMessagePermission } from '../utils/permissionCheck';
import type { PermissionConfig } from '../utils/permissionCheck';
import type { UseTypewriterReturn } from './useTypewriter';
import type { ChatMessage, UploadedFile, ToolEventItem } from '../ui/chat/chatTypes';
import type { RenderBlock } from '../types/renderProtocol';
import type { ClarifyCardSpec } from '../core/clarifyCard/types';
import { getAssistantVisibleMain, normalizeAssistantTranscriptContent } from '../utils/cotExtract';
import { parseSystemReplyStatus } from '../utils/systemReplyParser';
import { resetSoundCounter, type TypingSoundMode } from '../utils/clickSound';
import { useProject } from '../contexts/ProjectContext';
import { useTokenUsage } from './useTokenUsage';
import { useActivityTimeline } from './useActivityTimeline';
import { useStreamPainting } from './useStreamPainting';
import type { ActivityEntry } from './useActivityTimeline';
export type { ActivityEntryType, ActivityEntry } from './useActivityTimeline';

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

export function preferDoneTextWhenMoreComplete(currentRaw: string, doneText: string): string {
  const current = currentRaw || '';
  const done = doneText || '';
  if (!done.trim()) return current;
  if (!current.trim()) return done;
  if (done.length > current.length) return done;
  return current;
}

export function shouldSuppressAssistantTextForClarify(pendingClarifyOpen: boolean, doneText: string): boolean {
  return pendingClarifyOpen && !String(doneText || '').trim();
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ActiveTool {
  callId: string;
  tool: string;
  state: 'executing' | 'done' | 'error';
  resultPreview?: string;
}

export interface GatewayCapabilities {
  model?: string;
  toolsSupport?: 'supported' | 'unknown' | 'unsupported';
  capabilitySource?: string;
  supportsTools?: boolean;
  supportsStreamOptions?: boolean;
  mcpReady?: boolean;
  mcpServers?: number;
  mcpConnectedServers?: number;
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
  onClarifyOpen?: (spec: ClarifyCardSpec) => void;
}

export interface UseMessagesReturn {
  wsConnected: boolean;
  wsReconnecting: boolean;
  wsError: string | null;
  memoryOnline: boolean;
  fsmPhase: TurnPhase;
  isStreaming: boolean;
  awaitingResponse: boolean;
  agentPhase: 'idle' | 'thinking' | 'typing' | 'tool_executing';
  thinkingElapsed: number;
  activeTools: ActiveTool[];
  activityTimeline: ActivityEntry[];
  gatewayCapabilities: GatewayCapabilities | null;
  tokenIn: number | null;
  tokenOut: number | null;
  ctxUsed: number | null;
  ctxMax: number | null;
  modelName: string;
  thinkMode: string;
  pendingPills: string[] | null;
  streak: number;
  fullTextRef: MutableRefObject<string>;
  streamingRenderText: string;
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
  onClarifyOpen,
}: UseMessagesOptions): UseMessagesReturn {
  const transportPacingMs = 4;
  const { activeProject } = useProject();
  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
  const streamSpeedMsRef = useRef(streamSpeedMs);
  streamSpeedMsRef.current = streamSpeedMs;
  // ── State ─────────────────────────────────────────────────────────────────
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [agentPhase, setAgentPhase] = useState<'idle' | 'thinking' | 'typing' | 'tool_executing'>('idle');
  const [activeTools, setActiveTools] = useState<ActiveTool[]>([]);
  const [gatewayCapabilities, setGatewayCapabilities] = useState<GatewayCapabilities | null>(null);
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [, setApiKeyInfo] = useState<string>('--');
  const [thinkMode, setThinkMode] = useState<string>('off');
  const [, setRuntimeMode] = useState<string>('direct');
  const [, setCompactions] = useState<number | null>(null);
  const [, setQueueInfo] = useState<string>('--');
  const [modelName, setModelName] = useState('--');
  const [pendingPills, setPendingPills] = useState<string[] | null>(null);
  const [fsmPhase, setFsmPhase] = useState(() => oct.fsm.getPhase());
  const [streamingRenderText, setStreamingRenderText] = useState('');
  /** 流式阶段 reconcile 每帧调用会引发大量 layout；限制频率 */
  const lastStreamReconcileMsRef = useRef(0);
  const {
    tokenIn,
    tokenOut,
    ctxUsed,
    ctxMax,
    onUsage,
    resetUsage,
    setFromSystemReply,
  } = useTokenUsage();
  const {
    activityTimeline,
    onToolEvent: onToolEventTimeline,
    onKeepalive: onKeepaliveTimeline,
    resetTimeline,
    resetWithThinkingPlaceholder,
    removeTypes: removeTimelineTypes,
    scheduleCotSyncFromFullText,
  } = useActivityTimeline(messages);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const streamingMessageRef = useRef('');
  const fullTextRef = useRef<string>('');
  const streamingDomRef = useRef<HTMLPreElement | null>(null);
  const pendingFullTextSyncRafRef = useRef<number | null>(null);
  const pendingStreamFinalizeRef = useRef(false);
  const finalizeFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSystemReplyMap = useRef<Map<string, boolean>>(new Map());
  const pendingClarifyOpenRef = useRef(false);
  const lastSentRequestId = useRef<string>('');
  const systemReplyBufferRef = useRef('');
  const roundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ROUND_TIMEOUT_MS = 10 * 60 * 1000;
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
    const finalRaw = normalizeAssistantTranscriptContent(rawText ?? fullTextRef.current ?? '');
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
      finalizeFallbackTimerRef.current = null;
    }
    pendingStreamFinalizeRef.current = false;
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
      const fallbackRaw = normalizeAssistantTranscriptContent(rawText ?? fullTextRef.current ?? '');
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

  const { startPainting, stopPainting } = useStreamPainting(
    {
      ...oct,
      __streamPainting: {
        scrollReconcile: scrollRef.current.reconcile,
        streamSpeedMsRef,
        typingSound,
        typingSoundVolume,
        fullTextRef,
        streamingDomRef,
        onVisibleText: setStreamingRenderText,
        finalizeStreamingAssistantMessage,
        pendingStreamFinalizeRef,
        lastStreamReconcileMsRef,
      },
    },
    setMessages,
    scrollRef.current.reconcile,
  );

  // ── ensureStreamingAssistantMessage ───────────────────────────────────────
  const ensureStreamingAssistantMessage = useCallback(() => {
    if (pendingFullTextSyncRafRef.current != null) return;
    pendingFullTextSyncRafRef.current = requestAnimationFrame(() => {
      pendingFullTextSyncRafRef.current = null;
      const buf = fullTextRef.current;
      const visibleMain = getAssistantVisibleMain(buf);
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

  const clearRoundTimeout = useCallback(() => {
    if (roundTimeoutRef.current != null) {
      clearTimeout(roundTimeoutRef.current);
      roundTimeoutRef.current = null;
    }
  }, []);

  const startRoundTimeout = useCallback(() => {
    clearRoundTimeout();
    roundTimeoutRef.current = setTimeout(() => {
      roundTimeoutRef.current = null;
      setAwaitingResponse(false);
      setAgentPhase('idle');
      setActiveTools([]);
      removeTimelineTypes(['keepalive_hint']);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        const timeoutText = '⏱️ 本轮请求超时（10 分钟），已自动结束。你可以重试，或先让我用不依赖工具的方式回答。';
        if (last?.role === 'assistant' && last.isStreaming) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              isStreaming: false,
              isStreamingRaw: false,
              content: timeoutText,
              isSystemReply: true,
              timestamp: Date.now(),
            },
          ];
        }
        return [
          ...prev,
          {
            id: getNextMessageId(),
            role: 'assistant' as const,
            content: timeoutText,
            isStreaming: false,
            isSystemReply: true,
            timestamp: Date.now(),
          },
        ];
      });
      try {
        oct.stream.abortToIdle();
      } catch {}
      try {
        recoverOctStreamFromEndFailure(oct);
      } catch {}
    }, ROUND_TIMEOUT_MS);
  }, [ROUND_TIMEOUT_MS, clearRoundTimeout, getNextMessageId, oct, setMessages]);

  // ── useWebSocket ──────────────────────────────────────────────────────────
  const ws = useWebSocket({
    onChatDelta: (content, isDelta, isSystemReply, turnId) => {
      const currentTurnId = lastSentRequestId.current;
      if (turnId && currentTurnId && turnId !== currentTurnId) return;
      if (!content) return;
      if (!isSystemReply) {
        setAwaitingResponse(false);
        if (isDelta) setAgentPhase('typing');
      }

      const pendingSystemReplyKey = turnId || currentTurnId;
      const pendingSysDelta = isSystemReply || (pendingSystemReplyMap.current.get(pendingSystemReplyKey) ?? false);
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

        scheduleCotSyncFromFullText(fullTextRef.current);

        if (isDelta && oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
          try { oct.fsm.onToken(); } catch {}
        }

        startPainting();
        ensureStreamingAssistantMessage();
      }
    },

    onChatDone: (content, systemReplyHint, turnId, renderBlocks?: RenderBlock[]) => {
      const currentRequestId = lastSentRequestId.current;
      if (turnId && currentRequestId && turnId !== currentRequestId) return;
      clearRoundTimeout();
      const systemReplyKey = turnId || currentRequestId;
      const systemReply = systemReplyHint || (pendingSystemReplyMap.current.get(systemReplyKey) ?? false);
      pendingSystemReplyMap.current.delete(systemReplyKey);

      if (!systemReply) {
        setAwaitingResponse(false);
        setAgentPhase('idle');
        setActiveTools([]);
        removeTimelineTypes(['keepalive_hint', 'thinking_placeholder']);
      }

      if (!systemReply) {
        const shouldSuppressClarifyText = shouldSuppressAssistantTextForClarify(
          pendingClarifyOpenRef.current,
          content,
        );
        pendingClarifyOpenRef.current = false;
        if (shouldSuppressClarifyText) {
          streamingMessageRef.current = '';
          fullTextRef.current = '';
          setStreamingRenderText('');
          pendingStreamFinalizeRef.current = false;
          stopPainting();
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last.isStreaming) {
              return prev.slice(0, -1);
            }
            return prev;
          });
          recoverOctStreamFromEndFailure(oct);
          return;
        }
        const fallbackText = normalizeAssistantTranscriptContent(String(content || '').trim());
        const finalText = preferDoneTextWhenMoreComplete(fullTextRef.current, fallbackText);
        if (finalText !== fullTextRef.current) {
          streamingMessageRef.current = finalText;
          fullTextRef.current = finalText;
          ensureStreamingAssistantMessage();
        }
        try {
          oct.stream.end();
          scheduleFinalizeFallback(finalText);
        } catch {
          recoverOctStreamFromEndFailure(oct);
          const fb = finalText;
          if (fb) {
            streamingMessageRef.current = fb;
            fullTextRef.current = fb;
            pendingStreamFinalizeRef.current = true;
            stopPainting();
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
        const status = parseSystemReplyStatus(text);
        if (status.modelName) setModelName(status.modelName);
        if (status.tokenIn != null || status.ctxMax != null || status.ctxUsed != null) {
          setFromSystemReply({
            ...(status.tokenIn != null ? { tokenIn: status.tokenIn } : {}),
            ...(status.ctxMax != null ? { ctxMax: status.ctxMax } : {}),
            ...(status.ctxUsed != null ? { ctxUsed: status.ctxUsed } : {}),
          });
        }
        if (status.apiKeyInfo) setApiKeyInfo(status.apiKeyInfo);
        if (status.thinkMode) setThinkMode(status.thinkMode);
        if (status.runtimeMode) setRuntimeMode(status.runtimeMode);
        if (status.compactions != null) setCompactions(status.compactions);
        if (status.queueInfo) setQueueInfo(status.queueInfo);
      }

      setMessages((prev) => {
        const cleanedPrev = systemReply
          ? prev.filter((msg) => !(msg.role === 'assistant' && msg.isStreaming))
          : prev;
        const last = cleanedPrev[cleanedPrev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          return cleanedPrev.map((msg, idx) =>
            idx === cleanedPrev.length - 1
              ? { ...msg, content: finalStreamContent, isStreaming: false, renderBlocks }
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
                renderBlocks,
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
        // 同步写入当前 streaming 消息的 toolEvents
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          const last = prev[lastIdx];
          if (!last || last.role !== 'assistant' || !last.isStreaming) return prev;
          const newEvent: ToolEventItem = {
            callId: payload.callId || payload.tool + '_' + Date.now(),
            tool: payload.tool,
            args: payload.args as Record<string, unknown> | undefined,
            state: 'executing',
            startedAt: Date.now(),
          };
          return [...prev.slice(0, lastIdx), { ...last, toolEvents: [...(last.toolEvents || []), newEvent] }];
        });
        onToolEventTimeline(payload);
      } else if (payload.type === 'tool_result') {
        const finalState = (payload.state === 'error' ? 'error' : 'done') as 'done' | 'error';
        setActiveTools((prev) =>
          prev.map((t) =>
            t.callId === payload.callId
              ? { ...t, state: finalState, resultPreview: payload.resultPreview }
              : t
          )
        );
        // 同步更新消息里对应卡片的状态
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          const last = prev[lastIdx];
          if (!last || last.role !== 'assistant' || !last.toolEvents?.length) return prev;
          const updatedEvents = last.toolEvents.map((evt) =>
            evt.callId !== payload.callId ? evt : {
              ...evt,
              state: finalState,
              resultPreview: payload.resultPreview,
              error: payload.error,
              elapsedMs: payload.elapsedMs,
            }
          );
          return [...prev.slice(0, lastIdx), { ...last, toolEvents: updatedEvents }];
        });
        onToolEventTimeline(payload);
      }
    },

    onClarifyOpen: (spec) => {
      pendingClarifyOpenRef.current = true;
      onClarifyOpen?.(spec);
    },

    onKeepalive: (payload) => {
      onKeepaliveTimeline(payload);
    },

    onWorkbenchEvent: (event) => {
      workbenchBus.dispatch(toWorkbenchCommand(event));
    },

    onUsage: (usage, isSnapshot) => {
      onUsage(usage, isSnapshot);
    },

    onModelName: (name) => setModelName(name),
    onGatewayCapabilities: (caps) => {
      setGatewayCapabilities(caps);
      if (caps?.model) setModelName(caps.model);
    },
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
        startPainting();
      }
        if (event.type === 'state' && event.payload.state === StreamState.COMPLETED) {
        queueMicrotask(() => {
          // 取消 fallback 定时器：流式结束，由 runStreamPaintTick 负责终止，不需要 fallback 抢先
          if (finalizeFallbackTimerRef.current != null) {
            clearTimeout(finalizeFallbackTimerRef.current);
            finalizeFallbackTimerRef.current = null;
          }
          pendingStreamFinalizeRef.current = true;
          stopPainting();
          try { stream.close(); } catch (e) { console.warn('[useMessages] stream.close', e); }
        });
      }
    });

    return () => { unsubscribe(); };
  }, [oct, getNextMessageId, setMessages, startPainting, stopPainting]);

  // ── pendingPills: reset on messages change ────────────────────────────────
  useEffect(() => {
    setPendingPills(null);
  }, [messages]);

  // ── onStatusChange notification ───────────────────────────────────────────
  useEffect(() => {
    onStatusChange?.(ws.wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax);
  }, [ws.wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax, onStatusChange]);

  // ── cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (roundTimeoutRef.current != null) {
        clearTimeout(roundTimeoutRef.current);
        roundTimeoutRef.current = null;
      }
      if (finalizeFallbackTimerRef.current != null) {
        clearTimeout(finalizeFallbackTimerRef.current);
        finalizeFallbackTimerRef.current = null;
      }
      stopPainting();
    };
  }, [stopPainting]);

  async function _sendMessageCore(options: {
    text: string;
    displayContent: string;
    fullContentForAMY: string;
    isSystem: boolean;
    newRequestId: string;
    imageDataUrl?: string;
    files?: UploadedFile[];
    workbenchContext?: WorkbenchRoundtripContext;
  }): Promise<void> {
    const {
      text,
      displayContent,
      fullContentForAMY,
      isSystem,
      newRequestId,
      imageDataUrl,
      files,
      workbenchContext,
    } = options;

    lastSentRequestId.current = newRequestId;
    const thinkCmdMatch = text.trim().match(/^\/(?:think|cot)\s+(off|low|medium|high)\b/i);
    if (thinkCmdMatch) setThinkMode(thinkCmdMatch[1].toLowerCase());
    pendingSystemReplyMap.current.set(newRequestId, isSystem);
    resetUsage();
    resetTimeline();
    streamingMessageRef.current = '';
    fullTextRef.current = '';
    setStreamingRenderText('');
    stopPainting();
    pendingStreamFinalizeRef.current = false;
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
      finalizeFallbackTimerRef.current = null;
    }
    typewriter.reset();
    resetSoundCounter();
    oct.ingest.reset();
    if (!isSystem) {
      setAwaitingResponse(true);
      setAgentPhase('thinking');
      startRoundTimeout();
    }
    setActiveTools([]);
    resetWithThinkingPlaceholder();
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
        console.warn('[useMessages] oct runtime (_sendMessageCore)', e);
      }
    }

    const roundtripContext = workbenchContext ?? workbenchBus.getContext('continue');
    const result = await ws.send(
      fullContentForAMY,
      imageDataUrl,
      files,
      transportPacingMs,
      roundtripContext,
      newRequestId,
      activeProject,
    );
    if (!result?.success && !isSystem) {
      clearRoundTimeout();
      setAwaitingResponse(false);
      console.warn('[useMessages] Send failed:', result);
      try {
        oct.stream.abortToIdle();
        recoverOctStreamFromEndFailure(oct);
      } catch (e) {
        console.warn('[useMessages] send failed cleanup', e);
      }
    }
  }

  // ── sendMessage ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (
    text: string,
    imageDataUrl: string | null,
    files?: UploadedFile[],
    workbenchContext?: WorkbenchRoundtripContext
  ) => {
    if (!text.trim() && !imageDataUrl && !files?.length) return;

    const displayText = text.trim();
    let gatewayPayloadText = text;
    let fileRefs = '';

    if (files && files.length > 0) {
      fileRefs = '\n\n[附件]' + files.map((f) => {
        const size = f.size < 1024 ? `${f.size}B` : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)}KB` : `${(f.size / (1024 * 1024)).toFixed(1)}MB`;
        if (f.path) return `\n- ${f.name} (${size}): ${f.path}`;
        if (f.isText && f.content) return `\n\`\`\`${f.ext}\n${f.content}\n\`\`\``;
        return `\n- ${f.name} (${size}) [无路径]`;
      }).join('');
    }

    const fullContentForAMY = gatewayPayloadText + fileRefs;
    const displayContent = displayText + (files && files.length > 0 ? `${displayText ? '\n\n' : ''}📎 ` + files.map((f) => f.name).join(', ') : '');

    if (!guardMessagePermission(fullContentForAMY, permissions)) return;

    const cmdIsSystem = !imageDataUrl && !files?.length && isSystemCommand(fullContentForAMY);
    await _sendMessageCore({
      text: fullContentForAMY,
      displayContent,
      fullContentForAMY,
      isSystem: cmdIsSystem,
      newRequestId: Date.now().toString(),
      imageDataUrl: imageDataUrl || undefined,
      files,
      workbenchContext,
    });
  }, [activeProject, getNextMessageId, permissions, scroll.scrollAfterUserSend, oct, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── quickSend ─────────────────────────────────────────────────────────────
  const quickSend = useCallback((content: string) => {
    if (!content.trim()) return;

    if (!guardMessagePermission(content.trim(), permissions)) return;

    const isSystem = isSystemCommand(content.trim());
    void _sendMessageCore({
      text: content.trim(),
      displayContent: content.trim(),
      fullContentForAMY: content.trim(),
      isSystem,
      newRequestId: Date.now().toString(),
    });
  }, [activeProject, getNextMessageId, permissions, scroll.scrollAfterUserSend, oct, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    wsConnected: ws.wsConnected,
    wsReconnecting: ws.wsReconnecting,
    wsError: ws.wsError,
    memoryOnline: ws.memoryOnline,
    fsmPhase,
    isStreaming,
    awaitingResponse,
    agentPhase,
    thinkingElapsed,
    activeTools,
    activityTimeline,
    gatewayCapabilities,
    tokenIn,
    tokenOut,
    ctxUsed,
    ctxMax,
    modelName,
    thinkMode,
    pendingPills,
    streak: 0,
    fullTextRef,
    streamingRenderText,
    streamingDomRef,
    sendMessage,
    quickSend,
  };
}
