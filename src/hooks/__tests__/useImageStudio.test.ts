import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useImageStudio } from '../useImageStudio';

describe('useImageStudio', () => {
  it('初始状态：imageStudioOpen 为 false，imageStudioInitialPrompt 为空', () => {
    const { result } = renderHook(() => useImageStudio([]));
    expect(result.current.imageStudioOpen).toBe(false);
    expect(result.current.imageStudioInitialPrompt).toBe('');
  });

  it('openImageStudio：调用后 imageStudioOpen 为 true', () => {
    const { result } = renderHook(() => useImageStudio([]));
    act(() => {
      result.current.openImageStudio();
    });
    expect(result.current.imageStudioOpen).toBe(true);
  });

  it('openImageStudio(prefill)：imageStudioInitialPrompt 等于传入的 trim 后文案', () => {
    const prefill = '赛博朋克风格的终端海报';
    const { result } = renderHook(() => useImageStudio([]));
    act(() => {
      result.current.openImageStudio(`  ${prefill}  `);
    });
    expect(result.current.imageStudioOpen).toBe(true);
    expect(result.current.imageStudioInitialPrompt).toBe(prefill);
  });

  it('closeImageStudio：open 后 close，imageStudioOpen 回到 false', () => {
    const { result } = renderHook(() => useImageStudio([]));
    act(() => {
      result.current.openImageStudio();
    });
    expect(result.current.imageStudioOpen).toBe(true);
    act(() => {
      result.current.closeImageStudio();
    });
    expect(result.current.imageStudioOpen).toBe(false);
  });

  it('toggleImageStudio：关闭状态下调用变 true，再次调用变 false', () => {
    const { result } = renderHook(() => useImageStudio([]));
    act(() => {
      result.current.toggleImageStudio();
    });
    expect(result.current.imageStudioOpen).toBe(true);
    act(() => {
      result.current.toggleImageStudio();
    });
    expect(result.current.imageStudioOpen).toBe(false);
  });

  it('registerPromptInjector 可接受函数参数且不报错', () => {
    const { result } = renderHook(() => useImageStudio([]));
    const injector = vi.fn();
    expect(() => {
      act(() => {
        result.current.registerPromptInjector(injector);
      });
    }).not.toThrow();
  });
});
