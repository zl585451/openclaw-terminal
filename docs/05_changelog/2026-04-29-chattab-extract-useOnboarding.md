# 2026-04-29 — ChatTab Task3：`useOnboarding`

## 变更摘要

- 从 `ChatTab.v2.tsx` 抽出 `onboardingDismissed`、`dismissOnboarding` 及 `oct.onboarding.dismissed` 读写至 `src/hooks/useOnboarding.ts`。
- 开发态「欢迎页」重置所需的 `localStorage.removeItem` + 状态复位合并为 `resetOnboardingForDev`，避免在 ChatTab 内保留对已迁移 state 的 setter 依赖。

## 对外行为

- `WelcomeHero` props、localStorage key、空会话时是否显示欢迎页逻辑不变。
- `localStorage` key 仍为 `oct.onboarding.dismissed`，取值语义未变（`'1'` 表示已关闭引导）。
- 回归结论：跳过引导、卡片动作 dismiss、DEV 欢迎页重置路径与重构前一致。

## 相关文档

- `docs/02_architecture/HOOKS_MAP.md` — 新增 `useOnboarding` 条目。
