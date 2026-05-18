# 2026-05-18 Chat State Phase 3 Slice 1

## What Changed

- Phase 3 开始拆 `src/hooks/useMessages.ts`
- 新增 `src/hooks/useMessages.helpers.ts`
- 把以下纯状态变换从 `useMessages` 内联逻辑迁出：
- 系统命令识别
- 流式收尾文本清洗
- streaming assistant 消息收口
- chat done 消息写回
- tool call / tool result 到消息卡片与 activeTools 的同步

## Outcome

- `useMessages` 更接近组合层
- 消息数组和工具状态更新逻辑可以脱离 Hook 单独测试
- Phase 3 先从低风险 helper 抽离开始，暂未改 transport event binding

## Verification

- `npx vitest run src/hooks/__tests__/useMessages.test.ts`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`

## Notes

- 本切片没有改 WebSocket 协议和发送 payload
- 下一步继续拆 `useMessages` 的 transport binding 或 streaming lifecycle
