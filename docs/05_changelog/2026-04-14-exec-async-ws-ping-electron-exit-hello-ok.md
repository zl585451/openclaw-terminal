# 2026-04-14 Gateway 链路 Handoff（T1–T5）

## 摘要

- **T1**：`oct-gateway/tools/exec_command.js` 由 `execSync` 改为异步 `exec`（超时 30s、maxBuffer 2MB、stdout 截断 5000 字符），并标注 `riskLevel: 'guarded'`。
- **T2**：`oct-gateway/transport/ws.js` 握手成功后每 **25s** 服务端 `ws.ping()`，连接关闭时 `clearInterval`。
- **T3**：`oct-gateway/runtime/toolLoop.js` 记录每次工具成功/失败的 **`tool done` / 失败** 日志及耗时 `ms`。
- **T4**：`electron/main.ts` 用 `expectOctGatewayProcessExit` 区分主动结束子进程与非预期退出；非预期退出时 `suppressAutoReconnect`、`sendConnLog`、`gateway-status`（`processExit`、`exitCode`）；`start-gateway` / `gateway-restart` / `gateway-clear-port-and-start` 成功后重置 `suppressAutoReconnect` 并 `connectOpenClaw`（`start-gateway` 补充自动连接）。
- **T5**：`oct-gateway/task_queue.js` 新增 `getRunningTasks(sessionKey)`；`hello-ok` 增加 `pendingTasks`（可选 `connect.params.sessionKey`，默认 `main`）。

## 文档

- `docs/03_specs/WEBSOCKET_PROTOCOL.md`：`hello-ok`、`sessionKey`、`pendingTasks`、服务端 ping 说明。
- `docs/02_architecture/01-gateway.md`：Electron 子进程退出语义、exec 异步、WS ping。
- `docs/00_ai_entry/bug-triage.md`：新增「WebSocket 异常断开」排查节。

## 验收说明（2026-04-15）

- **WS 1006 / 长任务**：实测约 **10～20s** 的 `exec_command`（如 `ping -n 20`）期间连接可保持；日志中未见 `1006` / `client disconnected` 与长工具重叠。
- **边界**：`toolLoop` 对单工具仍有 **30s** `Promise.race` 上限；超过会报「工具 exec_command 超时」，属预期，**不等于** WS 断连。若需验收「单条 shell >30s 且成功」，须与 `oct-gateway/runtime/toolLoop.js` 超时或 `exec_command` 超时对齐后再测。
- **日常**：修复以日常调研与多工具场景为主，后续以实际使用观察为主即可。
