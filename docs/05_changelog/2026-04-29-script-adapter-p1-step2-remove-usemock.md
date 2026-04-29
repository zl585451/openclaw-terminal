# 2026-04-29 Script Adapter P1 Step 2 Remove useMock

## 变更

1. 删除 `gatewayExecution.ts` 中误导性的 `useMock: true` 硬编码。
2. 同步移除 `src/types/electronAPI.ts` 中未再使用的 `useMock` 字段声明。

## 验证

1. `npx tsc --noEmit`
2. `node --check oct-gateway/index.js`
3. `rg -n "useMock" src -S`
