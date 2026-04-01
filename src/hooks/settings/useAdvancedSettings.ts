import { useState, useEffect } from 'react';

export interface AdvancedSettingsState {
  fontSize: string;
  autoScroll: boolean;
  showNotifications: boolean;
  maxHistory: number;
}

export interface UseAdvancedSettingsReturn {
  fontSize: string;
  setFontSize: React.Dispatch<React.SetStateAction<string>>;
  autoScroll: boolean;
  setAutoScroll: React.Dispatch<React.SetStateAction<boolean>>;
  showNotifications: boolean;
  setShowNotifications: React.Dispatch<React.SetStateAction<boolean>>;
  maxHistory: number;
  setMaxHistory: React.Dispatch<React.SetStateAction<number>>;
  
  // Actions
  saveAdvancedSettings: () => void;
}

const STORAGE_KEY = 'claw-terminal-advanced-settings';

export function useAdvancedSettings(): UseAdvancedSettingsReturn {
  const [fontSize, setFontSize] = useState('14');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showNotifications, setShowNotifications] = useState(true);
  const [maxHistory, setMaxHistory] = useState(100);

  // Load initial settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.fontSize) setFontSize(data.fontSize);
        if (typeof data.autoScroll === 'boolean') setAutoScroll(data.autoScroll);
        if (typeof data.showNotifications === 'boolean') setShowNotifications(data.showNotifications);
        if (data.maxHistory) setMaxHistory(data.maxHistory);
      }
    } catch (err) {
      console.error('[Settings] 加载高级设置失败:', err);
    }
  }, []);

  const saveAdvancedSettings = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fontSize,
        autoScroll,
        showNotifications,
        maxHistory,
      }));
    } catch (err) {
      console.error('[Settings] 保存高级设置失败:', err);
    }
  };

  return {
    fontSize,
    setFontSize,
    autoScroll,
    setAutoScroll,
    showNotifications,
    setShowNotifications,
    maxHistory,
    setMaxHistory,
    saveAdvancedSettings,
  };
}