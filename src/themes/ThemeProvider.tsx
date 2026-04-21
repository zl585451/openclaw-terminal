// themes/ThemeProvider.tsx
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ThemeDefinition, allThemes, defaultThemeId, ThemeId } from './themes';

// ============================================================
// Context
// ============================================================
interface ThemeContextValue {
  themeId: string;
  theme: ThemeDefinition;
  setTheme: (id: string) => void;
  isDark: boolean;
  cycleTheme: () => void; // 循环切换
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// ============================================================
// 旧主题映射（迁移后可删）
// ============================================================
const STORAGE_KEY = 'oct-theme';
const LEGACY_KEYS = ['oct-settings-theme', 'theme']; // 旧 localStorage key

const LEGACY_THEME_MAP: Record<string, ThemeId> = {
  matrix:    'terminal',
  cyber:     'terminal',
  hacker:    'terminal',
  midnight:  'deepspace',
  deepspace: 'deepspace',
  sunset:    'claude-dark',
  warmgray:  'claude-dark',
  claude:    'claude-dark',
};

function resolveLegacyTheme(): string {
  // 先查新 key
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && allThemes[stored]) return stored;

  // 再查旧 key
  for (const key of LEGACY_KEYS) {
    const legacy = localStorage.getItem(key);
    if (legacy) {
      const mapped = LEGACY_THEME_MAP[legacy] || defaultThemeId;
      // 迁移到新 key
      localStorage.setItem(STORAGE_KEY, mapped);
      localStorage.removeItem(key);
      return mapped;
    }
  }

  return stored && LEGACY_THEME_MAP[stored]
    ? LEGACY_THEME_MAP[stored]
    : defaultThemeId;
}

// ============================================================
// Provider
// ============================================================
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<string>(resolveLegacyTheme);

  const theme = allThemes[themeId] || allThemes[defaultThemeId];

  useEffect(() => {
    const root = document.documentElement;

    // 清除所有自定义属性
    const propsToRemove: string[] = [];
    for (let i = 0; i < root.style.length; i++) {
      const prop = root.style[i];
      if (prop.startsWith('--')) propsToRemove.push(prop);
    }
    propsToRemove.forEach((p) => root.style.removeProperty(p));

    // 注入新变量
    Object.entries(theme.vars).forEach(([key, val]) => {
      root.style.setProperty(key, val);
    });

    // data 属性
    root.setAttribute('data-theme', themeId);
    root.setAttribute('data-color-scheme', theme.isDark ? 'dark' : 'light');

    // 持久化
    localStorage.setItem(STORAGE_KEY, themeId);

    // meta color-scheme（影响浏览器原生 UI）
    let meta = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'color-scheme';
      document.head.appendChild(meta);
    }
    meta.content = theme.isDark ? 'dark' : 'light';
  }, [themeId, theme]);

  // 循环切换: terminal → deepspace → claude → terminal
  const themeIds = Object.keys(allThemes);
  const cycleTheme = useCallback(() => {
    const idx = themeIds.indexOf(themeId);
    const next = themeIds[(idx + 1) % themeIds.length];
    setThemeId(next);
  }, [themeId]);

  return (
    <ThemeContext.Provider
      value={{
        themeId,
        theme,
        setTheme: setThemeId,
        isDark: theme.isDark,
        cycleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// ============================================================
// Hook
// ============================================================
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() must be used within <ThemeProvider>');
  }
  return ctx;
}
