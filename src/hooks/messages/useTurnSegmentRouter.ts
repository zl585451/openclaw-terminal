import React, { useCallback, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { TurnFSM, TurnPhase } from '../../core/turnFSM';
import { emptyTurnSegmentState, orderedSegments, reduceSegmentEvent, type SegmentEvent, type TurnSegment, type TurnSegmentState } from '../../core/turnSegments';
import { clearStreamingBubbleContent } from '../../core/turnStream/streamingBufferOps';
import type { ChatMessage } from '../../ui/chat/chatTypes';
import type { TurnUiEvent } from '../../core/turnUiState';

export interface UseTurnSegmentRouterDeps {
  oct: { fsm: TurnFSM };
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  lastSentRequestId: MutableRefObject<string>;
  reduceTurnUiRef: (event: TurnUiEvent) => void;
  streamingMessageRef: MutableRefObject<string>;
  fullTextRef: MutableRefObject<string>;
  systemReplyBufferRef: MutableRefObject<string>;
  setStreamingRenderText: React.Dispatch<React.SetStateAction<string>>;
  streamingDomRef: MutableRefObject<HTMLPreElement | null>;
  setAwaitingResponse: React.Dispatch<React.SetStateAction<boolean>>;
  setAgentPhase: React.Dispatch<React.SetStateAction<'idle' | 'thinking' | 'typing' | 'tool_executing'>>;
  scheduleCotSyncFromFullText: (text: string) => void;
  startPainting: () => void;
  ensureStreamingAssistantMessage: () => void;
}

export function useTurnSegmentRouter({
  oct,
  setMessages,
  lastSentRequestId,
  reduceTurnUiRef,
  streamingMessageRef,
  fullTextRef,
  systemReplyBufferRef,
  setStreamingRenderText,
  streamingDomRef,
  setAwaitingResponse,
  setAgentPhase,
  scheduleCotSyncFromFullText,
  startPainting,
  ensureStreamingAssistantMessage,
}: UseTurnSegmentRouterDeps) {
  // B2/B3: 段协议状态——按 turnId 累积段。B3 起接管显示。
  const turnSegmentsRef = useRef<{ turnId?: string; state: TurnSegmentState }>({
    state: emptyTurnSegmentState(),
  });
  // 当前回合是否有段事件到达（有则以段驱动显示，无则兜底走旧扁平流路径）。
  const segProtocolActiveRef = useRef(false);

  const resetForNewTurn = useCallback(() => {
    segProtocolActiveRef.current = false; // B3：新回合重置，等第一个 seg 事件激活
  }, []);

  const handleChatSeg = useCallback((seg: unknown, turnId?: string) => {
    const currentTurnId = lastSentRequestId.current;
    if (turnId && currentTurnId && turnId !== currentTurnId) return;
    // 新回合：重置段状态
    const slot = turnSegmentsRef.current;
    if (turnId && slot.turnId !== turnId) {
      slot.turnId = turnId;
      slot.state = emptyTurnSegmentState();
    }
    slot.state = reduceSegmentEvent(slot.state, seg as unknown as SegmentEvent);

    // ── B3 渲染切换 ────────────────────────────────────────────────────────
    const s = seg as unknown as SegmentEvent;
    if (s.op === 'delta') {
      const activeSeg = slot.state.segments[s.segId] as TurnSegment | undefined;
      if (activeSeg && (activeSeg.type === 'text' || activeSeg.type === 'final')) {
        reduceTurnUiRef({ kind: 'seg_text_delta' });
      }
    }

    // 新可见正文段开启：段协议激活 + 如果已有旧正文段则清空显示（自动 reset）
    if (s.op === 'open' && (s.type === 'text' || s.type === 'final')) {
      segProtocolActiveRef.current = true;
      const newSegId = s.segId;
      const hasOlderTextSeg = slot.state.order
        .filter((id) => id !== newSegId)
        .some((id) => {
          const prior = slot.state.segments[id] as TurnSegment | undefined;
          // preamble 也算"已有可见正文段"：最终答案段开启时需清掉它在流式气泡里的残留。
          return prior?.type === 'text' || prior?.type === 'final' || prior?.type === 'preamble';
        });
      if (hasOlderTextSeg) {
        // 工具调用后新一轮文字段开始——清空流式气泡正文，等最终答案填充
        streamingMessageRef.current = '';
        fullTextRef.current = '';
        systemReplyBufferRef.current = '';
        setStreamingRenderText('');
        if (streamingDomRef.current) {
          try { streamingDomRef.current.textContent = ''; } catch {}
        }
        setMessages((prev) => clearStreamingBubbleContent(prev));
      }
    }

    // 正文段增量：用段内容驱动 fullTextRef（跨段永不拼接）
    if (s.op === 'delta') {
      const activeSeg = slot.state.segments[s.segId] as TurnSegment | undefined;
      if (activeSeg && (activeSeg.type === 'text' || activeSeg.type === 'final')) {
        setAwaitingResponse(false);
        setAgentPhase('typing');
        // 只取本段内容——不跨段累加，这正是根治重复的关键
        fullTextRef.current = activeSeg.content;
        streamingMessageRef.current = activeSeg.content;
        scheduleCotSyncFromFullText(fullTextRef.current);
        if (oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
          try { oct.fsm.onToken(); } catch {}
        }
        startPainting();
        ensureStreamingAssistantMessage();
      }
    }

    // ── B3 inline：段边界（开/合）时把有序段快照挂到流式气泡 ───────────────
    // 仅在结构变化时更新（非每字），驱动 inline 工具卡片在正文流中按序渲染。
    if (s.op === 'open' || s.op === 'close') {
      const snapshot = orderedSegments(slot.state).map((seg2) => ({
        segId: seg2.segId,
        index: seg2.index,
        type: seg2.type,
        content: seg2.content,
        open: seg2.open,
        ...(seg2.meta ? { meta: seg2.meta } : {}),
      }));
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!(last?.role === 'assistant' && last.isStreaming)) return prev;
        return prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, turnSegments: snapshot } : m,
        );
      });
    }
  }, [
    oct,
    setMessages,
    lastSentRequestId,
    reduceTurnUiRef,
    streamingMessageRef,
    fullTextRef,
    systemReplyBufferRef,
    setStreamingRenderText,
    streamingDomRef,
    setAwaitingResponse,
    setAgentPhase,
    scheduleCotSyncFromFullText,
    startPainting,
    ensureStreamingAssistantMessage,
  ]);

  return { segProtocolActiveRef, resetForNewTurn, handleChatSeg };
}
