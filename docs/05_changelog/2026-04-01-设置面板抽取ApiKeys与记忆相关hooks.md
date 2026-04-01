# 2026-04-01 设置面板抽取 ApiKeys / Nocturne / AI.library hooks

## 变更

- **`useApiKeys`**（`src/hooks/settings/useApiKeys.ts`）：集中 API Key / Provider 列表加载、`searchKeysRef`、显隐 Key、`testConnection` 状态、`saveGatewayAndReconnect`、`refetchApiKeys`，以及 `currentProviderId` / `currentProvider`（`useMemo`）。与原先 `SettingsPanel` 行为对齐，**不**内置「应用」全局面板的 `applyStatus`；全量保存仍在 `SettingsPanel.apply()`。
- **`useNocturneMemory`**（`src/hooks/settings/useNocturneMemory.ts`）：替换原先与真实 IPC 不符的占位实现；承载 Nocturne 与记忆 Tab 相关 state，并提供 `refreshNocturneDetail` 供轮询。
- **`useAiLibrary`**（`src/hooks/settings/useAiLibrary.ts`）：与面板一致的首屏加载；暴露 `setAiLibStatus`；提供 `refreshAiLibraryStatus`；去掉无 electron 时伪造 status 的分支（与面板一致保持 `null`）。
- **`SettingsPanel`**：组合上述三个 hook；记忆 Tab **5 秒**轮询改为调用 `refreshNocturneDetail` + `refreshAiLibraryStatus`。

## 验证

- `npx tsc --noEmit`、`npm test`
