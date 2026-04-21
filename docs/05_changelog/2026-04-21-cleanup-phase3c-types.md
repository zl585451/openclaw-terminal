# 2026-04-21 阶段 3C electronAPI 类型收口

## 背景

阶段 3C 目标是收口扫描报告第 5 节中 any 使用最密集的三个前端文件，重点处理直接调用 `(window as any).electronAPI` 的路径。

## 调整

- 新增 `src/types/electronAPI.ts`，集中维护 3C 涉及的 preload API 类型。
- 新增 `src/types/gateway.ts`，定义 GatewayEvent、usage、tool、状态与发送 payload 类型。
- `src/vite-env.d.ts` 改为引用集中类型定义，不再内联宽泛的全局 ElectronAPI。
- `src/hooks/useWebSocket.ts`、`src/components/SettingsPanel.tsx`、`src/ui/settings/tabs/MemoryTabView.tsx` 完成主要 any 收口。

## 验证

- `npx tsc --noEmit` 通过。
- `npx tsc -p tsconfig.electron.json --noEmit` 通过。
- `npx vitest run` 通过，7 个测试文件、79 个用例。
- `npm run build` 通过，仅保留 Vite CJS API deprecated 与 chunk size 既有警告。
