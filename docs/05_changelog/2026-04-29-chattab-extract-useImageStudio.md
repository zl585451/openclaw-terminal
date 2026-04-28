# 2026-04-29 — ChatTab Task2：`useImageStudio`

## 变更摘要

- 从 `ChatTab.v2.tsx` 抽出 ImageStudio 相关状态与逻辑至 `src/hooks/useImageStudio.ts`。
- 将 `extractOptimizedImagePrompt` 下沉至 `src/utils/extractOptimizedImagePrompt.ts`，供 hook 使用并避免 `ChatTab` 内联与 hook 之间的重复；与 Task1 中 `stripMarkdown` 抽出动机一致（hooks ↔ UI 单向、无循环依赖）。

## 对外行为

- `ImageStudio` 的 props（`initialPrompt`、`onClose`、`registerPromptInjector`、`onSendToChat` 等）与父组件对 `ChatTab` 的调用方式不变。
- 欢迎页 / 能力条打开生图工作台、🎨 切换、AMY 优化提示词回流注入行为与原先一致。

## 相关文档

- `docs/02_architecture/HOOKS_MAP.md` — 新增 `useImageStudio` 条目。
- `docs/_archive/refactor-chattab-2026-04/EXECUTION_PLAN.md` — Task1 背景句与实现口径对齐（`playTTSForMessage`）。

## 回归结论

欢迎页 / 能力条 / 🎨 触发路径行为一致（与 Task 2 验收简报口径对齐）。
