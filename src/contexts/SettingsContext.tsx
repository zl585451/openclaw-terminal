import React, { createContext, useContext, useState, useEffect } from 'react';

export type StreamSpeed = 'fast' | 'medium' | 'slow';
export type TypingSoundMode = 'off' | 'typewriter' | 'soft' | 'bubble';
export type ThemeColor = 'matrix' | 'cyber' | 'sunset' | 'midnight' | 'custom';

export interface ThemeVars {
  '--primary-color': string;
  '--accent-color': string;
  '--bg-primary': string;
  '--bg-secondary': string;
  '--bg-tertiary': string;
  '--text-primary': string;
  '--text-dim': string;
  '--border-color': string;
  '--glow-color': string;
}

export const THEME_PRESETS: Record<Exclude<ThemeColor, 'custom'>, { label: string; vars: ThemeVars }> = {
  matrix: {
    label: 'Matrix 绿',
    vars: {
      '--primary-color': '#00ff41',
      '--accent-color': '#00ff88',
      '--bg-primary': '#020c06',
      '--bg-secondary': '#030f08',
      '--bg-tertiary': '#041210',
      '--text-primary': '#00ff9f',
      '--text-dim': '#006644',
      '--border-color': 'rgba(0,255,65,0.2)',
      '--glow-color': 'rgba(0,255,65,0.4)',
    },
  },
  cyber: {
    label: 'Cyber 蓝',
    vars: {
      '--primary-color': '#00d4ff',
      '--accent-color': '#00e5ff',
      '--bg-primary': '#020a10',
      '--bg-secondary': '#031018',
      '--bg-tertiary': '#041520',
      '--text-primary': '#b0e0ff',
      '--text-dim': '#2277aa',
      '--border-color': 'rgba(0,212,255,0.2)',
      '--glow-color': 'rgba(0,212,255,0.4)',
    },
  },
  sunset: {
    label: 'Sunset 橙',
    vars: {
      '--primary-color': '#ff6b2b',
      '--accent-color': '#ffaa00',
      '--bg-primary': '#0c0604',
      '--bg-secondary': '#120a06',
      '--bg-tertiary': '#180e08',
      '--text-primary': '#ffe0c0',
      '--text-dim': '#885522',
      '--border-color': 'rgba(255,107,43,0.2)',
      '--glow-color': 'rgba(255,107,43,0.4)',
    },
  },
  midnight: {
    label: 'Midnight 紫',
    vars: {
      '--primary-color': '#a855f7',
      '--accent-color': '#c084fc',
      '--bg-primary': '#08041a',
      '--bg-secondary': '#0c0620',
      '--bg-tertiary': '#100828',
      '--text-primary': '#e0d0ff',
      '--text-dim': '#6633aa',
      '--border-color': 'rgba(168,85,247,0.2)',
      '--glow-color': 'rgba(168,85,247,0.4)',
    },
  },
};

export interface Settings {
  streamSpeed: StreamSpeed;
  typingSound: TypingSoundMode;
  ttsPlayback: boolean;
  theme: ThemeColor;
  customTheme?: ThemeVars;
  aiName: string;
  userName: string;
  personaStyle: 'neutral' | 'warm' | 'companion';
}

const DEFAULT: Settings = {
  streamSpeed: 'medium',
  typingSound: 'off',
  ttsPlayback: false,
  theme: 'matrix',
  aiName: 'OpenClaw',
  userName: '用户',
  personaStyle: 'warm',
};

const STORAGE_KEY = 'claw-terminal-settings';
// 打字机速度：毫秒/字（时间驱动，不依赖帧率）
// 平衡流畅感和速度：既要有打字机动画，又不能让人着急
const SPEED_MS: Record<StreamSpeed, number> = {
  fast: 4,     // 快速：更接近 Claude/GPT 的连续感
  medium: 10,  // 适中：有流动感，仍能看出打字动画
  slow: 18,    // 慢速：保留节奏感
};

function applyThemeVars(vars: ThemeVars) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

const LEGACY_THEME_MAP: Record<string, ThemeColor> = {
  green: 'matrix',
  cyan: 'cyber',
  yellow: 'sunset',
};

function normalizeTheme(raw: string | undefined): ThemeColor {
  if (!raw) return 'matrix';
  if (raw in LEGACY_THEME_MAP) return LEGACY_THEME_MAP[raw];
  if (raw in THEME_PRESETS || raw === 'custom') return raw as ThemeColor;
  return 'matrix';
}

export function getActiveThemeVars(settings: Settings): ThemeVars {
  if (settings.theme === 'custom' && settings.customTheme) return settings.customTheme;
  const key = normalizeTheme(settings.theme);
  return THEME_PRESETS[key === 'custom' ? 'matrix' : key].vars;
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
          ttsPlayback: typeof data.ttsPlayback === 'boolean'
            ? data.ttsPlayback
            : (data.voicePlayback === true ? true : DEFAULT.ttsPlayback),
          theme: normalizeTheme(data.theme),
          customTheme: data.customTheme,
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

  useEffect(() => {
    // 新主题系统启用后（ThemeProvider 使用 oct-theme 持久化），避免旧主题注入覆盖 :root 变量
    try {
      if (localStorage.getItem('oct-theme')) return;
    } catch {}
    applyThemeVars(getActiveThemeVars(settings));
  }, [settings.theme, settings.customTheme]);

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

