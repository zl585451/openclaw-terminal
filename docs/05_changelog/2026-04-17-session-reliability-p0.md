# 2026-04-17 会话可靠性整改 P0（执行契约 + 能力可见化 + 超时兜底）

## 变更目标

- 修补“模型口头承诺执行工具但无真实 tool_call 证据”的信任缺口。
- 在连接握手阶段显式透出网关能力，前端可见“支持/不支持工具执行”。
- 为前端会话增加整轮超时兜底，避免长期 awaitingResponse 卡死。

## 代码变更

- [oct-gateway/ai.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/ai.js)
  - 新增执行契约守卫：当本轮无工具执行证据且文本出现“调用工具/联网查询”叙事时，自动改写为可验证表述。
  - 增加异常出口：`finish_reason === 'tool_calls'` 但未解析出有效 `tool_calls` 时，走明确 `onError`，不再静默收尾。

- [oct-gateway/transport/ws.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/transport/ws.js)
  - `hello-ok` 响应新增 `capabilities` 字段。

- [oct-gateway/index.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/index.js)
  - 新增 `getGatewayCapabilities()`：下发 `supportsTools` / `supportsStreamOptions` / `mcpReady` / MCP 连接数量。

- [electron/main.ts](/e:/windows-window/OpenClaw-Terminal/electron/main.ts)
  - 透传并缓存 `hello-ok.capabilities`。
  - `openclaw-status` IPC 返回能力快照，供前端首屏恢复。

- [src/hooks/useWebSocket.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useWebSocket.ts)
  - 新增 `onGatewayCapabilities` 回调。
  - 初始化与状态事件均支持能力信息透传。

- [src/hooks/useMessages.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useMessages.ts)
  - 新增 `gatewayCapabilities` 状态。
  - 新增整轮超时兜底（默认 10 分钟）：超时后自动结束当前轮次、恢复可输入、插入系统提示。

- [src/ui/chat/ChatTab.v2.tsx](/e:/windows-window/OpenClaw-Terminal/src/ui/chat/ChatTab.v2.tsx)
  - 顶部连接状态区新增 `NO TOOL EXEC` 提示（当前模型不支持工具执行时显示）。

## 文档同步

- [docs/03_specs/WEBSOCKET_PROTOCOL.md](/e:/windows-window/OpenClaw-Terminal/docs/03_specs/WEBSOCKET_PROTOCOL.md)
  - 更新 `hello-ok.capabilities` 字段与 `keepalive` 事件说明。

- [docs/02_architecture/gateway-websocket.md](/e:/windows-window/OpenClaw-Terminal/docs/02_architecture/gateway-websocket.md)
  - 补充握手能力下发与 keepalive 阶段事件。

- [docs/00_ai_entry/chat-stream-entry.md](/e:/windows-window/OpenClaw-Terminal/docs/00_ai_entry/chat-stream-entry.md)
  - 补充能力透传与整轮超时兜底入口说明。

- [docs/01_system_prompts/OCT_PROTOCOL.md](/e:/windows-window/OpenClaw-Terminal/docs/01_system_prompts/OCT_PROTOCOL.md)
  - 新增“承诺可验证”规则。
