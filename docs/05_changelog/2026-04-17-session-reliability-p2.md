# 2026-04-17 会话可靠性整改 P2（turnId + 工具超时配置化 + 静默吞错治理）

## 变更目标

- 建立回合级 `turnId`，降低前后端联调与排障成本。
- 工具执行超时从固定 30s 升级为按工具元数据配置。
- 清理网关主路径静默吞错（关键 catch 路径补结构化日志）。

## 代码变更

- [oct-gateway/index.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/index.js)
  - `handleChatRequest` 生成并透传 `turnId`。
  - `chat done/error` payload 增加 `turnId`。
  - 主路径 `.catch(() => {})` 改为 `log.warn`（非致命路径）。

- [oct-gateway/runtime/chatEngine.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/chatEngine.js)
  - 透传 `turnId` 到 `streamChat`。
  - `onDone` 返回 `turnId`。
  - 错误日志带 `turnId`。

- [oct-gateway/ai.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/ai.js)
  - `streamChat` 支持 `turnId` 入参并写入关键日志。
  - 工具链递归调用继续携带 `turnId`。

- [oct-gateway/runtime/toolLoop.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/toolLoop.js)
  - 工具调用日志统一带 `turnId`。
  - 工具超时改为读取 `toolLoader.getToolMeta(name).timeoutMs`。
  - `resultPreview` 增加不可序列化保护，避免 JSON stringify 抛错中断。

- [oct-gateway/tool_loader.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/tool_loader.js)
  - 新增工具元数据索引与 `getToolMeta()`。
  - 支持每个工具声明 `timeoutMs`（1s~10min 夹紧）。

- 工具超时示例
  - [web_search.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/tools/web_search.js): `timeoutMs: 45000`
  - [web_fetch.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/tools/web_fetch.js): `timeoutMs: 45000`
  - [exec_command.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/tools/exec_command.js): `timeoutMs: 60000`

## 文档同步

- [docs/03_specs/WEBSOCKET_PROTOCOL.md](/e:/windows-window/OpenClaw-Terminal/docs/03_specs/WEBSOCKET_PROTOCOL.md)
  - 增补 `chat done payload.turnId` 说明。

- [docs/02_architecture/09-tools.md](/e:/windows-window/OpenClaw-Terminal/docs/02_architecture/09-tools.md)
  - 补充按工具超时元数据策略。
