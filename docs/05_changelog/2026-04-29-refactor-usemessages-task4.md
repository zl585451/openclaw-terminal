## 变更

- 在 `src/hooks/useMessages.ts` 内部新增私有函数 `_sendMessageCore(options)`，用于合并 `sendMessage` 与 `quickSend` 的重复发送流程
- `sendMessage/quickSend` 对外签名与权限校验逻辑保持不变，仅在校验通过后复用 `_sendMessageCore`

## 验证

- `npx tsc --noEmit` 通过

