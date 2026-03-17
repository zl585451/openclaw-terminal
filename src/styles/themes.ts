/**
 * 主题配置文件
 * 支持一键切换主题，主题持久化存储到 localStorage
 */

export const THEMES = {
  hacker: {
    name: '黑客终端',
    '--bg-primary': '#0a0a0a',
    '--bg-panel': '#0d1a0d',
    '--bg-surface': '#1a1a1a',
    '--border-color': '#2a2a2a',
    '--accent': '#00ff88',
    '--accent-dim': '#00cc66',
    '--text-primary': '#e0e0e0',
    '--text-secondary': '#888888',
    '--text-muted': '#444444',
    '--p0': '#ff4444',
    '--p1': '#ffaa00',
    '--p2': '#00ff88',
    '--user-msg-bg': '#1a3a1a',
    '--user-msg-border': '#2a4a2a',
    '--amy-msg-bg': '#0a1a0a',
    '--amy-msg-border': '#1a2a1a',
  },
  deepspace: {
    name: '深空工作站',
    '--bg-primary': '#13151a',
    '--bg-panel': '#1a1d24',
    '--bg-surface': '#1e2028',
    '--border-color': '#2e3240',
    '--accent': '#7eb8f7',
    '--accent-dim': '#5a9ae0',
    '--text-primary': '#e2e6f0',
    '--text-secondary': '#8892a4',
    '--text-muted': '#4a5268',
    '--p0': '#e05c6a',
    '--p1': '#d4924a',
    '--p2': '#5ab88a',
    '--user-msg-bg': '#1e2028',
    '--user-msg-border': '#2e3240',
    '--amy-msg-bg': '#161922',
    '--amy-msg-border': '#252a38',
  },
  warmgray: {
    name: '暖灰陪伴',
    '--bg-primary': '#171614',
    '--bg-panel': '#1e1c1a',
    '--bg-surface': '#252320',
    '--border-color': '#2e2c28',
    '--accent': '#c8a96e',
    '--accent-dim': '#a8894e',
    '--text-primary': '#dedad4',
    '--text-secondary': '#8a8680',
    '--text-muted': '#4a4840',
    '--p0': '#c85a4a',
    '--p1': '#c8923a',
    '--p2': '#7aaa6a',
    '--user-msg-bg': '#1e1c1a',
    '--user-msg-border': '#2e2c28',
    '--amy-msg-bg': '#141210',
    '--amy-msg-border': '#242220',
  },
} as const;

export type ThemeKey = keyof typeof THEMES;

const THEME_STORAGE_KEY = 'oct-theme';

/**
 * 应用指定主题到 DOM
 */
export function applyTheme(key: ThemeKey) {
  const theme = THEMES[key];
  const root = document.documentElement;
  Object.entries(theme).forEach(([k, v]) => {
    if (k.startsWith('--')) {
      root.style.setProperty(k, v as string);
    }
  });
  localStorage.setItem(THEME_STORAGE_KEY, key);
}

/**
 * 加载已保存的主题，如果没有则使用默认主题
 */
export function loadSavedTheme(): ThemeKey {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeKey | null;
  if (saved && THEMES[saved]) {
    applyTheme(saved);
    return saved;
  }
  applyTheme('hacker');
  return 'hacker';
}

/**
 * 获取当前主题
 */
export function getCurrentTheme(): ThemeKey {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeKey | null;
  return saved && THEMES[saved] ? saved : 'hacker';
}