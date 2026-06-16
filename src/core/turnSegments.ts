/**
 * Turn Segment 前端状态 —— 把 gateway 的段事件（open/delta/close/finish）
 * 归约成"一回合 = 有序内容段列表"。见 docs/refactors/chat-streaming-block-protocol-plan.md（B2）。
 *
 * 纯函数 reducer，无副作用，便于单测。B2 阶段只构建状态（影子），B3 起接管渲染。
 * 跨段永不拼接：工具前正文段与最终答案段是不同 segId，结构上消除跨轮重复。
 */

export type TurnSegmentType = 'text' | 'tool_use' | 'tool_result' | 'reasoning' | 'final';

export interface TurnSegment {
  segId: string;
  index: number;
  type: TurnSegmentType;
  content: string;
  open: boolean;
  meta?: { tool?: string | null; callId?: string | null };
}

export interface TurnSegmentState {
  order: string[]; // segId 顺序
  segments: Record<string, TurnSegment>;
  finished: boolean;
  stopReason?: string;
}

export type SegmentEvent =
  | { op: 'open'; segId: string; index: number; type: TurnSegmentType; meta?: TurnSegment['meta'] }
  | { op: 'delta'; segId: string; text: string }
  | { op: 'close'; segId: string }
  | { op: 'finish'; stopReason?: string };

export function emptyTurnSegmentState(): TurnSegmentState {
  return { order: [], segments: {}, finished: false };
}

export function reduceSegmentEvent(state: TurnSegmentState, seg: SegmentEvent): TurnSegmentState {
  switch (seg.op) {
    case 'open': {
      if (state.segments[seg.segId]) return state; // 幂等：重复 open 忽略
      const segment: TurnSegment = {
        segId: seg.segId,
        index: seg.index,
        type: seg.type,
        content: '',
        open: true,
        ...(seg.meta ? { meta: seg.meta } : {}),
      };
      return {
        ...state,
        order: [...state.order, seg.segId],
        segments: { ...state.segments, [seg.segId]: segment },
      };
    }
    case 'delta': {
      const cur = state.segments[seg.segId];
      if (!cur) return state; // 未知段：丢弃，绝不"追加到末尾"（这正是旧扁平流的 bug 源）
      return {
        ...state,
        segments: {
          ...state.segments,
          [seg.segId]: { ...cur, content: cur.content + (seg.text || '') },
        },
      };
    }
    case 'close': {
      const cur = state.segments[seg.segId];
      if (!cur || !cur.open) return state;
      return {
        ...state,
        segments: { ...state.segments, [seg.segId]: { ...cur, open: false } },
      };
    }
    case 'finish': {
      return { ...state, finished: true, ...(seg.stopReason ? { stopReason: seg.stopReason } : {}) };
    }
    default:
      return state;
  }
}

/** 把段状态拍平成有序段数组（渲染用）。 */
export function orderedSegments(state: TurnSegmentState): TurnSegment[] {
  return state.order.map((id) => state.segments[id]).filter(Boolean);
}

/**
 * 把段状态拍平成"最终可见正文"（用于回退/历史落库）：
 * 只取 text/final 段，跨段以双换行拼接；工具/思考段不进正文。
 */
export function segmentsToVisibleText(state: TurnSegmentState): string {
  return orderedSegments(state)
    .filter((s) => s.type === 'text' || s.type === 'final')
    .map((s) => s.content)
    .filter((t) => t && t.trim())
    .join('\n\n');
}
