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
  theme: ThemeColor;
  customTheme?: ThemeVars;
}

const DEFAULT: Settings = {
  streamSpeed: 'medium',
  typingSound: 'off',
  theme: 'matrix',
};

const STORAGE_KEY = 'claw-terminal-settings';
// 打字机速度：毫秒/字（时间驱动，不依赖帧率）
// 研究依据：中文舒适阅读 300-400字/分 ≈ 5-7字/秒
// fast:   ~15字/秒（65ms/字）  - 快速浏览，仍有流动感
// medium: ~7字/秒（140ms/字）  - 贴近自然阅读节奏（推荐）
// slow:   ~4字/秒（240ms/字）  - 慢节奏，逐字细读
const SPEED_MS: Record<StreamSpeed, number> = {
  fast: 45,    // 更快：65 → 45ms（约13字/秒）
  medium: 80,  // 适中：140 → 80ms（约12字/秒）
  slow: 140,   // 慢速：240 → 140ms（约7字/秒）
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
          theme: normalizeTheme(data.theme),
          customTheme: data.customTheme,
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

