# 2026-04-29 — ChatTab 第二轮拆分 Task 2

## 变更

- 新增 `src/hooks/useCapabilityActions.ts`：承载欢迎卡/能力栏相关的 8 段回调（原 `ChatTab.v2.tsx` 内 `useCallback`），通过选项对象注入 `sendMessage` / `quickSend`、`openImageStudio`、`markPendingPromptOptimization`、`dismissOnboarding`、`onSwitchTab`、输入注入与能力抽屉目标 state setter。
- `ChatTab.v2.tsx` 在 `useMessages` 之后调用 `useCapabilityActions`，删除内联的上述逻辑；未改动 `useImageStudio` / `useOnboarding` / `useMessages` 本体实现。

## 验证

- `npx tsc --noEmit`：通过。
