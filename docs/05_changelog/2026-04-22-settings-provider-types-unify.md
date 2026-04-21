# 2026-04-22：设置面板 provider 类型单一来源

## 摘要

新增 `src/ui/settings/providerTypes.ts`，集中定义 `ProviderModelOption`、`ProviderEntry`、`ProvidersState`。`useApiKeys.ts` 与 `ConnectionTabView.tsx` 改为从该模块（及 `ApiKeysState`）引用类型；`SettingsApiKeysState` 改为 `ApiKeysState` 的类型别名，避免与网关密钥状态重复定义。无运行时行为变化。

## 涉及文件

- `src/ui/settings/providerTypes.ts`（新增）
- `src/hooks/settings/useApiKeys.ts`
- `src/ui/settings/tabs/ConnectionTabView.tsx`

## 备注

- `useApiKeys` 依赖 `src/ui/settings/providerTypes.ts`（任务允许的路径）；若后续希望 hooks 完全不依赖 `ui/`，可将同类类型迁至 `src/types/` 等中立目录后再改导入。
