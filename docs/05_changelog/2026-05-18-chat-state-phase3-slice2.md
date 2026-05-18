# 2026-05-18 Chat State Phase 3 Slice 2

## What Changed

- 继续拆 `src/hooks/useMessages.ts`
- 新增 `src/hooks/useMessages.gateway.ts`
- 把 `useWebSocket` 事件绑定从 `useMessages` 主 hook 迁出：
- `chat delta`
- `chat done`
- `agent phase`
- `tool event`
- `keepalive`
- `usage`
- `workbench event`
- 新增 `parseSystemReplyStatus`，把 `🦞` 系统状态回复的文本解析收口到 helper

## Outcome

- `useMessages` 不再直接承接整块 WebSocket 事件处理
- transport binding 与纯消息变换开始分层
- `useMessages.gateway` 负责网关事件到 UI 状态的映射，`useMessages.helpers` 负责纯状态变换

## Verification

- `npx vitest run src/hooks/__tests__/useMessages.test.ts`
- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`

## Notes

- 本切片之后继续完成了 `useMessages.runtime.ts` 拆分
- `Phase 3` 已在后续收口为 completed
