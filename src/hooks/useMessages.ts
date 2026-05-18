import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { TurnFSM, deriveLegacyFlags, TurnPhase } from '../core/turnFSM';
import { StreamRouter } from '../core/streamRouter';
import { BlockIngest } from '../core/blockIngest';
import type { WorkbenchRoundtripContext } from '../workbench/types';
import { workbenchBus } from '../workbench/WorkbenchBus';
import { checkPermission, getDangerMatch } from '../utils/permissionCheck';
import type { PermissionConfig } from '../utils/permissionCheck';
import type { UseTypewriterReturn } from './useTypewriter';
import type { ChatMessage, UploadedFile } from '../ui/chat/chatTypes';
import type { ClarifyCardSpec } from '../core/clarifyCard/types';
import { resetSoundCounter, type TypingSoundMode } from '../utils/clickSound';
import { useProject } from '../contexts/ProjectContext';
import { useTokenUsage } from './useTokenUsage';
import { useActivityTimeline } from './useActivityTimeline';
import { useMessagesGateway } from './useMessages.gateway';
import { useMessagesRuntime } from './useMessages.runtime';
import type { ActivityEntry } from './useActivityTimeline';
import {
  isSystemCommand,
  recoverOctStreamFromEndFailure,
} from './useMessages.helpers';
export type { ActivityEntryType, ActivityEntry } from './useActivityTimeline';
export { preferDoneTextWhenMoreComplete } from './useMessages.helpers';

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
  const lastSentRequestId = useRef<string>('');
  const systemReplyBufferRef = useRef('');
  const roundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const {
    startPainting,
    stopPainting,
    ensureStreamingAssistantMessage,
    clearRoundTimeout,
    startRoundTimeout,
    scheduleFinalizeFallback,
  } = useMessagesRuntime({
    oct,
    scroll: scrollRef.current,
    getNextMessageId,
    setMessages,
    streamSpeedMsRef,
    typingSound,
    typingSoundVolume,
    streamingMessageRef,
    fullTextRef,
    streamingDomRef,
    pendingFullTextSyncRafRef,
    setStreamingRenderText,
    pendingStreamFinalizeRef,
    lastStreamReconcileMsRef,
    finalizeFallbackTimerRef,
    roundTimeoutRef,
    setAwaitingResponse,
    setAgentPhase,
    setActiveTools,
    removeTimelineTypes,
  });

  const ws = useMessagesGateway({
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
  });

  // ── FSM subscribe ─────────────────────────────────────────────────────────
  useEffect(() => {
    return oct.fsm.subscribe((phase) => {
      setFsmPhase(phase);
    });
  }, [oct.fsm]);

  // ── pendingPills: reset on messages change ────────────────────────────────
  useEffect(() => {
    setPendingPills(null);
  }, [messages]);

  // ── onStatusChange notification ───────────────────────────────────────────
  useEffect(() => {
    onStatusChange?.(ws.wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax);
  }, [ws.wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax, onStatusChange]);

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
