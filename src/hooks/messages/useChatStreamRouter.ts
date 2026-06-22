import React, { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { TurnFSM, TurnPhase } from '../../core/turnFSM';
import { normalizeAssistantTranscriptContent } from '../../utils/cotExtract';
import { parseSystemReplyStatus } from '../../utils/systemReplyParser';
import { workbenchBus } from '../../workbench/WorkbenchBus';
import { toWorkbenchCommand } from '../../workbench/types';
import type { CanvasEvent, WorkbenchEvent } from '../../workbench/types';
import { preferDoneTextWhenMoreComplete, shouldSuppressAssistantTextForClarify } from '../../core/turnStream/streamingBufferOps';
import type { ChatMessage, ToolEventItem } from '../../ui/chat/chatTypes';
import type { RenderBlock } from '../../types/renderProtocol';
import type { ClarifyCardSpec } from '../../core/clarifyCard/types';
import type {
  GatewayCapabilities,
  GatewayKeepalivePayload,
  GatewayToolPayload,
  GatewayUsagePayload,
} from '../../types/gateway';
import type { TurnUiEvent } from '../../core/turnUiState';
import type { ActiveTool } from '../useMessages';
import type { ActivityEntryType } from '../useActivityTimeline';

export interface UseChatStreamRouterDeps {
  oct: { fsm: TurnFSM };
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  lastSentRequestId: MutableRefObject<string>;
  segProtocolActiveRef: MutableRefObject<boolean>;
  reduceTurnUiRef: (event: TurnUiEvent) => void;
  setAwaitingResponse: React.Dispatch<React.SetStateAction<boolean>>;
  setAgentPhase: React.Dispatch<React.SetStateAction<'idle' | 'thinking' | 'typing' | 'tool_executing'>>;
  pendingSystemReplyMap: MutableRefObject<Map<string, boolean>>;
  systemReplyBufferRef: MutableRefObject<string>;
  streamingMessageRef: MutableRefObject<string>;
  fullTextRef: MutableRefObject<string>;
  scheduleCotSyncFromFullText: (text: string) => void;
  startPainting: () => void;
  ensureStreamingAssistantMessage: () => void;
  clearRoundTimeout: () => void;
  setActiveTools: React.Dispatch<React.SetStateAction<ActiveTool[]>>;
  removeTimelineTypes: (types: ActivityEntryType[]) => void;
  pendingClarifyOpenRef: MutableRefObject<boolean>;
  setStreamingRenderText: React.Dispatch<React.SetStateAction<string>>;
  pendingStreamFinalizeRef: MutableRefObject<boolean>;
  stopPainting: () => void;
  scheduleFinalizeFallback: (rawText?: string) => void;
  recoverOctStreamFromEndFailure: (oct: { fsm: TurnFSM }) => void;
  setModelName: React.Dispatch<React.SetStateAction<string>>;
  setFromSystemReply: (partial: { tokenIn?: number; ctxMax?: number; ctxUsed?: number }) => void;
  setApiKeyInfo: React.Dispatch<React.SetStateAction<string>>;
  setThinkMode: React.Dispatch<React.SetStateAction<string>>;
  setRuntimeMode: React.Dispatch<React.SetStateAction<string>>;
  setCompactions: React.Dispatch<React.SetStateAction<number | null>>;
  setQueueInfo: React.Dispatch<React.SetStateAction<string>>;
  getNextMessageId: () => number;
  setThinkingElapsed: React.Dispatch<React.SetStateAction<number>>;
  scroll: { reconcile: () => void; scrollAfterUserSend: () => void };
  onToolEventTimeline: (payload: GatewayToolPayload) => void;
  onClarifyOpen?: (spec: ClarifyCardSpec) => void;
  onKeepaliveTimeline: (payload: GatewayKeepalivePayload) => void;
  onUsage: (usage: GatewayUsagePayload, isSnapshot: boolean) => void;
  setGatewayCapabilities: React.Dispatch<React.SetStateAction<GatewayCapabilities | null>>;
}

export function useChatStreamRouter({
  oct,
  setMessages,
  lastSentRequestId,
  segProtocolActiveRef,
  reduceTurnUiRef,
  setAwaitingResponse,
  setAgentPhase,
  pendingSystemReplyMap,
  systemReplyBufferRef,
  streamingMessageRef,
  fullTextRef,
  scheduleCotSyncFromFullText,
  startPainting,
  ensureStreamingAssistantMessage,
  clearRoundTimeout,
  setActiveTools,
  removeTimelineTypes,
  pendingClarifyOpenRef,
  setStreamingRenderText,
  pendingStreamFinalizeRef,
  stopPainting,
  scheduleFinalizeFallback,
  recoverOctStreamFromEndFailure,
  setModelName,
  setFromSystemReply,
  setApiKeyInfo,
  setThinkMode,
  setRuntimeMode,
  setCompactions,
  setQueueInfo,
  getNextMessageId,
  setThinkingElapsed,
  scroll,
  onToolEventTimeline,
  onClarifyOpen,
  onKeepaliveTimeline,
  onUsage,
  setGatewayCapabilities,
}: UseChatStreamRouterDeps) {
  const onChatDelta = useCallback((content: string, isDelta: boolean, isSystemReply: boolean, turnId?: string) => {
    const currentTurnId = lastSentRequestId.current;
    if (turnId && currentTurnId && turnId !== currentTurnId) return;
    if (!content) return;
    // B3：段协议激活时，文字增量由 onChatSeg 驱动，跳过扁平流处理（防双写）。
    // done=false 的 delta 跳过；done=true（最终文本快照）仍走下面 onChatDone 处理。
    if (!isSystemReply && isDelta && segProtocolActiveRef.current) return;
    if (!isSystemReply) {
      if (isDelta) reduceTurnUiRef({ kind: 'seg_text_delta' });
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
  }, [
    oct,
    lastSentRequestId,
    segProtocolActiveRef,
    reduceTurnUiRef,
    setAwaitingResponse,
    setAgentPhase,
    pendingSystemReplyMap,
    systemReplyBufferRef,
    streamingMessageRef,
    fullTextRef,
    scheduleCotSyncFromFullText,
    startPainting,
    ensureStreamingAssistantMessage,
  ]);

  const onChatDone = useCallback((content: string, systemReplyHint: boolean, turnId?: string, renderBlocks?: RenderBlock[]) => {
    const currentRequestId = lastSentRequestId.current;
    if (turnId && currentRequestId && turnId !== currentRequestId) return;
    clearRoundTimeout();
    const systemReplyKey = turnId || currentRequestId;
    const systemReply = systemReplyHint || (pendingSystemReplyMap.current.get(systemReplyKey) ?? false);
    pendingSystemReplyMap.current.delete(systemReplyKey);

    if (!systemReply) {
      reduceTurnUiRef({ kind: 'done' });
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
      // B3：段协议激活时信任 fullTextRef（段派生，仅含最终答案段）。
      // 旧路径的 done.content 是所有轮次正文的拼接，用它覆盖会把工具前正文带回来。
      const finalText = segProtocolActiveRef.current
        ? (fullTextRef.current || fallbackText)
        : preferDoneTextWhenMoreComplete(fullTextRef.current, fallbackText);
      if (finalText !== fullTextRef.current) {
        streamingMessageRef.current = finalText;
        fullTextRef.current = finalText;
        ensureStreamingAssistantMessage();
      }
      pendingStreamFinalizeRef.current = true;
      stopPainting();
      scheduleFinalizeFallback(finalText);
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
  }, [
    oct,
    setMessages,
    lastSentRequestId,
    segProtocolActiveRef,
    reduceTurnUiRef,
    setAwaitingResponse,
    setAgentPhase,
    pendingSystemReplyMap,
    systemReplyBufferRef,
    streamingMessageRef,
    fullTextRef,
    ensureStreamingAssistantMessage,
    clearRoundTimeout,
    setActiveTools,
    removeTimelineTypes,
    pendingClarifyOpenRef,
    setStreamingRenderText,
    pendingStreamFinalizeRef,
    stopPainting,
    scheduleFinalizeFallback,
    recoverOctStreamFromEndFailure,
    setModelName,
    setFromSystemReply,
    setApiKeyInfo,
    setThinkMode,
    setRuntimeMode,
    setCompactions,
    setQueueInfo,
    getNextMessageId,
  ]);

  const onAgentPhase = useCallback((phase: 'idle' | 'thinking' | 'typing' | 'tool_executing', elapsed?: number) => {
    reduceTurnUiRef({ kind: 'agent_phase', phase });
    setAgentPhase(phase);
    if (phase === 'thinking' && elapsed != null) setThinkingElapsed(elapsed);
    if (phase === 'idle' || phase === 'typing') setThinkingElapsed(0);
  }, [reduceTurnUiRef, setAgentPhase, setThinkingElapsed]);

  const onToolEvent = useCallback((payload: GatewayToolPayload) => {
    if (payload.type === 'tool_call') {
      reduceTurnUiRef({ kind: 'tool_call' });
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
      reduceTurnUiRef(
        finalState === 'error'
          ? { kind: 'error', message: payload.error || 'Tool failed' }
          : { kind: 'tool_result' },
      );
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
  }, [reduceTurnUiRef, setActiveTools, scroll, setMessages, onToolEventTimeline]);

  const onClarifyOpenHandler = useCallback((spec: ClarifyCardSpec) => {
    reduceTurnUiRef({ kind: 'clarify' });
    pendingClarifyOpenRef.current = true;
    onClarifyOpen?.(spec);
  }, [reduceTurnUiRef, pendingClarifyOpenRef, onClarifyOpen]);

  const onKeepalive = useCallback((payload: GatewayKeepalivePayload) => {
    reduceTurnUiRef({ kind: 'keepalive', phase: payload?.phase });
    onKeepaliveTimeline(payload);
  }, [reduceTurnUiRef, onKeepaliveTimeline]);

  const onWorkbenchEvent = useCallback((event: CanvasEvent | WorkbenchEvent) => {
    workbenchBus.dispatch(toWorkbenchCommand(event));
  }, []);

  const onUsageHandler = useCallback((usage: GatewayUsagePayload, isSnapshot: boolean) => {
    onUsage(usage, isSnapshot);
  }, [onUsage]);

  const onModelName = useCallback((name: string) => setModelName(name), [setModelName]);

  const onGatewayCapabilities = useCallback((caps: GatewayCapabilities | null) => {
    setGatewayCapabilities(caps);
    if (caps?.model) setModelName(caps.model);
  }, [setGatewayCapabilities, setModelName]);

  return {
    onChatDelta,
    onChatDone,
    onAgentPhase,
    onToolEvent,
    onClarifyOpen: onClarifyOpenHandler,
    onKeepalive,
    onWorkbenchEvent,
    onUsage: onUsageHandler,
    onModelName,
    onGatewayCapabilities,
  };
}
