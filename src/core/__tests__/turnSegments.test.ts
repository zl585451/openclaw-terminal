import { describe, expect, it } from 'vitest';
import {
  emptyTurnSegmentState,
  reduceSegmentEvent,
  orderedSegments,
  segmentsToVisibleText,
  type SegmentEvent,
} from '../turnSegments';

function run(events: SegmentEvent[]) {
  return events.reduce(reduceSegmentEvent, emptyTurnSegmentState());
}

describe('turnSegments reducer', () => {
  it('keeps pre-tool text and final answer as separate segments (no cross-segment concat)', () => {
    const state = run([
      { op: 'open', segId: 't:s0', index: 0, type: 'text' },
      { op: 'delta', segId: 't:s0', text: '我来查一下' },
      { op: 'close', segId: 't:s0' },
      { op: 'open', segId: 't:s1', index: 1, type: 'tool_use', meta: { tool: 'web_search', callId: 'c1' } },
      { op: 'close', segId: 't:s1' },
      { op: 'open', segId: 't:s2', index: 2, type: 'text' },
      { op: 'delta', segId: 't:s2', text: '完整报告' },
      { op: 'close', segId: 't:s2' },
      { op: 'finish', stopReason: 'end_turn' },
    ]);

    const segs = orderedSegments(state);
    expect(segs.map((s) => s.type)).toEqual(['text', 'tool_use', 'text']);
    expect(segs[0].content).toBe('我来查一下');
    expect(segs[2].content).toBe('完整报告');
    expect(segs[0].segId).not.toBe(segs[2].segId);
    expect(state.finished).toBe(true);
    expect(state.stopReason).toBe('end_turn');
    // 可见正文只含两段文本，工具段不进正文
    expect(segmentsToVisibleText(state)).toBe('我来查一下\n\n完整报告');
  });

  it('relabels a pre-tool text segment to preamble on close, excluding it from visible text', () => {
    const state = run([
      { op: 'open', segId: 't:s0', index: 0, type: 'text' },
      { op: 'delta', segId: 't:s0', text: '抢跑的完整答案' },
      { op: 'close', segId: 't:s0', type: 'preamble' }, // 工具开始时被重标
      { op: 'open', segId: 't:s1', index: 1, type: 'tool_use', meta: { tool: 'web_search', callId: 'c1' } },
      { op: 'close', segId: 't:s1' },
      { op: 'open', segId: 't:s2', index: 2, type: 'text' },
      { op: 'delta', segId: 't:s2', text: '最终答案' },
      { op: 'close', segId: 't:s2' },
      { op: 'finish', stopReason: 'end_turn' },
    ]);

    const segs = orderedSegments(state);
    expect(segs.map((s) => s.type)).toEqual(['preamble', 'tool_use', 'text']);
    // 内容保留（折叠展示用），但不计入可见正文/落库 → 不与最终答案重复
    expect(segs[0].content).toBe('抢跑的完整答案');
    expect(segmentsToVisibleText(state)).toBe('最终答案');
  });

  it('accumulates consecutive deltas into the same segment', () => {
    const state = run([
      { op: 'open', segId: 't:s0', index: 0, type: 'text' },
      { op: 'delta', segId: 't:s0', text: '一' },
      { op: 'delta', segId: 't:s0', text: '二' },
      { op: 'delta', segId: 't:s0', text: '三' },
    ]);
    expect(orderedSegments(state)[0].content).toBe('一二三');
  });

  it('drops deltas for unknown segId instead of appending to the tail', () => {
    const state = run([
      { op: 'open', segId: 't:s0', index: 0, type: 'text' },
      { op: 'delta', segId: 't:s0', text: 'hello' },
      { op: 'delta', segId: 't:s99', text: 'GHOST' }, // 未知段
    ]);
    expect(orderedSegments(state).length).toBe(1);
    expect(orderedSegments(state)[0].content).toBe('hello');
    expect(segmentsToVisibleText(state)).toBe('hello');
  });

  it('is idempotent on duplicate open and marks close', () => {
    const state = run([
      { op: 'open', segId: 't:s0', index: 0, type: 'text' },
      { op: 'open', segId: 't:s0', index: 0, type: 'text' }, // 重复 open 忽略
      { op: 'delta', segId: 't:s0', text: 'x' },
      { op: 'close', segId: 't:s0' },
    ]);
    expect(orderedSegments(state).length).toBe(1);
    expect(orderedSegments(state)[0].open).toBe(false);
  });
});
