# 2026-04-21 主题 Token 收口与 LEGACY_VAR_MAP 下线

## 背景

新主题系统已经由 `ThemeProvider` 负责注入 `:root` 变量，但仓库内仍残留多处旧 token 直接引用，例如：

- `--accent-color`
- `--bg-primary`
- `--border-color`
- `--accent`
- `--green`
- `--glow-color`

这些旧 token 依赖 `LEGACY_VAR_MAP` 在运行时兜底，导致主题系统仍处于“新旧并存”状态，难以继续重构。

## 本次调整

### 1. 删除运行时旧变量兼容层

- 移除 `src/themes/ThemeProvider.tsx` 中的 `LEGACY_VAR_MAP`
- 停止在主题注入时同步写入旧变量名

### 2. 清理源码中的旧 token 直接引用

已将活跃样式引用切换到新 token，包括但不限于：

- `--accent-color` → `--accent-primary`
- `--bg-primary` → `--bg-base`
- `--bg-secondary` → `--bg-panel`
- `--border-color` → `--border-light`
- `--accent` / `--green` → `--accent-primary`
- `--glow-color` → `--accent-primary-glow`

覆盖文件包括：

- `src/styles/App.css`
- `src/styles/TaskBoard.css`
- `src/styles/TabBar.css`
- `src/styles/ChatTab.css`
- `src/styles/ActivityPanel.css`
- `src/styles/SoundTab.css`
- `src/ui/onboarding/onboarding.css`
- `src/ui/chat/MessageList.tsx`
- `src/ui/chat/markdownComponents.tsx`
- `src/ui/chat/ChatTab.v2.tsx`
- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/components/VaultPanel.tsx`

### 3. 清理旧设置链路中的主题变量注入

- `src/contexts/SettingsContext.tsx` 不再维护旧主题变量预设
- 移除旧 `ThemeVars`、`THEME_PRESETS`、`normalizeTheme`、`applyThemeVars` 等遗留逻辑
- 设置上下文继续负责通用 UI 偏好，但不再参与主题 CSS 变量写入

## 收益

- 前端主题来源收敛到单一入口，排查样式问题更直接
- 新增页面和组件时不需要再记忆旧 token 别名
- 之后如果继续推进 Tailwind 或设计 token 统一，阻力会小很多

## 验证

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`

## 注意

- 仓库中仍存在 `src/styles/global.css.bak-20260318-1638` 这样的历史备份文件，里面可能还会出现旧 token；它不参与当前构建
