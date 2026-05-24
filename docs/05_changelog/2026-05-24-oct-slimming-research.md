# 2026-05-24 OCT 瘦身审计报告 (Phase C-0)

## 概要

本次接管后继续推进 OCT 瘦身计划，范围按计划分两步推进：

1. **Phase C-0 测试补强**：先锁定 gateway 分流、WS 协议、slash、真实启动 smoke、前端设置 payload。
2. **Phase C-1 小步入口瘦身**：只抽离可单测的启动/配置/协议分发 glue，不删除 legacy，不移动 chat/provider/toolLoop 核心业务逻辑。

## 审计结论更新

1. **Gateway 入口仍需收口**：`oct-gateway/index.js` 同时装配 router、transport、runtime、tool loader、orchestrator 等对象，后续应收敛为启动与依赖注入层。
2. **配置权威改为三层边界**：
   - Electron userData `config.json`：用户设置持久化权威。
   - `oct-gateway/config.js` / `getProviderConfig()`：运行时解析权威。
   - 前端设置页：展示、提交、触发重连，不应维护 provider registry 权威。
3. **OmniRoute 分层措辞修正**：
   - `omniRoute.js` 是逻辑能力别名与边界层。
   - `externalOmniRoute.js` 是外部 OmniRoute 适配层。
   - 二者不能直接定性为重复实现。
4. **能力拆解保持拆包方向**：
   - `oct-gateway/tools/`：通用工具执行层。
   - `oct-gateway/script_adapter/`：专用内容生产/工作流 Agent。
   - 二者不建议合并，后续应可选化/懒加载。

## Phase C-0 新增测试

新增：

- `oct-gateway/test/messageRouterRegression.test.js`
  - 覆盖 `chat.send` 普通聊天分流。
  - 覆盖 slash 命令分流前的 abort/idle 清理。
  - 覆盖 `sessions.list` 与未知 method 响应。
  - 覆盖 `tool` event payload 经 `transport/protocol.js` serialize/parse 后不变。

- `oct-gateway/test/wsTransportAuth.test.js`
  - 覆盖 WebSocket challenge。
  - 覆盖未认证请求拒绝。
  - 覆盖错误 token 拒绝。
  - 覆盖认证成功 hello-ok payload。
  - 覆盖认证后消息派发与 close 回调。

- `oct-gateway/test/slashHandlerRegression.test.js`
  - 覆盖 `/help` 系统命令回复。
  - 覆盖未知命令错误回复。
  - 覆盖 `/status` 状态摘要。
  - 覆盖 `/model` 列表与模型切换。
  - 覆盖 `/provider` 列表与 provider 切换。
  - 覆盖 `/think high` 写入会话思考模式。
  - 覆盖 `/cot` 状态查询。

- `oct-gateway/test/gatewaySmoke.test.js`
  - 使用临时 `OCT_CONFIG_FILE` 和临时端口启动真实 gateway 子进程。
  - 验证 WS challenge、认证 connect、`sessions.list`、`/help` 可用。
  - 不调用真实 AI。

- `src/hooks/__tests__/settingsPayload.test.ts`
  - 覆盖前端设置 payload 构造边界。
  - 验证 OmniRoute 设置字段能保存到 payload。
  - 验证 NewAPI 自定义模型与 Google scoped baseUrl 不污染其他 provider baseUrl 字段。

## Phase C-1 最小入口拆分

新增：

- `oct-gateway/bootstrap/transports.js`
  - 从 `oct-gateway/index.js` 抽出 WS/HTTP transport 启动胶水。
  - 保留原有端口规则：HTTP 端口仍为 WS 端口 + 1。
  - 保留原有 `modelProvider`、`capabilityProvider`、认证、连接订阅、关闭回调注入。
  - 不改业务路由、不改 legacy fallback、不改 chat/runtime/provider 行为。

- `oct-gateway/test/bootstrapTransports.test.js`
  - 用 fake WS/HTTP transport 验证 helper 注入与关闭语义。

- `oct-gateway/runtime/gatewayCapabilities.js`
  - 从 `oct-gateway/index.js` 抽出 gateway capability snapshot 生成逻辑。
  - 保留 providerRouter 与 MCP 状态读取行为。
  - 失败时仍返回保守默认值并记录 warn。

- `oct-gateway/test/gatewayCapabilities.test.js`
  - 覆盖 capability 组装与 provider/MCP 失败 fallback。

- `oct-gateway/bootstrap/lifecycle.js`
  - 从 `oct-gateway/index.js` 抽出 shutdown signal 注册与 `task-board-update` broadcast 注册。
  - 只处理启动/关闭副作用，不改变 task board 事件形状。

- `oct-gateway/test/bootstrapLifecycle.test.js`
  - 覆盖 task board broadcast 注册、SIGINT/SIGTERM 关闭流程、cleanup 解绑。

- `oct-gateway/runtime/imageGenerationConfig.js`
  - 从 `image.generate` 分支抽出图片配置投影逻辑。
  - 保留 minimax/openai/siliconflow/google 的 baseUrl/model 默认值和 key 透传字段。

- `oct-gateway/test/imageGenerationConfig.test.js`
  - 覆盖默认 minimax、各 provider 默认值、显式 baseUrl/model/key 优先级。

- `oct-gateway/script_adapter/messageHandler.js`
  - 从 `oct-gateway/index.js` 抽出 `scriptAdapter.*` 消息分发。
  - 将内容生产工作流的协议入口收口到 `script_adapter/` 目录，便于后续可选化/懒加载。

- `oct-gateway/test/scriptAdapterMessageHandler.test.js`
  - 覆盖 intake start、run start、batch subscribe、未知 `scriptAdapter.*` 与非 scriptAdapter 方法 fallthrough。

- `electron/config/apiKeys.ts`
  - 从 `electron/main.ts` 抽出 `get-api-keys` 的读取投影 helper 与 `save-api-keys` 的配置持久化 helper。
  - 集中处理 env 解析、config 优先级、图片 provider 投影、字段写入、boolean 规范化、OmniRoute 单模型保存时清理旧 `OMNIROUTE_CHAT_MODEL` / `OMNIROUTE_PLAN_MODEL` / `OMNIROUTE_TOOL_MODEL`、Gateway 重启/重连判定。
  - `electron/main.ts` 保留 IPC 编排、文件读写、Gateway 重启与重连副作用。

- `electron/config/apiKeys.test.ts`
  - 覆盖 Electron 设置读取/持久化边界：env 解析、config 覆盖 env、图片 provider 字段投影、无关配置保留、默认连接字段、OmniRoute 旧模型清理、API 配置变化与连接变化判定。

影响：

- `oct-gateway/index.js` 不再直接实例化 `WsTransport` / `HttpTransport`。
- `task-board-update` broadcast 改为通过 `gatewayTransports.wsTransport.broadcast()` 调用，行为保持一致。
- `oct-gateway/index.js` 不再内联 gateway capability snapshot 逻辑。
- `oct-gateway/index.js` 不再内联 `scriptAdapter.*` 大分支与图片配置大对象。
- `oct-gateway/index.js` 的本次主入口 diff 已从“堆叠业务分支”收缩为“依赖装配 + chat lifecycle + 少量入口转发”。
- `electron/main.ts` 不再内联 `get-api-keys` 的大段读取投影，也不再内联 `save-api-keys` 的大段字段赋值与重启判定；设置读取/写入规则有独立单元测试保护。

## Phase C-2 Chat 主链入口收口

新增：

- `oct-gateway/runtime/chatRequestHandler.js`
  - 从 `oct-gateway/index.js` 抽出普通 `chat.send` 主生命周期编排。
  - 保留原有 orchestrator 分发、Agent 短路、context build、thinking pulse、abort、keepalive、tool/canvas/clarify event 转发、ChatEngine 回调与最终 done payload。
  - `oct-gateway/index.js` 现在只负责创建 `ChatEngine` / `ContextBuilder` 后注入 `createChatRequestHandler()`，再交给 `MessageRouter`。

- `oct-gateway/test/chatRequestHandler.test.js`
  - 覆盖普通聊天生命周期：system prompt、context build、canvas toolChoice、delta、tool event、canvas/workbench 转发、usage/model/done payload。
  - 覆盖 Agent 短路：不进入 context/chat engine，写入 session history，并发送 `agent_status done` 与最终 chat done。

影响：

- `oct-gateway/index.js` 不再内联 `handleChatRequest()` 大段业务生命周期。
- Phase C 的入口层边界更接近“启动、依赖注入、transport/message 分发”，但仍未删除 provider legacy/fallback。
- 本轮仍属于测试保护下的小步收口；没有移动 `providerRouter`、`toolLoop`、`ChatEngine` 内部实现。

## Phase C 启动判断

- **可开始 Phase C-0**：已开始，且只补测试。
- **不可开始 legacy 删除**：尚未完成 Electron `save-api-keys` 文件写入 helper 测试、传统 provider 兼容模式的完整测试保护。
- **下一步建议**：继续按同样方式补 Electron 设置持久化 helper 测试；之后再考虑收敛 provider registry/front-end projection。不要删除 legacy provider/fallback，不移动 provider/toolLoop 业务逻辑，直到相应测试补齐。

## Phase C-3 启动副作用继续收口

新增：

- `oct-gateway/bootstrap/memoryJobs.js`
  - 从 `oct-gateway/index.js` 抽出 memory health、heartbeat、review queue、governance report、memory monitor、summarizer scheduler 的启动注册。
  - 保留原有调用顺序和 `Memory v2 file backend enabled` 日志。
  - 不改变 memory、review queue、scheduler 的实现与运行策略。

- `oct-gateway/test/bootstrapMemoryJobs.test.js`
  - 用 fake scheduler/monitor/schedule 函数验证启动注册顺序、依赖注入参数和 memory root 日志。

- `oct-gateway/bootstrap/environment.js`
  - 从 `oct-gateway/index.js` 抽出 `File` shim 与 undici `ProxyAgent` 环境代理启用逻辑。
  - 保留关键顺序：先补 `globalThis.File`，再加载 config，随后按 `.env` / env 中的 HTTP(S)_PROXY 启用 fetch proxy。
  - 保留清理 `NODE_USE_ENV_PROXY` / `node_use_env_proxy`，避免 Google generativelanguage 重复鉴权。

- `oct-gateway/test/bootstrapEnvironment.test.js`
  - 覆盖 Node buffer `File` 注入、Blob fallback shim、proxy URL 读取、敏感代理鉴权遮蔽、env-proxy 清理和无代理 no-op。

影响：

- `oct-gateway/index.js` 顶部不再内联 runtime 兼容 shim 与 proxy 细节。
- `oct-gateway/index.js` 不再直接串联 memory/scheduler 启动注册细节。
- Phase C 继续只收口启动副作用和入口胶水；仍未删除 legacy provider/fallback，也未移动 provider/toolLoop 核心业务。

验证：

- `node oct-gateway/test/bootstrapEnvironment.test.js`
- `node oct-gateway/test/bootstrapMemoryJobs.test.js`
- `node oct-gateway/test/bootstrapLifecycle.test.js`
- `node oct-gateway/test/bootstrapTransports.test.js`
- `node oct-gateway/test/chatRequestHandler.test.js`
- `node oct-gateway/test/gatewayCapabilities.test.js`
- `node oct-gateway/test/imageGenerationConfig.test.js`
- `node oct-gateway/test/scriptAdapterMessageHandler.test.js`
- `node oct-gateway/test/gatewaySmoke.test.js`

## Phase D-1 Electron Provider 配置投影收口

新增：

- `electron/config/providers.ts`
  - 从 `electron/main.ts` 抽出 Settings UI fallback provider registry。
  - 抽出 `get-provider-list` 的 provider module 加载与 fallback 逻辑。
  - 抽出 `test-ai-connection` 中 providerId、baseUrl、apiKey、model 的纯配置投影。
  - 保留 `electron/main.ts` 中的真实 IPC、Google native SDK 调用和 fetch 副作用。

- `electron/config/providers.test.ts`
  - 覆盖 fallback provider 列表关键字段。
  - 覆盖 gateway `providers.js` 可用、缺失、加载失败三种路径。
  - 覆盖显式 provider、自定义配置、DashScope Coding URL 推断。
  - 覆盖 New API 自定义模型与 Google 连接参数投影。

影响：

- `electron/main.ts` 不再内联大段 provider fallback registry。
- `test-ai-connection` 不再内联 provider/baseUrl/apiKey/model 分支矩阵，后续 Phase D 可继续把 provider metadata 权威向 gateway 侧收敛。
- 本轮仍未改变实际连接测试协议：Google native 分支和 OpenAI-compatible `/chat/completions` 测试请求保持在原 IPC 中。

验证：

- `npx vitest run electron/config/providers.test.ts electron/config/apiKeys.test.ts src/hooks/__tests__/settingsPayload.test.ts`
- `npx tsc -p tsconfig.electron.json --noEmit`

## Phase D-2 Memory Vector Recall 配置收口

新增：

- `electron/config/vectorRecall.ts`
  - 从 `electron/main.ts` 抽出 Memory 向量召回的 provider 推断。
  - 抽出 `get-memory-vector-recall-config` 的 UI 数据投影。
  - 抽出 `save-memory-vector-recall-config` 的嵌套 `memory.vectorRecall.embedding/recall` 写入规则。
  - 保留 `electron/main.ts` 中的 IPC、配置文件写入、Gateway 重启和重连副作用。

- `electron/config/vectorRecall.test.ts`
  - 覆盖 DashScope / Volcengine / custom provider 推断。
  - 覆盖空配置默认投影和已保存配置投影。
  - 覆盖 Bailian preset、recall threshold/topK 边界、无关 memory 配置保留和 custom 值 trim。

影响：

- `electron/main.ts` 不再内联向量召回 provider preset、provider 推断和嵌套配置更新矩阵。
- Memory 设置链路仍维持原协议：保存后写入 `config.json`、刷新 `loadOpenClawConfig()`，并在 Gateway 存活时重启。
- 前端 `MemoryTabView` 仍保留 UI preset，用于交互默认值；后续可单独做前后端 preset 去重。

验证：

- `npx vitest run electron/config/vectorRecall.test.ts electron/config/providers.test.ts electron/config/apiKeys.test.ts`
- `npx tsc -p tsconfig.electron.json --noEmit`
