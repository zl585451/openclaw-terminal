import { useCallback, useState } from 'react';

const ONBOARDING_DISMISSED_KEY = 'oct.onboarding.dismissed';

export function useOnboarding() {
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const dismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    try {
      localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  /** 仅开发态：与 ChatTab「欢迎页」调试按钮一致，清除持久化并重新显示引导。 */
  const resetOnboardingForDev = useCallback(() => {
    try {
      localStorage.removeItem(ONBOARDING_DISMISSED_KEY);
    } catch {
      /* ignore */
    }
    setOnboardingDismissed(false);
  }, []);

  return {
    onboardingDismissed,
    dismissOnboarding,
    resetOnboardingForDev,
  };
}
