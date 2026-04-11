# 2026-04-12 Workbench Foundation Phase 4

## 本阶段主题

协议与命名收口：把系统内部主语义从 `canvas` 切换到 `workbench`，同时保留兼容别名，避免硬切导致旧链路回归。

## 代码变更

### 前端

- [src/hooks/useWebSocket.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useWebSocket.ts)
  - `onWorkbenchEvent` 成为主回调
  - `onCanvasEvent` 改为可选兼容回调
  - `send()` 现在优先发送 `workbenchContext`，并继续附带 `canvasContext` 兼容别名

- [src/hooks/useMessages.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useMessages.ts)
  - 对话层改为通过 `onWorkbenchEvent` 接收工作台事件
  - `sendMessage()` 的上下文参数主语义改为 `workbenchContext`

### Electron

- [electron/main.ts](/e:/windows-window/OpenClaw-Terminal/electron/main.ts)
  - `openclaw-send` 现在优先读取 `workbenchContext`
  - 发往 gateway 的 `chat.send.params` 同时写入：
    - `workbenchContext`
    - `canvasContext`（兼容）

### Gateway

- [oct-gateway/index.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/index.js)
  - `handleChatRequest()` 优先读取 `workbenchContext`
  - transport 侧现在可以正确发送 `event: "workbench"`

- [oct-gateway/runtime/contextBuilder.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/contextBuilder.js)
  - roundtrip 上下文主入参切为 `workbenchContext`

- [oct-gateway/runtime/toolLoop.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/toolLoop.js)
  - 优先透传 `workbenchEvent`
  - 只有在缺少 `workbenchEvent` 时才回退 `canvasEvent`
  - 避免未来双路都打开时重复创建文档

- [oct-gateway/transport/helpers.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/transport/helpers.js)
  - transport helper 支持发送 `event: "workbench"` 或 `event: "canvas"`

## 文档同步

- [docs/03_specs/WORKBENCH_EVENT_COMPAT.md](/e:/windows-window/OpenClaw-Terminal/docs/03_specs/WORKBENCH_EVENT_COMPAT.md)
- [docs/03_specs/WEBSOCKET_PROTOCOL.md](/e:/windows-window/OpenClaw-Terminal/docs/03_specs/WEBSOCKET_PROTOCOL.md)
- [docs/00_ai_entry/chat-stream-entry.md](/e:/windows-window/OpenClaw-Terminal/docs/00_ai_entry/chat-stream-entry.md)

## 阶段结论

到这一阶段为止，Workbench 基础拆分计划的核心目标已经完成：

- 状态层已独立
- 聊天桥已解耦
- 插件主入口已迁移
- 多类型 artifact 渲染容错已补齐
- 协议和上下文主语义已切到 `workbench`

旧 `canvas` 入口仍然保留，但已经退成兼容层，不应再继续承载新职责。
