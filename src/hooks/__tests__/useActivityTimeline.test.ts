import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ASSISTANT_COT_MARKER_SPECS } from '../../utils/cotExtract';
import { useActivityTimeline } from '../useActivityTimeline';

async function flushCotDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
}

describe('useActivityTimeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始状态 — activityTimeline 为空数组', () => {
    const { result } = renderHook(() => useActivityTimeline([]));
    expect(result.current.activityTimeline).toEqual([]);
  });

  it('resetTimeline — 添加条目后清空', () => {
    const { result } = renderHook(() => useActivityTimeline([]));

    act(() => {
      result.current.resetWithThinkingPlaceholder();
    });
    expect(result.current.activityTimeline.length).toBe(1);

    act(() => {
      result.current.resetTimeline();
    });
    expect(result.current.activityTimeline).toEqual([]);
  });

  it('resetWithThinkingPlaceholder — 有一条 type=thinking_placeholder', () => {
    const { result } = renderHook(() => useActivityTimeline([]));

    act(() => {
      result.current.resetWithThinkingPlaceholder();
    });

    const tl = result.current.activityTimeline;
    expect(tl).toHaveLength(1);
    expect(tl[0].type).toBe('thinking_placeholder');
    expect(tl[0].hint).toBe('让我想想...');
  });

  it('onToolEvent tool_call — 新增 tool_call，toolName 正确', () => {
    const { result } = renderHook(() => useActivityTimeline([]));

    act(() => {
      result.current.onToolEvent({
        type: 'tool_call',
        callId: 'call-1',
        tool: 'read_file',
        args: { path: '/etc/hosts' },
      });
    });

    const last = result.current.activityTimeline.at(-1);
    expect(last?.type).toBe('tool_call');
    expect(last?.toolName).toBe('read_file');
    expect(last?.callId).toBe('call-1');
    expect(last?.argsPreview).toContain('path');
  });

  it('onToolEvent tool_result — isError=false', () => {
    const { result } = renderHook(() => useActivityTimeline([]));

    act(() => {
      result.current.onToolEvent({
        type: 'tool_result',
        callId: 'call-2',
        tool: 'read_file',
        state: 'done',
        resultPreview: '{"ok":true}',
        elapsedMs: 12,
      });
    });

    const last = result.current.activityTimeline.at(-1);
    expect(last?.type).toBe('tool_result');
    expect(last?.isError).toBe(false);
    expect(last?.resultPreview).toBe('{"ok":true}');
  });

  it('onToolEvent tool_result — state:error 时 isError=true', () => {
    const { result } = renderHook(() => useActivityTimeline([]));

    act(() => {
      result.current.onToolEvent({
        type: 'tool_result',
        callId: 'call-err',
        tool: 'run_cmd',
        state: 'error',
        resultPreview: 'boom',
      });
    });

    const last = result.current.activityTimeline.at(-1);
    expect(last?.type).toBe('tool_result');
    expect(last?.isError).toBe(true);
  });

  it('onKeepalive — 新增 keepalive_hint（payload 对齐 GatewayKeepalivePayload）', () => {
    const { result } = renderHook(() => useActivityTimeline([]));

    act(() => {
      result.current.onKeepalive({
        phase: 'tool_running',
        elapsedMs: 1500,
        toolName: 'bash',
      });
    });

    const last = result.current.activityTimeline.at(-1);
    expect(last?.type).toBe('keepalive_hint');
    expect(last?.hint).toBe('正在使用 bash...');
    expect(last?.keepaliveElapsedMs).toBe(1500);
  });

  it('scheduleCotSyncFromFullText — [cot]…[/cot] 解析后为 cot content', async () => {
    const { result } = renderHook(() => useActivityTimeline([]));

    await act(async () => {
      result.current.scheduleCotSyncFromFullText('prefix [cot]\nwhy\n[/cot] suffix');
    });
    await flushCotDebounce();

    const cot = result.current.activityTimeline.find((e) => e.type === 'cot');
    expect(cot?.content).toBe('why');
  });

  it('scheduleCotSyncFromFullText — 长 `<think>…</think>`（ASSISTANT_COT_MARKER_SPECS[2]）', async () => {
    const longSpec = ASSISTANT_COT_MARKER_SPECS[2];
    const { result } = renderHook(() => useActivityTimeline([]));

    await act(async () => {
      result.current.scheduleCotSyncFromFullText(
        `${longSpec.open}internal note${longSpec.close}`,
      );
    });
    await flushCotDebounce();

    const cot = result.current.activityTimeline.find((e) => e.type === 'cot');
    expect(cot?.content).toBe('internal note');
  });

  it('scheduleCotSyncFromFullText — 短标签（ASSISTANT_COT_MARKER_SPECS[1]，与 cotExtract 一致）', async () => {
    const shortSpec = ASSISTANT_COT_MARKER_SPECS[1];
    const { result } = renderHook(() => useActivityTimeline([]));

    await act(async () => {
      result.current.scheduleCotSyncFromFullText(`prefix ${shortSpec.open}brain${shortSpec.close} suffix`);
    });
    await flushCotDebounce();

    const cot = result.current.activityTimeline.find((e) => e.type === 'cot');
    expect(cot?.content).toBe('brain');
  });

  it('scheduleCotSyncFromFullText — 300ms 防抖，同一窗口多次调用仅以最后一次写入 ref 为准', async () => {
    const { result } = renderHook(() => useActivityTimeline([]));

    await act(async () => {
      result.current.scheduleCotSyncFromFullText('[cot]first[/cot]');
      result.current.scheduleCotSyncFromFullText('[cot]second[/cot]');
      result.current.scheduleCotSyncFromFullText('[cot]third[/cot]');
    });
    await flushCotDebounce();

    const cot = result.current.activityTimeline.find((e) => e.type === 'cot');
    expect(cot?.content).toBe('third');
  });
});
