# 2026-04-17 验收回归报告（session-reliability-p2）

- 验收窗口：`session-reliability-p2`
- 仓库：`e:\windows-window\OpenClaw-Terminal`
- 分支：`feature/canvas-document-p0`
- 基线提交：`dbcd732`
- 基线标签：`checkpoint-2026-04-17-session-reliability-p2`
- 验收日期：2026-04-17

## 1. 基线一致性检查

- `git rev-parse --short HEAD` => `dbcd732`
- `git tag --list checkpoint-2026-04-17-session-reliability-p2` => 命中
- `git status -sb` => 工作区干净（仅 `ahead 7`，无未提交改动）

结论：本轮验收确实基于指定基线执行。

## 2. 回归执行项与结果

| 项目 | 命令 | 结果 |
|---|---|---|
| 前端类型检查 | `npx tsc --noEmit` | 通过 |
| Electron 类型检查 | `npx tsc -p tsconfig.electron.json --noEmit` | 通过 |
| 单元测试 | `npx vitest run` | 通过（6 files / 67 tests） |
| 生产构建 | `npm run build` | 通过（Vite + Electron tsc） |

说明：构建阶段出现 chunk size warning（历史已知，不阻断本次验收）。

## 3. P0/P1/P2 关键锚点核验（代码路径）

### P0：执行契约 + 能力可见化 + 超时兜底

- 执行契约文案防幻觉：`rewriteUnverifiedToolClaims` 与承诺用语匹配规则存在。
  - `oct-gateway/ai.js:835`
  - `oct-gateway/ai.js:840`
  - `oct-gateway/ai.js:857`
- `finish_reason=tool_calls` 但无调用数据时明确报错，不再静默收尾。
  - `oct-gateway/ai.js:1276`
  - `oct-gateway/ai.js:1279`
- 握手/状态透传 gateway capabilities。
  - `oct-gateway/transport/ws.js:158`
  - `electron/main.ts:1357`
  - `src/hooks/useWebSocket.ts:220`
- 前端整轮超时兜底（10 分钟）存在。
  - `src/hooks/useMessages.ts:478`

### P1：能力三态 + 自定义模型工具开关

- 三态字段 `toolsSupport` / `capabilitySource` 全链路存在。
  - `oct-gateway/config.js:391`
  - `oct-gateway/index.js:184`
  - `src/hooks/useMessages.ts:105`
  - `src/ui/chat/ChatTab.v2.tsx:655`
- 自定义模型工具开关 `CUSTOM_MODEL_SUPPORTS_TOOLS` 存在。
  - `oct-gateway/config.js:761`

### P2：turnId + 工具超时配置化 + 主链路观测增强

- 回合级 `turnId` 生成与 done/error 回传存在。
  - `oct-gateway/index.js:229`
  - `oct-gateway/index.js:335`
  - `oct-gateway/runtime/chatEngine.js:28`
- 工具超时读取元数据 `getToolMeta().timeoutMs`。
  - `oct-gateway/runtime/toolLoop.js:67`
  - `oct-gateway/tool_loader.js:60`
  - `oct-gateway/tool_loader.js:148`
- 工具级超时元数据示例已声明。
  - `oct-gateway/tools/web_search.js`
  - `oct-gateway/tools/web_fetch.js`
  - `oct-gateway/tools/exec_command.js`

## 4. 验收结论

本基线（`dbcd732`）下，P0/P1/P2 的核心整改在“可编译、可测试、可构建”维度均通过，关键结构锚点均可在代码中定位，判定为：

- **验收通过（工程回归）**

## 5. 未覆盖项（本轮限制）

- 未执行真实 GUI 人工回归（ActivityPanel 交互、长等待可视反馈）。
- 未执行真实多供应商在线联调（受 API key/网络环境约束）。
- 未执行跨窗口分支合并冲突演练（需指定另一窗口分支后执行）。

## 6. 建议下一步

1. 用 2~3 个真实慢模型做在线 smoke（至少覆盖：有工具/无工具/工具未知三态）。
2. 若另一个窗口已有大改，先在独立分支做合并预演，再复跑本报告 4 条回归命令。
3. 通过后打发布前标签（例如 `checkpoint-2026-04-17-post-merge-regression`）。
