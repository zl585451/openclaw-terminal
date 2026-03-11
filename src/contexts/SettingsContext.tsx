import React, { createContext, useContext, useState, useEffect } from 'react';

export type StreamSpeed = 'fast' | 'medium' | 'slow';
export type ThemeColor = 'green' | 'cyan' | 'yellow';

export interface Settings {
  streamSpeed: StreamSpeed;
  typingSound: boolean;
  theme: ThemeColor;
}

const DEFAULT: Settings = {
  streamSpeed: 'medium',
  typingSound: false,
  theme: 'green',
};

const STORAGE_KEY = 'claw-terminal-settings';
const SPEED_MS: Record<StreamSpeed, number> = {
  fast: 20,
  medium: 50,
  slow: 100,
};

const SettingsContext = createContext<{
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  streamSpeedMs: number;
}>({ settings: DEFAULT, setSettings: () => {}, streamSpeedMs: 50 });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        return {
          streamSpeed: data.streamSpeed ?? DEFAULT.streamSpeed,
          typingSound: typeof data.typingSound === 'boolean' ? data.typingSound : DEFAULT.typingSound,
          theme: data.theme ?? DEFAULT.theme,
        };
      }
    } catch {}
    return DEFAULT;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const streamSpeedMs = SPEED_MS[settings.streamSpeed];

  return (
    <SettingsContext.Provider value={{ settings, setSettings, streamSpeedMs }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
