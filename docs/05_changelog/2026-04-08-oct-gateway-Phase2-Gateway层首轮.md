# 2026-04-08 oct-gateway Phase 2：Gateway 层首轮落地

## 摘要

- 新增 `oct-gateway/gateway/router.js`（`MessageRouter`）：在 `config.REFACTOR_FLAGS.USE_NEW_ROUTER` 为真时优先处理 WebSocket `req`；覆盖 `chat.send` 中的 Slash 前缀、`sessions.list`、未知 method 错误响应；非 Slash 且未配置 `chatHandler` 时返回未处理，回落 `index.js` 既有聊天主链。
- 新增 `oct-gateway/gateway/slash.js`（`SlashHandler`）：承接 `/new` `/reset` `/status` `/model` `/provider` `/help`，其余命令委托既有 `handleSlashCommand`。
- `oct-gateway/config.js`：新增 `REFACTOR_FLAGS`（`OCT_USE_NEW_ROUTER` / `config.json` 的 `refactorFlags` 可开启；另含 ChatEngine、Transport 占位开关）。
- **修复**：`index.js` 中须先定义 `systemPromptReady` 再构造 `SlashHandler`，否则启动时报 `ReferenceError`（访问暂存死区）。

## 影响范围

- 仅 `oct-gateway/`；默认未开 `USE_NEW_ROUTER` 时行为与旧路径一致。

## 验证（2026-04-08）

- `node --check`：`index.js`、`gateway/router.js`、`gateway/slash.js` 通过
- `npx vitest run`：64 tests 通过
- `npx tsc --noEmit`：通过

## 文档

- `docs/03_migration/oct-gateway-refactor-execution.md`：Phase 2 检查清单与验收记录更新
- `docs/03_migration/oct-gateway-refactor-plan.md`：状态行更新
- `docs/03_migration/migration-status.md`：Gateway 轨道表与变更日志表更新
