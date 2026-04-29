## 变更

- 抽离 `useMessages` 中的 token/usage 统计与 RAF flush 逻辑为独立 hook：`src/hooks/useTokenUsage.ts`
- `useMessages` 改为通过 `useTokenUsage` 提供的 `onUsage/resetUsage` 与 usage 状态，且在 `sendMessage/quickSend` 开始时统一重置用量统计

## 验证

- `npx tsc --noEmit` 通过

