import { useState, useEffect } from 'react';
import { SCREENSHOT_SHORTCUT_OPTIONS } from '../../ui/settings/constants';

export interface UseScreenshotShortcutReturn {
  screenshotShortcut: string;
  setScreenshotShortcut: React.Dispatch<React.SetStateAction<string>>;
  shortcutCustom: string;
  setShortcutCustom: React.Dispatch<React.SetStateAction<string>>;
  shortcutMode: 'preset' | 'custom';
  setShortcutMode: React.Dispatch<React.SetStateAction<'preset' | 'custom'>>;
  
  // Actions
  saveShortcut: () => void;
}

export function useScreenshotShortcut(): UseScreenshotShortcutReturn {
  const [screenshotShortcut, setScreenshotShortcut] = useState('Alt+A');
  const [shortcutCustom, setShortcutCustom] = useState('');
  const [shortcutMode, setShortcutMode] = useState<'preset' | 'custom'>('preset');

  // Load initial shortcut
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getScreenshotShortcut) {
      api.getScreenshotShortcut().then((s: string) => {
        const preset = SCREENSHOT_SHORTCUT_OPTIONS.find((o) => o.value === s);
        if (preset) {
          setScreenshotShortcut(s);
          setShortcutMode('preset');
        } else {
          setScreenshotShortcut('__CUSTOM__');
          setShortcutCustom(s || '');
          setShortcutMode('custom');
        }
      });
    }
  }, []);

  const saveShortcut = () => {
    const api = (window as any).electronAPI;
    if (!api?.setScreenshotShortcut) return;

    const shortcut = shortcutMode === 'custom' ? shortcutCustom : screenshotShortcut;
    if (shortcut && shortcut !== '__CUSTOM__') {
      api.setScreenshotShortcut(shortcut);
    }
  };

  return {
    screenshotShortcut,
    setScreenshotShortcut,
    shortcutCustom,
    setShortcutCustom,
    shortcutMode,
    setShortcutMode,
    saveShortcut,
  };
}