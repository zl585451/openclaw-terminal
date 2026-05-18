import { useWebSocket } from './useWebSocket';
import { workbenchBus } from '../workbench/WorkbenchBus';
import { toWorkbenchCommand, type WorkbenchEvent, type CanvasEvent } from '../workbench/types';
import type { ClarifyCardSpec } from '../core/clarifyCard/types';
import type { GatewayCapabilities, GatewayKeepalivePayload, GatewayToolPayload, GatewayUsagePayload } from '../types/gateway';
import type { StreamRouter } from '../core/streamRouter';
import { TurnPhase, type TurnFSM } from '../core/turnFSM';
import type { BlockIngest } from '../core/blockIngest';
import type React from 'react';
import type { ChatMessage } from '../ui/chat/chatTypes';
import type { ActivityEntryType } from './useActivityTimeline';
import {
  type ActiveToolState,
  appendExecutingTool,
  appendToolCallToStreamingMessage,
  applyToolResult,
  applyToolResultToMessage,
  parseSystemReplyStatus,
  preferDoneTextWhenMoreComplete,
  reconcileChatDoneMessages,
  recoverOctStreamFromEndFailure,
  sanitizeAssistantText,
} from './useMessages.helpers';

interface UseMessagesGatewayArgs {
  oct: { fsm: TurnFSM; stream: StreamRouter; ingest: BlockIngest };
  scroll: { reconcile: () => void };
  getNextMessageId: () => number;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onClarifyOpen?: (spec: ClarifyCardSpec) => void;
  setAwaitingResponse: React.Dispatch<React.SetStateAction<boolean>>;
  setAgentPhase: React.Dispatch<React.SetStateAction<'idle' | 'thinking' | 'typing' | 'tool_executing'>>;
  setActiveTools: React.Dispatch<React.SetStateAction<ActiveToolState[]>>;
  setGatewayCapabilities: React.Dispatch<React.SetStateAction<GatewayCapabilities | null>>;
  setThinkingElapsed: React.Dispatch<React.SetStateAction<number>>;
  setModelName: React.Dispatch<React.SetStateAction<string>>;
  setApiKeyInfo: React.Dispatch<React.SetStateAction<string>>;
  setThinkMode: React.Dispatch<React.SetStateAction<string>>;
  setRuntimeMode: React.Dispatch<React.SetStateAction<string>>;
  setCompactions: React.Dispatch<React.SetStateAction<number | null>>;
  setQueueInfo: React.Dispatch<React.SetStateAction<string>>;
  onUsage: (usage: GatewayUsagePayload, isSnapshot: boolean) => void;
  setFromSystemReply: (payload: { tokenIn?: number; ctxUsed?: number; ctxMax?: number }) => void;
  onToolEventTimeline: (payload: GatewayToolPayload) => void;
  onKeepaliveTimeline: (payload: GatewayKeepalivePayload) => void;
  removeTimelineTypes: (types: ActivityEntryType[]) => void;
  scheduleCotSyncFromFullText: (fullText: string) => void;
  ensureStreamingAssistantMessage: () => void;
  startPainting: () => void;
  stopPainting: () => void;
  scheduleFinalizeFallback: (rawText?: string) => void;
  clearRoundTimeout: () => void;
  streamingMessageRef: React.MutableRefObject<string>;
  fullTextRef: React.MutableRefObject<string>;
  pendingStreamFinalizeRef: React.MutableRefObject<boolean>;
  pendingSystemReplyMap: React.MutableRefObject<Map<string, boolean>>;
  lastSentRequestId: React.MutableRefObject<string>;
  systemReplyBufferRef: React.MutableRefObject<string>;
}

export function useMessagesGateway(args: UseMessagesGatewayArgs) {
  const {
    oct,
    scroll,
    getNextMessageId,
    setMessages,
    onClarifyOpen,
    setAwaitingResponse,
    setAgentPhase,
    setActiveTools,
    setGatewayCapabilities,
    setThinkingElapsed,
    setModelName,
    setApiKeyInfo,
    setThinkMode,
    setRuntimeMode,
    setCompactions,
    setQueueInfo,
    onUsage,
    setFromSystemReply,
    onToolEventTimeline,
    onKeepaliveTimeline,
    removeTimelineTypes,
    scheduleCotSyncFromFullText,
    ensureStreamingAssistantMessage,
    startPainting,
    stopPainting,
    scheduleFinalizeFallback,
    clearRoundTimeout,
    streamingMessageRef,
    fullTextRef,
    pendingStreamFinalizeRef,
    pendingSystemReplyMap,
    lastSentRequestId,
    systemReplyBufferRef,
  } = args;

  return useWebSocket({
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
        return;
      }

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
    },

    onChatDone: (content, systemReplyHint, turnId) => {
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
        const fallbackText = sanitizeAssistantText(String(content || '').trim());
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
          if (finalText) {
            streamingMessageRef.current = finalText;
            fullTextRef.current = finalText;
            pendingStreamFinalizeRef.current = true;
            stopPainting();
            ensureStreamingAssistantMessage();
          } else {
            scheduleFinalizeFallback('');
          }
        }
        return;
      }

      const finalStreamContent = systemReplyBufferRef.current || content;
      systemReplyBufferRef.current = '';

      const parsedStatus = parseSystemReplyStatus(finalStreamContent);
      if (parsedStatus) {
        if (parsedStatus.modelName) setModelName(parsedStatus.modelName);
        if (parsedStatus.tokenIn != null || parsedStatus.ctxUsed != null || parsedStatus.ctxMax != null) {
          setFromSystemReply({
            tokenIn: parsedStatus.tokenIn,
            ctxUsed: parsedStatus.ctxUsed,
            ctxMax: parsedStatus.ctxMax,
          });
        }
        if (parsedStatus.apiKeyInfo) setApiKeyInfo(parsedStatus.apiKeyInfo);
        if (parsedStatus.thinkMode) setThinkMode(parsedStatus.thinkMode);
        if (parsedStatus.runtimeMode) setRuntimeMode(parsedStatus.runtimeMode);
        if (parsedStatus.compactions != null) setCompactions(parsedStatus.compactions);
        if (parsedStatus.queueInfo) setQueueInfo(parsedStatus.queueInfo);
      }

      setMessages((prev) => reconcileChatDoneMessages(prev, {
        finalStreamContent,
        systemReply,
        nextMessageId: getNextMessageId(),
        timestamp: Date.now(),
      }));
    },

    onAgentPhase: (phase, elapsed) => {
      setAgentPhase(phase);
      if (phase === 'thinking' && elapsed != null) setThinkingElapsed(elapsed);
      if (phase === 'idle' || phase === 'typing') setThinkingElapsed(0);
    },

    onToolEvent: (payload) => {
      if (payload.type === 'tool_call') {
        setActiveTools((prev) => {
          const next = appendExecutingTool(prev, payload);
          if (prev.length === 0 && next.length > 0) {
            requestAnimationFrame(() => { scroll.reconcile(); });
          }
          return next;
        });
        setMessages((prev) => appendToolCallToStreamingMessage(prev, payload, Date.now()));
        onToolEventTimeline(payload);
      } else if (payload.type === 'tool_result') {
        setActiveTools((prev) => applyToolResult(prev, payload));
        setMessages((prev) => applyToolResultToMessage(prev, payload));
        onToolEventTimeline(payload);
      }
    },

    onClarifyOpen: (spec) => {
      onClarifyOpen?.(spec);
    },

    onKeepalive: (payload) => {
      onKeepaliveTimeline(payload);
    },

    onWorkbenchEvent: (event: CanvasEvent | WorkbenchEvent) => {
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
}
