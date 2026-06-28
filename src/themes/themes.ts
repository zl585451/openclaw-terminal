// themes/themes.ts — OCT 三套主题完整定义
// 使用方式: import { allThemes, defaultThemeId } from './themes';

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  isDark: boolean;
  preview: { bg: string; accent: string; text: string };
  vars: Record<string, string>;
}

// ============================================================
// 终端 Terminal — 经典黑客终端，绿色荧光
// ============================================================
export const terminalTheme: ThemeDefinition = {
  id: "terminal",
  name: "终端 Terminal",
  description: "经典黑客终端风格，绿色荧光，暗夜氛围",
  isDark: true,
  preview: { bg: "#0B0F14", accent: "#00E676", text: "#C8E6C9" },
  vars: {
    // 背景层级（从深到浅，4级）
    "--bg-base":        "#0B0F14",   // 最底层
    "--bg-panel":       "#0F1419",   // 面板/卡片底
    "--bg-surface":     "#141B22",   // 内容区
    "--bg-elevated":    "#1A232D",   // 弹窗/浮层
    "--bg-hover":       "#1E2A36",   // hover 态
    "--bg-active":      "#243240",   // active/pressed 态
    "--bg-sidebar":     "#0D1218",   // 侧边栏
    "--bg-input":       "#0F1419",   // 输入框
    "--bg-code":        "#080C10",   // 代码块
    "--bg-code-header": "#0F1419",   // 代码块头
    "--bg-user-msg":    "#112820",   // 用户消息气泡
    "--bg-tooltip":     "#1A232D",   // tooltip
    "--bg-overlay":     "rgba(0, 0, 0, 0.6)",  // 遮罩

    // 文字层级
    "--text-primary":     "#D4E5D0",
    "--text-secondary":   "#8BA68A",
    "--text-tertiary":    "#5E7A5C",
    "--text-inverse":     "#0B0F14",
    "--text-code-color":  "#B8D4B0",
    "--text-link":        "#00E676",
    "--text-placeholder": "#4A6648",

    // 强调色
    "--accent-primary":       "#00E676",
    "--accent-primary-hover":  "#00C964",
    "--accent-primary-muted":  "rgba(0, 230, 118, 0.15)",
    "--accent-primary-glow":   "rgba(0, 230, 118, 0.25)",

    // 状态色（含背景）
    "--status-success":     "#00E676",
    "--status-success-bg":  "rgba(0, 230, 118, 0.12)",
    "--status-warning":     "#FFAB40",
    "--status-warning-bg":  "rgba(255, 171, 64, 0.12)",
    "--status-error":       "#FF5252",
    "--status-error-bg":    "rgba(255, 82, 82, 0.12)",
    "--status-info":        "#40C4FF",
    "--status-info-bg":     "rgba(64, 196, 255, 0.12)",

    // 优先级
    "--priority-p0": "#FF5252",
    "--priority-p1": "#FFAB40",
    "--priority-p2": "#00E676",

    // 边框
    "--border-subtle": "rgba(0, 230, 118, 0.08)",
    "--border-light":  "rgba(0, 230, 118, 0.15)",
    "--border-medium": "rgba(0, 230, 118, 0.25)",
    "--border-focus":  "#00E676",
    "--border-primary": "#00E676",

    // Mermaid
    "--mermaid-card-bg":        "#0E141B",
    "--mermaid-card-header":    "#111A22",
    "--mermaid-card-border":    "rgba(0, 230, 118, 0.22)",
    "--mermaid-stage-bg":       "#0A1016",
    "--mermaid-stage-border":   "rgba(0, 230, 118, 0.18)",
    "--mermaid-node-fill":      "#163527",
    "--mermaid-node-text":      "#E8FFF2",
    "--mermaid-node-border":    "#00E676",
    "--mermaid-cluster-fill":   "#13212B",
    "--mermaid-cluster-text":   "#D4E5D0",
    "--mermaid-cluster-border": "rgba(0, 230, 118, 0.42)",
    "--mermaid-line":           "#38F08F",
    "--mermaid-edge-label-bg":  "#0F1419",
    "--mermaid-font-family":    "'JetBrains Mono', 'Noto Sans SC', monospace",
    // Mermaid pie chart — 哑光色板（绿色黑客风）
    "--mermaid-pie-1": "#38a86c",  // 消光翠绿（主题色调低饱和版）
    "--mermaid-pie-2": "#3d8faa",  // 钢青
    "--mermaid-pie-3": "#a88c38",  // 琥珀金
    "--mermaid-pie-4": "#7858a8",  // 柔紫
    "--mermaid-pie-5": "#5ea03e",  // 橄榄绿
    "--mermaid-pie-6": "#a84e40",  // 砖红
    "--mermaid-pie-7": "#4878b8",  // 钢蓝
    "--mermaid-pie-8": "#889830",  // 橄榄黄

    // 圆角
    "--radius-sm":   "6px",
    "--radius-md":   "8px",
    "--radius-lg":   "12px",
    "--radius-xl":   "16px",
    "--radius-pill":  "9999px",

    // 阴影
    "--shadow-sm":   "0 1px 3px rgba(0, 0, 0, 0.3)",
    "--shadow-md":   "0 2px 8px rgba(0, 0, 0, 0.4)",
    "--shadow-lg":   "0 4px 20px rgba(0, 0, 0, 0.5)",
    "--shadow-glow": "0 0 20px rgba(0, 230, 118, 0.15)",

    // 字体: Terminal 主题使用等宽字体保持黑客风
    "--font-sans":    "'JetBrains Mono', 'Noto Sans SC', monospace",
    "--font-mono":    "'JetBrains Mono', 'Fira Code', monospace",
    "--font-display": "'JetBrains Mono', monospace",

    // 字号（优化后的分级）
    "--text-xs":   "11px",   // 时间戳、极小标注
    "--text-sm":   "12px",   // 状态标签、代码块头、辅助信息
    "--text-base": "13px",   // 代码块内容、等宽场景
    "--text-md":   "15px",   // ★ 正文/对话消息（核心阅读尺寸）
    "--text-lg":   "17px",   // 区块标题、侧边栏标题
    "--text-xl":   "20px",   // 页面标题
    "--text-2xl":  "24px",   // 大标题
    "--text-3xl":  "30px",   // 特大标题

    // 代码专用字号
    "--text-code":    "13px",  // 代码块内容
    "--text-code-sm": "12px",  // 代码块头部语言标签

    // 行高
    "--leading-tight":   "1.4",  // 代码、紧凑场景
    "--leading-normal":  "1.7",  // 正文（英文为主）
    "--leading-relaxed": "1.8",  // 正文（中文混排）
    "--leading-loose":   "2.0",  // 大标题

    // 滚动条
    "--scrollbar-track":       "#0B0F14",
    "--scrollbar-thumb":       "#1E2A36",
    "--scrollbar-thumb-hover": "#2A3A4A",

    // 特殊效果
    "--selection-bg":   "rgba(0, 230, 118, 0.25)",
    "--selection-text":  "#D4E5D0",
  },
};

// ============================================================
// 深空 Deep Space — 宇宙感冷蓝紫
// ============================================================
export const deepspaceTheme: ThemeDefinition = {
  id: "deepspace",
  name: "深空 Deep Space",
  description: "深邃宇宙感，冷蓝紫调，沉浸专注",
  isDark: true,
  preview: { bg: "#0C0E1A", accent: "#7C8AFF", text: "#C5CAE9" },
  vars: {
    "--bg-base":        "#0C0E1A",
    "--bg-panel":       "#111428",
    "--bg-surface":     "#161A32",
    "--bg-elevated":    "#1C2040",
    "--bg-hover":       "#22274A",
    "--bg-active":      "#2A3058",
    "--bg-sidebar":     "#0A0C16",
    "--bg-input":       "#111428",
    "--bg-code":        "#080A14",
    "--bg-code-header": "#111428",
    "--bg-user-msg":    "#1A1E44",
    "--bg-tooltip":     "#1C2040",
    "--bg-overlay":     "rgba(0, 0, 0, 0.6)",

    "--text-primary":     "#D0D4F0",
    "--text-secondary":   "#8890B8",
    "--text-tertiary":    "#5C6490",
    "--text-inverse":     "#0C0E1A",
    "--text-code-color":  "#B8BEE0",
    "--text-link":        "#7C8AFF",
    "--text-placeholder": "#484E78",

    "--accent-primary":       "#7C8AFF",
    "--accent-primary-hover":  "#6B78F0",
    "--accent-primary-muted":  "rgba(124, 138, 255, 0.15)",
    "--accent-primary-glow":   "rgba(124, 138, 255, 0.25)",

    "--status-success":     "#66DEA0",
    "--status-success-bg":  "rgba(102, 222, 160, 0.12)",
    "--status-warning":     "#FFCC80",
    "--status-warning-bg":  "rgba(255, 204, 128, 0.12)",
    "--status-error":       "#FF8A80",
    "--status-error-bg":    "rgba(255, 138, 128, 0.12)",
    "--status-info":        "#80D8FF",
    "--status-info-bg":     "rgba(128, 216, 255, 0.12)",

    "--priority-p0": "#FF8A80",
    "--priority-p1": "#FFCC80",
    "--priority-p2": "#66DEA0",

    "--border-subtle": "rgba(124, 138, 255, 0.08)",
    "--border-light":  "rgba(124, 138, 255, 0.15)",
    "--border-medium": "rgba(124, 138, 255, 0.25)",
    "--border-focus":  "#7C8AFF",
    "--border-primary":"#7C8AFF",

    // Mermaid
    "--mermaid-card-bg":        "#11162A",
    "--mermaid-card-header":    "#161C34",
    "--mermaid-card-border":    "rgba(124, 138, 255, 0.28)",
    "--mermaid-stage-bg":       "#0C1120",
    "--mermaid-stage-border":   "rgba(124, 138, 255, 0.22)",
    "--mermaid-node-fill":      "#2B448E",
    "--mermaid-node-text":      "#F5F7FF",
    "--mermaid-node-border":    "#8EA2FF",
    "--mermaid-cluster-fill":   "#23263A",
    "--mermaid-cluster-text":   "#E4E9FF",
    "--mermaid-cluster-border": "rgba(142, 162, 255, 0.48)",
    "--mermaid-line":           "#8EA2FF",
    "--mermaid-edge-label-bg":  "#161A32",
    "--mermaid-font-family":    "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    // Mermaid pie chart — 哑光色板（深空冷蓝紫风）
    "--mermaid-pie-1": "#6070d8",  // 主题靛蓝（近 accent 低饱和版）
    "--mermaid-pie-2": "#38a0a8",  // 深空青
    "--mermaid-pie-3": "#a88840",  // 星云金
    "--mermaid-pie-4": "#9060c0",  // 紫水晶
    "--mermaid-pie-5": "#3a9870",  // 海泡绿
    "--mermaid-pie-6": "#b06858",  // 暗赭
    "--mermaid-pie-7": "#7888d0",  // 矢车菊蓝
    "--mermaid-pie-8": "#7898b0",  // 钢灰蓝

    "--radius-sm":   "6px",
    "--radius-md":   "10px",
    "--radius-lg":   "14px",
    "--radius-xl":   "18px",
    "--radius-pill":  "9999px",

    "--shadow-sm":   "0 1px 4px rgba(0, 0, 0, 0.3)",
    "--shadow-md":   "0 3px 12px rgba(0, 0, 0, 0.4)",
    "--shadow-lg":   "0 6px 24px rgba(0, 0, 0, 0.5)",
    "--shadow-glow": "0 0 24px rgba(124, 138, 255, 0.12)",

    // 字体: Inter (英文) + Noto Sans SC (中文) + JetBrains Mono (代码)
    "--font-sans":    "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "--font-mono":    "'JetBrains Mono', 'Fira Code', monospace",
    "--font-display": "'Inter', 'Noto Sans SC', -apple-system, sans-serif",

    // 字号（优化后的分级）
    "--text-xs":   "11px",   // 时间戳、极小标注
    "--text-sm":   "12px",   // 状态标签、代码块头、辅助信息
    "--text-base": "13px",   // 代码块内容、等宽场景
    "--text-md":   "15px",   // ★ 正文/对话消息（核心阅读尺寸）
    "--text-lg":   "17px",   // 区块标题、侧边栏标题
    "--text-xl":   "20px",   // 页面标题
    "--text-2xl":  "24px",   // 大标题
    "--text-3xl":  "30px",   // 特大标题

    // 代码专用字号
    "--text-code":    "13px",  // 代码块内容
    "--text-code-sm": "12px",  // 代码块头部语言标签

    // 行高
    "--leading-tight":   "1.4",  // 代码、紧凑场景
    "--leading-normal":  "1.7",  // 正文（英文为主）
    "--leading-relaxed": "1.8",  // 正文（中文混排）
    "--leading-loose":   "2.0",  // 大标题

    "--scrollbar-track":       "#0C0E1A",
    "--scrollbar-thumb":       "#22274A",
    "--scrollbar-thumb-hover": "#2E3460",

    "--selection-bg":   "rgba(124, 138, 255, 0.25)",
    "--selection-text":  "#D0D4F0",
  },
};

// ============================================================
// 深夜工作室 Night Studio — 深棕黑 + 哑光琥珀金
// ============================================================
export const claudeDarkTheme: ThemeDefinition = {
  id: "claude-dark",
  name: "深夜工作室",
  description: "深棕黑底色，哑光琥珀金主色，沉稳精致的夜间创作氛围",
  isDark: true,
  preview: { bg: "#100e0a", accent: "#c4963a", text: "#d4c9b0" },
  vars: {
    "--bg-base":        "#100e0a",
    "--bg-panel":       "#141109",
    "--bg-surface":     "#1a1710",
    "--bg-elevated":    "#211c12",
    "--bg-hover":       "#261f14",
    "--bg-active":      "#2e2618",
    "--bg-sidebar":     "#0c0b07",
    "--bg-input":       "#141109",
    "--bg-code":        "#0a0807",
    "--bg-code-header": "#141109",
    "--bg-user-msg":    "#1c1608",
    "--bg-tooltip":     "#211c12",
    "--bg-overlay":     "rgba(0, 0, 0, 0.6)",

    "--text-primary":     "#d4c9b0",
    "--text-secondary":   "#8a7e6a",
    "--text-tertiary":    "#5a5040",
    "--text-inverse":     "#100e0a",
    "--text-code-color":  "#c8bfaa",
    "--text-link":        "#d4a84a",
    "--text-placeholder": "#4a4030",

    "--accent-primary":       "#c4963a",
    "--accent-primary-hover":  "#d4a642",
    "--accent-primary-muted":  "rgba(196, 150, 58, 0.15)",
    "--accent-primary-glow":   "rgba(196, 150, 58, 0.10)",

    "--status-success":     "#7aaa6a",
    "--status-success-bg":  "rgba(122, 170, 106, 0.12)",
    "--status-warning":     "#c4963a",
    "--status-warning-bg":  "rgba(196, 150, 58, 0.12)",
    "--status-error":       "#c46a4a",
    "--status-error-bg":    "rgba(196, 106, 74, 0.12)",
    "--status-info":        "#6a9ec4",
    "--status-info-bg":     "rgba(106, 158, 196, 0.12)",

    "--priority-p0": "#c46a4a",
    "--priority-p1": "#c4963a",
    "--priority-p2": "#7aaa6a",

    "--border-subtle":  "rgba(255, 255, 255, 0.05)",
    "--border-light":   "rgba(255, 255, 255, 0.08)",
    "--border-medium":  "rgba(255, 255, 255, 0.13)",
    "--border-focus":   "#c4963a",
    "--border-primary": "#c4963a",

    // Mermaid —— 扁平克制（claude.ai 风）：节点≈卡片面、细中性描边、柔连线、纸面舞台，
    // 琥珀只作点缀（描边低透明 + cluster），不再每个节点实心橙块。
    "--mermaid-card-bg":        "#1a1610",
    "--mermaid-card-header":    "#1e1912",
    "--mermaid-card-border":    "rgba(255, 255, 255, 0.08)",
    "--mermaid-stage-bg":       "#1a1610",
    "--mermaid-stage-border":   "rgba(255, 255, 255, 0.06)",
    "--mermaid-node-fill":      "#23200f",
    "--mermaid-node-text":      "#e9dec4",
    "--mermaid-node-border":    "rgba(196, 150, 58, 0.32)",
    "--mermaid-cluster-fill":   "#1d1810",
    "--mermaid-cluster-text":   "#b8ad97",
    "--mermaid-cluster-border": "rgba(255, 255, 255, 0.08)",
    "--mermaid-line":            "rgba(212, 201, 176, 0.28)",
    "--mermaid-edge-label-bg":  "#1a1610",
    "--mermaid-font-family":    "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "--mermaid-pie-1": "#a07828",
    "--mermaid-pie-2": "#3a8888",
    "--mermaid-pie-3": "#7a9040",
    "--mermaid-pie-4": "#7060a0",
    "--mermaid-pie-5": "#488068",
    "--mermaid-pie-6": "#904860",
    "--mermaid-pie-7": "#406890",
    "--mermaid-pie-8": "#7a6830",

    "--radius-sm":   "6px",
    "--radius-md":   "10px",
    "--radius-lg":   "14px",
    "--radius-xl":   "18px",
    "--radius-pill":  "9999px",

    "--shadow-sm":   "0 1px 3px rgba(0, 0, 0, 0.3)",
    "--shadow-md":   "0 2px 8px rgba(0, 0, 0, 0.4)",
    "--shadow-lg":   "0 4px 16px rgba(0, 0, 0, 0.5)",
    "--shadow-glow": "none",

    "--font-sans":    "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "--font-mono":    "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace",
    "--font-display": "'Inter', 'Noto Sans SC', -apple-system, sans-serif",

    "--text-xs":   "11px",
    "--text-sm":   "12px",
    "--text-base": "13px",
    "--text-md":   "15px",
    "--text-lg":   "17px",
    "--text-xl":   "20px",
    "--text-2xl":  "24px",
    "--text-3xl":  "30px",

    "--text-code":    "13px",
    "--text-code-sm": "12px",

    "--leading-tight":   "1.4",
    "--leading-normal":  "1.7",
    "--leading-relaxed": "1.8",
    "--leading-loose":   "2.0",

    "--scrollbar-track":       "#100e0a",
    "--scrollbar-thumb":       "#2e2618",
    "--scrollbar-thumb-hover": "#3a3020",

    "--selection-bg":   "rgba(196, 150, 58, 0.25)",
    "--selection-text":  "#d4c9b0",
  },
};

// ============================================================
// 导出
// ============================================================
export const allThemes: Record<string, ThemeDefinition> = {
  terminal: terminalTheme,
  deepspace: deepspaceTheme,
  "claude-dark": claudeDarkTheme,
};

export const defaultThemeId = "claude-dark";
export type ThemeId = keyof typeof allThemes;
