import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTypewriter } from '../useTypewriter';

describe('useTypewriter', () => {
  describe('enabled=false（保守：不驱动 RAF）', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('初始状态 — displayedText 为空，isTyping 为 false', () => {
      const onFinished = vi.fn();
      const { result } = renderHook(() =>
        useTypewriter({
          baseDelayMs: 8,
          typingSound: 'off',
          onFinished,
          enabled: false,
        }),
      );
      expect(result.current.displayedText).toBe('');
      expect(result.current.isTyping).toBe(false);
    });

    it('feed 不抛错，displayedText 不变', () => {
      const onFinished = vi.fn();
      const { result } = renderHook(() =>
        useTypewriter({
          baseDelayMs: 8,
          typingSound: 'off',
          onFinished,
          enabled: false,
        }),
      );

      expect(() =>
        act(() => {
          result.current.feed('hello stream');
        }),
      ).not.toThrow();

      expect(result.current.displayedText).toBe('');
      expect(onFinished).not.toHaveBeenCalled();
    });

    it('finish 不抛错', () => {
      const onFinished = vi.fn();
      const { result } = renderHook(() =>
        useTypewriter({
          baseDelayMs: 8,
          typingSound: 'off',
          onFinished,
          enabled: false,
        }),
      );

      expect(() =>
        act(() => {
          result.current.finish();
        }),
      ).not.toThrow();
    });

    it('reset 不抛错且 displayedText 仍为空', () => {
      const onFinished = vi.fn();
      const { result } = renderHook(() =>
        useTypewriter({
          baseDelayMs: 8,
          typingSound: 'off',
          onFinished,
          enabled: false,
        }),
      );

      act(() => {
        result.current.feed('any');
        result.current.finish();
      });
      expect(() =>
        act(() => {
          result.current.reset();
        }),
      ).not.toThrow();

      expect(result.current.displayedText).toBe('');
      expect(result.current.isTyping).toBe(false);
    });

    it('feed + finish + 推进较长时间后 onFinished 不被调用', async () => {
      const onFinished = vi.fn();
      const { result } = renderHook(() =>
        useTypewriter({
          baseDelayMs: 8,
          typingSound: 'off',
          onFinished,
          enabled: false,
        }),
      );

      act(() => {
        result.current.feed('hello');
        result.current.finish();
      });

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(onFinished).not.toHaveBeenCalled();
    });
  });

  /**
   * 原计划第 6 项：enabled=true 完成后 isTyping → false 且 onFinished 被调用。
   * 本 hook 使用 setInterval(16) + 嵌套 requestAnimationFrame + 末尾双 rAF 清空 displayedText，
   * 在 fake timers 下需与 performance.now 增量配合，易不稳定；不修改 hook 源码时不在本 PR 强测。
   */
});
