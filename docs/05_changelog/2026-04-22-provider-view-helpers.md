# 2026-04-22：设置页 provider 展示辅助抽取

## 摘要

新增 `src/ui/settings/providerViewHelpers.ts`，集中主对话 API Key 的字段名映射、当前值读取与显隐判断；`ConnectionTabView.tsx` 与 `ConnectionTabView.Beginner.tsx` 改为调用上述辅助函数。未改动 `saveGatewayAndReconnect`、`testAIConnection` 及网关数据流。

## 涉及文件

- `src/ui/settings/providerViewHelpers.ts`（新增）
- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/ui/settings/tabs/ConnectionTabView.Beginner.tsx`
