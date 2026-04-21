import React, { createContext, useContext, useState, useEffect } from 'react';

export type StreamSpeed = 'fast' | 'medium' | 'slow';
export type TypingSoundMode = 'off' | 'typewriter' | 'soft' | 'bubble';
export type TtsProvider = 'auto' | 'browser' | 'dashscope' | 'minimax';

export interface Settings {
  streamSpeed: StreamSpeed;
  typingSound: TypingSoundMode;
  typingSoundVolume: number;
  ttsPlayback: boolean;
  ttsProvider: TtsProvider;
  aiName: string;
  userName: string;
  personaStyle: 'neutral' | 'warm' | 'companion';
}

const DEFAULT: Settings = {
  streamSpeed: 'medium',
  typingSound: 'off',
  typingSoundVolume: 0.9,
  ttsPlayback: false,
  ttsProvider: 'auto',
  aiName: 'OpenClaw',
  userName: '用户',
  personaStyle: 'warm',
};

const STORAGE_KEY = 'claw-terminal-settings';
// 打字机速度：毫秒/字（时间驱动，不依赖帧率）
// step cap = 3 chars/tick, tick interval ≈ 24ms
// → chars/sec = (budget / effectiveMs) capped at step_cap
// fast:   effectiveMs=8  → budget=3.0/tick → 3chars × 42ticks/s ≈ 125 chars/s
// medium: effectiveMs=18 → budget=1.3/tick → 1-2chars × 42ticks/s ≈ 50 chars/s
// slow:   effectiveMs=36 → budget=0.67/tick → 1char  every 2 ticks ≈ 22 chars/s
const SPEED_MS: Record<StreamSpeed, number> = {
  fast: 8,    // 快速：流畅连续，适合快节奏阅读（≈125字/秒）
  medium: 18, // 适中：有节奏感，清晰可见打字动画（≈50字/秒）
  slow: 36,   // 慢速：逐字出现，适合慢读或演示（≈22字/秒）
};

function normalizeVolume(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1.5, Math.max(0, n));
}

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
          typingSound: data.typingSound === true ? 'typewriter'
            : data.typingSound === false ? 'off'
            : (['off', 'typewriter', 'soft', 'bubble'].includes(data.typingSound) ? data.typingSound : DEFAULT.typingSound),
          typingSoundVolume: normalizeVolume(data.typingSoundVolume, DEFAULT.typingSoundVolume),
          ttsPlayback: typeof data.ttsPlayback === 'boolean'
            ? data.ttsPlayback
            : (data.voicePlayback === true ? true : DEFAULT.ttsPlayback),
          ttsProvider: ['auto', 'browser', 'dashscope', 'minimax'].includes(data.ttsProvider)
            ? data.ttsProvider
            : DEFAULT.ttsProvider,
          aiName: typeof data.aiName === 'string' && data.aiName.trim() ? data.aiName : DEFAULT.aiName,
          userName: typeof data.userName === 'string' && data.userName.trim() ? data.userName : DEFAULT.userName,
          personaStyle: ['neutral', 'warm', 'companion'].includes(data.personaStyle) ? data.personaStyle : DEFAULT.personaStyle,
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

