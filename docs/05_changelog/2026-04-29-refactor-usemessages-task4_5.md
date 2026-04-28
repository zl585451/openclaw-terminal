## 变更

- `useTokenUsage` 新增 `setFromSystemReply({ tokenIn, ctxUsed, ctxMax })`，用于封装系统回复解析阶段的 token/context 写入
- `useTokenUsage` 不再对外暴露 `setTokenIn/setCtxUsed/setCtxMax`，避免内部 setter 泄漏
- `useMessages` 改为调用 `setFromSystemReply(...)`，保持对外 return 字段不变

## 验证

- `npx tsc --noEmit` 通过

