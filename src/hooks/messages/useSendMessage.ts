import React, { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { TurnFSM, TurnPhase } from '../../core/turnFSM';
import { isSystemCommand, finalizeStoppedAssistantMessage } from '../../core/turnStream/streamingBufferOps';
import { guardMessagePermission } from '../../utils/permissionCheck';
import type { PermissionConfig } from '../../utils/permissionCheck';
import { resetSoundCounter } from '../../utils/clickSound';
import { workbenchBus } from '../../workbench/WorkbenchBus';
import type { WorkbenchRoundtripContext } from '../../workbench/types';
import type { ChatMessage, UploadedFile } from '../../ui/chat/chatTypes';
import type { UseTypewriterReturn } from '../useTypewriter';
import type { TurnUiEvent } from '../../core/turnUiState';
import type { ActiveTool } from '../useMessages';
import type { ActivityEntryType } from '../useActivityTimeline';
import type { GatewaySendResult } from '../../types/gateway';
import type { ActiveProject } from '../../contexts/ProjectContext';

export interface UseSendMessageWs {
  send: (
    text: string,
    imageDataUrl: string | undefined,
    files: UploadedFile[] | undefined,
    transportPacingMs: number,
    roundtripContext: WorkbenchRoundtripContext | undefined,
    requestId: string,
    activeProject: ActiveProject | null | undefined,
  ) => Promise<GatewaySendResult | undefined>;
  cancel: () => Promise<GatewaySendResult | undefined>;
}

export interface UseSendMessageDeps {
  oct: { fsm: TurnFSM };
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  permissions: PermissionConfig;
  scroll: { reconcile: () => void; scrollAfterUserSend: () => void };
  getNextMessageId: () => number;
  activeProject: ActiveProject | null | undefined;
  typewriter: UseTypewriterReturn;
  ws: UseSendMessageWs;
  lastSentRequestId: MutableRefObject<string>;
  reduceTurnUiRef: (event: TurnUiEvent) => void;
  resetSegProtocolForNewTurn: () => void;
  setThinkMode: React.Dispatch<React.SetStateAction<string>>;
  pendingSystemReplyMap: MutableRefObject<Map<string, boolean>>;
  resetUsage: () => void;
  resetTimeline: () => void;
  streamingMessageRef: MutableRefObject<string>;
  fullTextRef: MutableRefObject<string>;
  setStreamingRenderText: React.Dispatch<React.SetStateAction<string>>;
  stopPainting: () => void;
  pendingStreamFinalizeRef: MutableRefObject<boolean>;
  finalizeFallbackTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setAwaitingResponse: React.Dispatch<React.SetStateAction<boolean>>;
  setAgentPhase: React.Dispatch<React.SetStateAction<'idle' | 'thinking' | 'typing' | 'tool_executing'>>;
  startRoundTimeout: () => void;
  setActiveTools: React.Dispatch<React.SetStateAction<ActiveTool[]>>;
  resetWithThinkingPlaceholder: () => void;
  setPendingPills: React.Dispatch<React.SetStateAction<string[] | null>>;
  clearRoundTimeout: () => void;
  recoverOctStreamFromEndFailure: (oct: { fsm: TurnFSM }) => void;
  removeTimelineTypes: (types: ActivityEntryType[]) => void;
  transportPacingMs: number;
}

export function useSendMessage({
  oct,
  setMessages,
  permissions,
  scroll,
  getNextMessageId,
  activeProject,
  typewriter,
  ws,
  lastSentRequestId,
  reduceTurnUiRef,
  resetSegProtocolForNewTurn,
  setThinkMode,
  pendingSystemReplyMap,
  resetUsage,
  resetTimeline,
  streamingMessageRef,
  fullTextRef,
  setStreamingRenderText,
  stopPainting,
  pendingStreamFinalizeRef,
  finalizeFallbackTimerRef,
  setAwaitingResponse,
  setAgentPhase,
  startRoundTimeout,
  setActiveTools,
  resetWithThinkingPlaceholder,
  setPendingPills,
  clearRoundTimeout,
  recoverOctStreamFromEndFailure,
  removeTimelineTypes,
  transportPacingMs,
}: UseSendMessageDeps) {
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
    reduceTurnUiRef({ kind: 'submit', turnId: newRequestId });
    resetSegProtocolForNewTurn(); // B3：新回合重置，等第一个 seg 事件激活
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
        if (oct.fsm.getPhase() !== TurnPhase.IDLE) {
          oct.fsm.onCancel();   // STREAMING/… → CANCELLED → IDLE
        }
        oct.fsm.onUserTyping();
        oct.fsm.onUserSubmit();
        oct.fsm.onRequestStart();
        oct.fsm.onStreamOpen();
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
      reduceTurnUiRef({ kind: 'error', message: result?.error || 'Send failed' });
      setAwaitingResponse(false);
      console.warn('[useMessages] Send failed:', result);
      try {
        if (oct.fsm.getPhase() !== TurnPhase.IDLE) {
          oct.fsm.onError();
        }
      } catch (e) {
        console.warn('[useMessages] send failed cleanup', e);
        recoverOctStreamFromEndFailure(oct);
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

  const stopCurrentResponse = useCallback(async () => {
    clearRoundTimeout();
    reduceTurnUiRef({ kind: 'cancel' });
    setAwaitingResponse(false);
    setAgentPhase('idle');
    setActiveTools([]);
    removeTimelineTypes(['keepalive_hint', 'thinking_placeholder']);
    stopPainting();
    pendingStreamFinalizeRef.current = false;
    if (finalizeFallbackTimerRef.current != null) {
      clearTimeout(finalizeFallbackTimerRef.current);
      finalizeFallbackTimerRef.current = null;
    }
    try {
      if (oct.fsm.getPhase() !== TurnPhase.IDLE) {
        oct.fsm.onCancel();
      }
    } catch (e) {
      console.warn('[useMessages] stopCurrentResponse local cleanup', e);
      try { oct.fsm.resetToIdle(); } catch {}
    }
    setMessages((prev) => finalizeStoppedAssistantMessage(prev));
    const result = await ws.cancel();
    if (!result?.success) {
      console.warn('[useMessages] cancel failed:', result);
    }
  }, [clearRoundTimeout, oct, reduceTurnUiRef, removeTimelineTypes, setMessages, stopPainting, ws]);

  return { sendMessage, quickSend, stopCurrentResponse };
}
