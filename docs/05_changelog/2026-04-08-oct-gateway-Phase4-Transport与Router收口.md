# 2026-04-08 oct-gateway Phase 4：Transport 落地 + Router 全量收口

## 摘要

- **Router：** `MessageRouter` 注入 `chatHandler: handleChatRequest`；`USE_NEW_ROUTER=1` 时 Slash、`sessions.list`、普通 `chat.send` 统一经 Router，不再依赖 legacy `chat.send` 大块才能完成主聊天流程。
- **共享处理：** `handleChatRequest(request, connection)` 抽象连接上的 orchestrator、上下文、`USE_NEW_CHAT_ENGINE` / `streamChat`、工具事件与 Canvas 推送（`sendCanvasTransportEvent`）。
- **Transport：** 新增 `transport/ws.js`、`transport/http.js`、`transport/protocol.js`；`USE_NEW_TRANSPORT=1` 时由 `WsTransport` / `HttpTransport` 接管监听与生命周期，经 `handleTransportMessage` / `handleTransportHttpRequest` 复用既有业务；`tools.setOnTaskBoardUpdate` 使用 `wsTransport.broadcast`；**未开 flag 时 legacy `wss` / `httpServer` 仍为 fallback**。
- **协议：** JSON 消息形态与既有前端约定一致（`protocol` 为 parse/stringify 薄封装）。

## 影响范围

- 仅 `oct-gateway/`；默认不开启 `refactorFlags` / 环境变量时行为与旧路径一致。

## 验证（2026-04-08 复核）

- `node --check`：`index.js`、`gateway/router.js`、`transport/ws.js`、`transport/http.js`、`transport/protocol.js`、`ai.js`、`runtime/*.js`
- `npx vitest run`：64 tests 通过
- `npx tsc --noEmit`：通过

**说明：** 端到端联调（多 flag 组合、并发、Mobile、MCP）由集成环境补做。

## 文档

- `docs/03_migration/oct-gateway-refactor-execution.md`：Phase 4 检查清单与验收记录
- `docs/03_migration/oct-gateway-refactor-plan.md`：状态行
- `docs/03_migration/migration-status.md`：Gateway 轨道表
