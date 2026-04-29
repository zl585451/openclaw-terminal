import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTokenUsage } from '../useTokenUsage';

/** 触发 scheduleUsageFlush 登记的 requestAnimationFrame 回调（与 fake timers 配合） */
async function flushUsageRaf() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe('useTokenUsage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      return setTimeout(() => cb(performance.now()), 0) as unknown as number;
    });
    vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id: number) => {
      clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('初始状态 — tokenIn/tokenOut/ctxUsed/ctxMax/cost 全为 null', () => {
    const { result } = renderHook(() => useTokenUsage());
    expect(result.current.tokenIn).toBeNull();
    expect(result.current.tokenOut).toBeNull();
    expect(result.current.ctxUsed).toBeNull();
    expect(result.current.ctxMax).toBeNull();
    expect(result.current.cost).toBeNull();
  });

  it('onUsage 增量模式 — 多次调用累加 tokenIn', async () => {
    const { result } = renderHook(() => useTokenUsage());

    await act(async () => {
      result.current.onUsage({ inputTokens: 100 }, false);
      await flushUsageRaf();
    });
    expect(result.current.tokenIn).toBe(100);

    await act(async () => {
      result.current.onUsage({ inputTokens: 100 }, false);
      await flushUsageRaf();
    });
    expect(result.current.tokenIn).toBe(200);
  });

  it('onUsage 快照模式 — 覆盖而非累加', async () => {
    const { result } = renderHook(() => useTokenUsage());

    await act(async () => {
      result.current.onUsage({ inputTokens: 100 }, false);
      await flushUsageRaf();
    });
    expect(result.current.tokenIn).toBe(100);

    await act(async () => {
      result.current.onUsage({ inputTokens: 50 }, true);
      await flushUsageRaf();
    });
    expect(result.current.tokenIn).toBe(50);
  });

  it('同一帧多个 onUsage 合并 flush 一次后数值正确（批量 RAF）', async () => {
    const { result } = renderHook(() => useTokenUsage());

    await act(async () => {
      result.current.onUsage({ inputTokens: 50 }, false);
      result.current.onUsage({ inputTokens: 60 }, false);
      result.current.onUsage({ inputTokens: 10 }, false);
      await flushUsageRaf();
    });

    expect(result.current.tokenIn).toBe(120);
  });

  it('resetUsage — 重置后全部回到 null', async () => {
    const { result } = renderHook(() => useTokenUsage());

    await act(async () => {
      result.current.onUsage({ inputTokens: 42, outputTokens: 7, ctxUsed: 9, ctxMax: 8192 }, false);
      result.current.onUsage({ cost: 1.23 }, false);
      await flushUsageRaf();
    });

    await act(async () => {
      result.current.resetUsage();
    });

    expect(result.current.tokenIn).toBeNull();
    expect(result.current.tokenOut).toBeNull();
    expect(result.current.ctxUsed).toBeNull();
    expect(result.current.ctxMax).toBeNull();
    expect(result.current.cost).toBeNull();
  });

  it('setFromSystemReply — 直接写入 tokenIn/ctxUsed/ctxMax', async () => {
    const { result } = renderHook(() => useTokenUsage());

    await act(async () => {
      result.current.setFromSystemReply({
        tokenIn: 777,
        ctxUsed: 1000,
        ctxMax: 200000,
      });
    });

    expect(result.current.tokenIn).toBe(777);
    expect(result.current.ctxUsed).toBe(1000);
    expect(result.current.ctxMax).toBe(200000);
  });

  it('onUsage ctxUsed/ctxMax 字段写入（含 prompt/context 别名）', async () => {
    const { result } = renderHook(() => useTokenUsage());

    await act(async () => {
      result.current.onUsage({ ctxUsed: 111, ctxMax: 4096 }, false);
      await flushUsageRaf();
    });
    expect(result.current.ctxUsed).toBe(111);
    expect(result.current.ctxMax).toBe(4096);

    await act(async () => {
      result.current.resetUsage();
    });

    await act(async () => {
      result.current.onUsage({ context_tokens: 333, ctxMax: 8192 }, false);
      await flushUsageRaf();
    });
    expect(result.current.ctxUsed).toBe(333);
    expect(result.current.ctxMax).toBe(8192);
  });

  it('onUsage cost 字段累加', async () => {
    const { result } = renderHook(() => useTokenUsage());

    await act(async () => {
      result.current.onUsage({ cost: 10 }, false);
      await flushUsageRaf();
    });
    expect(result.current.cost).toBe(10);

    await act(async () => {
      result.current.onUsage({ cost: 2.5 }, false);
      await flushUsageRaf();
    });
    expect(result.current.cost).toBe(12.5);
  });
});
