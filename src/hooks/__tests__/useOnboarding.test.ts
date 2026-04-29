import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useOnboarding } from '../useOnboarding';

const ONBOARDING_DISMISSED_KEY = 'oct.onboarding.dismissed';

describe('useOnboarding', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('初始状态：onboardingDismissed 为 false', () => {
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.onboardingDismissed).toBe(false);
  });

  it('dismissOnboarding 后 onboardingDismissed 变为 true', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => {
      result.current.dismissOnboarding();
    });
    expect(result.current.onboardingDismissed).toBe(true);
  });

  it('dismiss 后 resetOnboardingForDev 重置回 false', () => {
    const { result } = renderHook(() => useOnboarding());
    act(() => {
      result.current.dismissOnboarding();
    });
    act(() => {
      result.current.resetOnboardingForDev();
    });
    expect(result.current.onboardingDismissed).toBe(false);
  });

  it('localStorage 已有 dismissed 标记时初始为 true', () => {
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
    const { result } = renderHook(() => useOnboarding());
    expect(result.current.onboardingDismissed).toBe(true);
  });
});
