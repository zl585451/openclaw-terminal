// Artifact Shell — inject a Claude-style design system into raw AI HTML/SVG
// before it is rendered inside the Canvas iframe.
//
// Why this exists:
//   The Canvas HTML plugin renders model output via `<iframe srcDoc=...>`.
//   A bare iframe has NO css reset, defaults to a serif font, and does not
//   define any design tokens — so AI artifacts look amateur compared to
//   Claude's, whose iframes ship a full design system. This module is that
//   missing layer: a reset + font stack + design tokens + flat defaults.
//
// The iframe uses `sandbox="allow-scripts"` (no allow-same-origin), so it
// cannot read the parent document's CSS variables at runtime. We therefore
// snapshot the host theme tokens at wrap time and bake them into the shell.

export interface ArtifactShellOptions {
  /** Resolved theme. Defaults to 'dark' (all current app themes are dark). */
  theme?: 'dark' | 'light';
  /** Override accent color; defaults to the host --accent-primary. */
  accent?: string;
}

function readHostVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  try {
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  } catch {
    return fallback;
  }
}

/** Claude design-system color ramps (heather / heron neutrals / functional). */
const HEATHER = ['#EEEDFE', '#CECBF6', '#AFA9EC', '#7F77DD', '#534AB7', '#3C3489', '#26215C'];
const HERON   = ['#F1EFE8', '#D3D1C7', '#B4B2A9', '#888780', '#5F5E5A', '#444441', '#2C2C2A'];

function buildTokens(theme: 'dark' | 'light', accent: string): string {
  const isDark = theme === 'dark';
  // Map app/theme-aware surfaces. We prefer the host's own surfaces so the
  // artifact feels like part of the app, then fall back to Claude neutrals.
  const bg        = readHostVar('--bg-surface', isDark ? '#141B22' : '#FFFFFF');
  const bgAlt     = readHostVar('--bg-panel',   isDark ? '#0F1419' : HERON[0]);
  const textMain  = readHostVar('--text-primary',   isDark ? '#E8E4DD' : HERON[6]);
  const textSub   = readHostVar('--text-secondary', isDark ? '#B4B2A9' : HERON[4]);
  const textMute  = readHostVar('--text-tertiary',  isDark ? '#888780' : HERON[3]);
  const border    = isDark ? 'rgba(255,255,255,0.10)' : HERON[1];
  const borderSub = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  // 节点/卡片用的"微抬升"表面：暗色用半透明白叠加，亮色用纯白，两边都能从底色里浮出来。
  const surfaceRaised = isDark ? 'rgba(255,255,255,0.045)' : '#FFFFFF';

  const fontSans = readHostVar(
    '--font-sans',
    "'Inter', system-ui, -apple-system, 'Segoe UI', 'Noto Sans SC', sans-serif"
  );
  const fontMono = readHostVar(
    '--font-mono',
    "'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace"
  );

  return `
    --font-sans: ${fontSans};
    --font-mono: ${fontMono};
    --font-serif: 'Georgia', 'Songti SC', 'Noto Serif SC', serif;

    --border-radius-sm: 6px;
    --border-radius-md: 10px;
    --border-radius-lg: 14px;
    --border-radius-xl: 20px;

    /* Semantic tokens — mirror Claude's artifact contract so var()-based output resolves */
    --color-background-primary: ${bg};
    --color-background-secondary: ${bgAlt};
    --color-text-primary: ${textMain};
    --color-text-secondary: ${textSub};
    --color-text-tertiary: ${textMute};
    --color-text-info: ${accent};
    --color-border-primary: ${border};
    --color-border-secondary: ${border};
    --color-border-tertiary: ${borderSub};
    --color-surface-raised: ${surfaceRaised};
    --color-accent: ${accent};

    /* 分组语义色 — 取中间调，亮/暗主题下都清晰，用于图表分组描边/色块 */
    --cat-purple: #7F77DD;
    --cat-green:  #1D9E75;
    --cat-amber:  #EF9F27;
    --cat-blue:   #378ADD;
    --cat-pink:   #D4537E;

    /* Heather (accent) ramp */
    --heather-100: ${HEATHER[0]}; --heather-200: ${HEATHER[1]}; --heather-300: ${HEATHER[2]};
    --heather-400: ${HEATHER[3]}; --heather-500: ${HEATHER[4]}; --heather-600: ${HEATHER[5]}; --heather-700: ${HEATHER[6]};
    /* Heron (neutral) ramp */
    --heron-100: ${HERON[0]}; --heron-200: ${HERON[1]}; --heron-300: ${HERON[2]};
    --heron-400: ${HERON[3]}; --heron-500: ${HERON[4]}; --heron-600: ${HERON[5]}; --heron-700: ${HERON[6]};
  `.trim();
}

function baseStylesheet(theme: 'dark' | 'light', accent: string): string {
  return `
:root {
${buildTokens(theme, accent)}
  color-scheme: ${theme};
}
*, *::before, *::after { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
body { padding: 24px; }
h1, h2, h3, h4 { font-weight: 650; line-height: 1.25; letter-spacing: -0.01em; margin: 0 0 0.5em; }
h1 { font-size: 1.6rem; } h2 { font-size: 1.3rem; } h3 { font-size: 1.1rem; }
p { margin: 0 0 0.85em; }
a { color: var(--color-accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre, kbd { font-family: var(--font-mono); }
pre { background: var(--color-background-secondary); padding: 14px 16px; border-radius: var(--border-radius-md); overflow: auto; }
code { background: var(--color-background-secondary); padding: 1px 5px; border-radius: var(--border-radius-sm); font-size: 0.9em; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid var(--color-border-tertiary); padding: 8px 12px; text-align: left; }
th { background: var(--color-background-secondary); font-weight: 600; }
hr { border: none; border-top: 1px solid var(--color-border-tertiary); margin: 1.5em 0; }
img, svg { max-width: 100%; }
::selection { background: var(--heather-300); color: var(--heron-700); }
`.trim();
}

/** Wrapper used when the artifact is a bare <svg> — centers it with breathing room. */
function svgWrapperStyles(): string {
  return `
body { display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 32px; }
svg { max-width: 100%; max-height: 100%; height: auto; }
`.trim();
}

function looksLikeFullDocument(content: string): boolean {
  return /<!doctype html|<html[\s>]/i.test(content);
}

function looksLikeBareSvg(content: string): boolean {
  return /^\s*<svg[\s>]/i.test(content);
}

/**
 * Wrap raw artifact content (HTML fragment, full HTML doc, or bare SVG) in a
 * design-system shell suitable for an iframe srcDoc. Idempotent-safe: if a
 * shell marker is already present, the content is returned unchanged.
 */
export function wrapArtifactHtml(content: string, options: ArtifactShellOptions = {}): string {
  const raw = String(content ?? '');
  if (raw.includes('data-oct-artifact-shell')) return raw;

  const theme = options.theme ?? 'dark';
  const accent = options.accent ?? readHostVar('--accent-primary', '#7F77DD');
  const isSvg = looksLikeBareSvg(raw);
  const style = baseStylesheet(theme, accent) + (isSvg ? '\n' + svgWrapperStyles() : '');

  // Full HTML document: inject our shell <style> first so authored styles win
  // on conflict but inherit our reset/tokens/font as the base layer.
  if (looksLikeFullDocument(raw)) {
    const injected = `<style data-oct-artifact-shell>${style}</style>`;
    if (/<head[^>]*>/i.test(raw)) {
      return raw.replace(/<head[^>]*>/i, (m) => `${m}\n${injected}`);
    }
    if (/<html[^>]*>/i.test(raw)) {
      return raw.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${injected}</head>`);
    }
    return `${injected}\n${raw}`;
  }

  // Fragment or bare SVG: build a complete document around it.
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style data-oct-artifact-shell>${style}</style>
</head>
<body>
${raw}
</body>
</html>`;
}
