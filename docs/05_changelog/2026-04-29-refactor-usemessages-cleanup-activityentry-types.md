## 变更

- `src/hooks/useMessages.ts` 删除重复的 `ActivityEntry/ActivityEntryType` 类型定义
- 统一从 `src/hooks/useActivityTimeline.ts` 复用并在 `useMessages.ts` 中 re-export 对外导出

## 验证

- `npx tsc --noEmit` 通过

