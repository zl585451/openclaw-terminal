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
// 棕黑 Claude Dark — 深色温暖棕黑
// ============================================================
export const claudeDarkTheme: ThemeDefinition = {
  id: "claude-dark",
  name: "棕黑 Claude Dark",
  description: "温暖棕黑深色主题，适合夜间阅读（Noto Sans SC 优先）",
  isDark: true,
  // 按设计稿（Claude 网页版深色）配色
  preview: { bg: "#2B2A27", accent: "#D4764E", text: "#E8E4DD" },
  vars: {
    "--bg-base":        "#2B2A27",
    "--bg-panel":       "#353430",
    "--bg-surface":     "#3D3C37",
    "--bg-elevated":    "#454440",
    "--bg-hover":       "#4A4944",
    "--bg-active":      "#53524D",
    "--bg-sidebar":     "#252420",
    "--bg-input":       "#353430",
    "--bg-code":        "#1E1D1A",
    "--bg-code-header": "#2B2A27",
    "--bg-user-msg":    "#3D3B35",
    "--bg-tooltip":     "#1E1D1A",
    "--bg-overlay":     "rgba(0, 0, 0, 0.5)",

    "--text-primary":     "#E8E4DD",
    "--text-secondary":   "#A9A49C",
    "--text-tertiary":    "#7A7670",
    "--text-inverse":     "#2B2A27",
    "--text-code-color":  "#D4D0C8",
    "--text-link":        "#E8956A",
    "--text-placeholder": "#6A6660",

    "--accent-primary":       "#D4764E",
    "--accent-primary-hover":  "#C46A44",
    "--accent-primary-muted":  "rgba(212, 118, 78, 0.15)",
    "--accent-primary-glow":   "rgba(212, 118, 78, 0.10)",

    "--status-success":     "#8FBC8F",
    "--status-success-bg":  "rgba(143, 188, 143, 0.12)",
    "--status-warning":     "#D4A95A",
    "--status-warning-bg":  "rgba(212, 169, 90, 0.12)",
    "--status-error":       "#D47B6A",
    "--status-error-bg":    "rgba(212, 123, 106, 0.12)",
    "--status-info":        "#7AACCF",
    "--status-info-bg":     "rgba(122, 172, 207, 0.12)",

    "--priority-p0": "#D47B6A",
    "--priority-p1": "#D4A95A",
    "--priority-p2": "#7EBF8E",

    "--border-subtle":  "rgba(255, 255, 255, 0.06)",
    "--border-light":   "rgba(255, 255, 255, 0.10)",
    "--border-medium":  "rgba(255, 255, 255, 0.15)",
    "--border-focus":   "#D4764E",
    "--border-primary": "#D4764E",

    // Mermaid
    "--mermaid-card-bg":        "#262320",
    "--mermaid-card-header":    "#2F2A26",
    "--mermaid-card-border":    "rgba(212, 118, 78, 0.26)",
    "--mermaid-stage-bg":       "#1F1B18",
    "--mermaid-stage-border":   "rgba(212, 118, 78, 0.20)",
    "--mermaid-node-fill":      "#6C4C3B",
    "--mermaid-node-text":      "#FFF6ED",
    "--mermaid-node-border":    "#E8956A",
    "--mermaid-cluster-fill":   "#3F3B36",
    "--mermaid-cluster-text":   "#F1E7DB",
    "--mermaid-cluster-border": "rgba(232, 149, 106, 0.42)",
    "--mermaid-line":           "#E8956A",
    "--mermaid-edge-label-bg":  "#353430",
    "--mermaid-font-family":    "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    // Mermaid pie chart — 哑光色板（暖棕黑风）
    "--mermaid-pie-1": "#b86840",  // 哑光赭橙（近 accent 低饱和版）
    "--mermaid-pie-2": "#3f9090",  // 青瓷
    "--mermaid-pie-3": "#b09040",  // 暖金
    "--mermaid-pie-4": "#806890",  // 烟紫
    "--mermaid-pie-5": "#4e9258",  // 鼠尾草绿
    "--mermaid-pie-6": "#a05870",  // 玫瑰棕
    "--mermaid-pie-7": "#4878a0",  // 铁蓝
    "--mermaid-pie-8": "#8a7840",  // 苔绿金

    "--radius-sm":   "8px",
    "--radius-md":   "12px",
    "--radius-lg":   "16px",
    "--radius-xl":   "20px",
    "--radius-pill":  "9999px",

    "--shadow-sm":   "0 1px 3px rgba(0, 0, 0, 0.2)",
    "--shadow-md":   "0 2px 8px rgba(0, 0, 0, 0.25)",
    "--shadow-lg":   "0 4px 16px rgba(0, 0, 0, 0.3)",
    "--shadow-glow": "none",

    // 字体: Inter (英文) + Noto Sans SC (中文) + SF Mono/JetBrains Mono (代码)
    "--font-sans":    "'Inter', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "--font-mono":    "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace",
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

    "--scrollbar-track":       "#2B2A27",
    "--scrollbar-thumb":       "#4A4944",
    "--scrollbar-thumb-hover": "#5A5955",

    "--selection-bg":   "rgba(212, 118, 78, 0.25)",
    "--selection-text":  "#E8E4DD",
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

export const defaultThemeId = "terminal";
export type ThemeId = keyof typeof allThemes;
