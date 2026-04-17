# 2026-04-17 turnId 归属链路补全（Gateway → Electron → Frontend）

## 背景

在慢模型/工具调用场景中，存在“上一轮或并发轮次的 done 事件误结束当前会话”的风险，表现为前端提前回到 idle、聊天窗口看起来像“断开”。

## 本次改动

1. Gateway `chat delta` 事件补齐 `turnId`
2. Electron 主进程转发 `chat/agent` 消息时透传 `turnId`
3. 前端 `useWebSocket` 解析并向上抛出 `turnId`
4. 前端 `useMessages` 对 `onChatDelta/onChatDone` 增加 `turnId` 归属校验：
   - 若事件 `turnId` 与 `lastSentRequestId` 不一致，直接忽略
5. 前端发送时将 `newRequestId` 透传到 IPC `openclaw-send`
6. Electron `sendChatMessage` 优先使用前端传入 `requestId` 作为 `chat.send.id`

## 协议文档同步

- `docs/03_specs/WEBSOCKET_PROTOCOL.md`
  - 明确 `chat.send.id` 建议使用前端 requestId 透传
  - 明确 `chat delta/done` 的 `turnId` 用于回合归属
- `docs/03_specs/ELECTRON_IPC_CHANNELS.md`
  - 更新 `openclaw-send` 参数定义，补充 `requestId`

## 验证

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npx vitest run`（6 files / 67 tests passed）

