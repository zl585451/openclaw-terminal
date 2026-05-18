import { TurnFSM, TurnPhase } from '../core/turnFSM';
import { StreamRouter } from '../core/streamRouter';
import type { ChatMessage, ToolEventItem } from '../ui/chat/chatTypes';
import type { GatewayToolPayload } from '../types/gateway';
import { getAssistantVisibleMain, stripLeakedToolCallSections, stripTextToolAnnotations } from '../utils/cotExtract';
import { stripThinkModeMarker } from '../utils/socraticTemplates';

export interface MessageHookOctRuntime {
  fsm: TurnFSM;
  stream: StreamRouter;
}

export interface ActiveToolState {
  callId: string;
  tool: string;
  state: 'executing' | 'done' | 'error';
  resultPreview?: string;
}

export function isSystemCommand(text: string): boolean {
  const t = (text || '').trim();
  return /^\/\w/.test(t);
}

export function recoverOctStreamFromEndFailure(oct: MessageHookOctRuntime): void {
  try {
    oct.stream.abortToIdle();
  } catch {
    /* ignore */
  }
  try {
    if (oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
      oct.fsm.onToken();
    }
    if (oct.fsm.getPhase() === TurnPhase.STREAMING ||
        oct.fsm.getPhase() === TurnPhase.STREAM_PAUSED) {
      oct.fsm.onStreamEnd();
    }
    if (oct.fsm.getPhase() === TurnPhase.STREAM_COMPLETE) {
      oct.fsm.onRenderDone();
    }
    oct.fsm.onTurnFinish();
  } catch (e) {
    console.warn('[useMessages] recoverOctStreamFromEndFailure', e);
    oct.fsm.resetToIdle();
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

export function sanitizeAssistantText(rawText: string): string {
  return stripTextToolAnnotations(
    stripLeakedToolCallSections(stripThinkModeMarker(rawText || '')),
  );
}

export function finalizeStreamingAssistantMessages(prev: ChatMessage[], finalRaw: string): ChatMessage[] {
  const last = prev[prev.length - 1];
  if (last?.role !== 'assistant' || !last.isStreaming) return prev;
  return prev.map((msg, idx) =>
    idx === prev.length - 1
      ? { ...msg, content: finalRaw || msg.content, isStreaming: false, isStreamingRaw: false }
      : msg,
  );
}

export function applyStreamingFinalizeFallback(prev: ChatMessage[], fallbackRaw: string): ChatMessage[] {
  const last = prev[prev.length - 1];
  if (!(last?.role === 'assistant' && last.isStreaming)) {
    return prev;
  }
  if (fallbackRaw.trim()) {
    return prev.map((msg, idx) =>
      idx === prev.length - 1
        ? { ...msg, content: fallbackRaw, isStreaming: false, isStreamingRaw: false }
        : msg,
    );
  }
  return prev.filter((_, idx) => idx !== prev.length - 1);
}

export function ensureStreamingAssistantMessageState(
  prev: ChatMessage[],
  nextMessageId: number,
  timestamp: number,
  rawContent: string,
): ChatMessage[] {
  const last = prev[prev.length - 1];
  if (last?.role === 'assistant' && last.isStreaming) return prev;
  const visibleMain = getAssistantVisibleMain(rawContent);
  if (!visibleMain || !visibleMain.trim()) return prev;
  return [
    ...prev,
    {
      id: nextMessageId,
      role: 'assistant',
      content: rawContent,
      isStreaming: true,
      timestamp,
    },
  ];
}

export function reconcileChatDoneMessages(
  prev: ChatMessage[],
  options: {
    finalStreamContent: string;
    systemReply: boolean;
    nextMessageId: number;
    timestamp: number;
  },
): ChatMessage[] {
  const { finalStreamContent, systemReply, nextMessageId, timestamp } = options;
  const cleanedPrev = systemReply
    ? prev.filter((msg) => !(msg.role === 'assistant' && msg.isStreaming))
    : prev;
  const last = cleanedPrev[cleanedPrev.length - 1];
  if (last?.role === 'assistant' && last.isStreaming) {
    return cleanedPrev.map((msg, idx) =>
      idx === cleanedPrev.length - 1
        ? { ...msg, content: finalStreamContent, isStreaming: false }
        : msg,
    );
  }
  if (!finalStreamContent) return cleanedPrev;
  const textContent = finalStreamContent.trim();
  if (!textContent) return cleanedPrev;
  if (last?.role === 'assistant' && !last.isStreaming && last.content?.trim() === textContent) {
    return cleanedPrev;
  }
  return [
    ...cleanedPrev,
    {
      id: nextMessageId,
      role: 'assistant',
      content: textContent,
      isStreaming: false,
      isSystemReply: systemReply,
      timestamp,
    },
  ];
}

export function appendExecutingTool(prev: ActiveToolState[], payload: GatewayToolPayload): ActiveToolState[] {
  return [
    ...prev,
    { callId: payload.callId, tool: payload.tool, state: 'executing' },
  ];
}

export function applyToolResult(prev: ActiveToolState[], payload: GatewayToolPayload): ActiveToolState[] {
  const finalState: ToolEventItem['state'] = payload.state === 'error' ? 'error' : 'done';
  return prev.map((tool) =>
    tool.callId === payload.callId
      ? { ...tool, state: finalState, resultPreview: payload.resultPreview }
      : tool,
  );
}

export function appendToolCallToStreamingMessage(
  prev: ChatMessage[],
  payload: GatewayToolPayload,
  now: number,
): ChatMessage[] {
  const lastIdx = prev.length - 1;
  const last = prev[lastIdx];
  if (!last || last.role !== 'assistant' || !last.isStreaming) return prev;
  const newEvent: ToolEventItem = {
    callId: payload.callId || `${payload.tool}_${now}`,
    tool: payload.tool,
    args: payload.args as Record<string, unknown> | undefined,
    state: 'executing',
    startedAt: now,
  };
  return [...prev.slice(0, lastIdx), { ...last, toolEvents: [...(last.toolEvents || []), newEvent] }];
}

export function applyToolResultToMessage(prev: ChatMessage[], payload: GatewayToolPayload): ChatMessage[] {
  const lastIdx = prev.length - 1;
  const last = prev[lastIdx];
  if (!last || last.role !== 'assistant' || !last.toolEvents?.length) return prev;
  const finalState: ToolEventItem['state'] = payload.state === 'error' ? 'error' : 'done';
  const updatedEvents = last.toolEvents.map((evt) =>
    evt.callId !== payload.callId
      ? evt
      : {
          ...evt,
          state: finalState,
          resultPreview: payload.resultPreview,
          error: payload.error,
          elapsedMs: payload.elapsedMs,
        },
  );
  return [...prev.slice(0, lastIdx), { ...last, toolEvents: updatedEvents }];
}
