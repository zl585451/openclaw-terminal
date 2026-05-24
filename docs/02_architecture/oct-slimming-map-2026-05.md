# OCT 瘦身审计地图 (2026-05-24 加固版)

本地图用于指导 OCT Phase C 之后的瘦身删除决策。当前阶段只允许补测试与收集证据；除非某项已被回归测试覆盖且确认无运行时引用，否则不得删除 legacy 代码。

## 分类标准

- **Keep（需重构）**：仍在主链上，不能删除，但应拆小、降耦合或移动到更清晰的模块。
- **测试后删**：疑似 legacy 或迁移保护带，必须先补回归测试并确认路径不再触发。
- **暂不删除**：仍有明确职责，或证据不足以证明重复。
- **需优化**：职责合理但边界不清，需要文档、测试或接口收敛。
- **可选化/懒加载**：不属于核心聊天主链，适合后续拆包或按需加载。

## 审计证据表

| 区域 | 文件/目录 | 当前职责 | 冗余/遗留点 | 分类 | 删除/重构前需测试 |
|---|---|---|---|---|---|
| Gateway 入口 | `oct-gateway/index.js` | 组装 config、router、runtime、tool loader、orchestrator、少量 IPC/HTTP 入口等启动胶水 | Phase C-1/C-3 已抽出 environment、memory jobs、transport、lifecycle、capability snapshot、image config、script-adapter 分支；Phase C-4 将 slash 与 capability snapshot 共用的 `ProviderRouter` 收口为入口统一注入；入口仍承担依赖装配职责 | Keep（需继续重构） | gateway 启动、WS connect、`chat.send`、slash、tool event 回归 |
| Transport Bootstrap | `oct-gateway/bootstrap/transports.js` | Phase C-1 新增的 transport 启动胶水，集中创建 WS/HTTP transport 并提供统一 close | 从 `index.js` 抽出的低风险启动职责；不包含业务路由 | Keep（新边界） | `oct-gateway/test/bootstrapTransports.test.js`、`gatewaySmoke.test.js` |
| Lifecycle Bootstrap | `oct-gateway/bootstrap/lifecycle.js` | Phase C-1 新增的 shutdown signal 与 task-board broadcast 注册胶水 | 从 `index.js` 抽出的启动/关闭副作用；不包含业务处理 | Keep（新边界） | `oct-gateway/test/bootstrapLifecycle.test.js`、`gatewaySmoke.test.js` |
| Environment Bootstrap | `oct-gateway/bootstrap/environment.js` | Phase C-3 新增的 Node/Electron 运行时兼容层，负责 `File` shim 与 fetch proxy 启用 | 从 `index.js` 顶部抽出的启动前置副作用；必须保持在 `config` 加载前后原有顺序 | Keep（新边界） | `oct-gateway/test/bootstrapEnvironment.test.js`、`gatewaySmoke.test.js` |
| Memory Jobs Bootstrap | `oct-gateway/bootstrap/memoryJobs.js` | Phase C-3 新增的 memory health、heartbeat、review queue、governance、monitor、scheduler 启动注册胶水 | 从 `index.js` 抽出的运行时 job 注册；不改变 memory/review/scheduler 策略 | Keep（新边界） | `oct-gateway/test/bootstrapMemoryJobs.test.js`、`gatewaySmoke.test.js` |
| Gateway Router | `oct-gateway/gateway/router.js` | `chat.send`、slash 命令分流、`sessions.list`、未知方法响应 | 已经是可测试的新分层入口，后续可承接 `index.js` 中更多分流逻辑 | Keep（需扩展测试） | `oct-gateway/test/messageRouterRegression.test.js` |
| Transport 协议 | `oct-gateway/transport/protocol.js`、`oct-gateway/transport/ws.js` | JSON parse/serialize、WebSocket challenge/auth、认证后消息派发 | 协议很薄，但它保护 `req/res/event` 形状；删除风险高 | 暂不删除 | `oct-gateway/test/messageRouterRegression.test.js`、`oct-gateway/test/wsTransportAuth.test.js` |
| Chat Request Handler | `oct-gateway/runtime/chatRequestHandler.js`、`oct-gateway/runtime/chatEngine.js` | `chat.send` 主生命周期编排、orchestrator 短路、context build、tool/canvas/keepalive/stream event 转发、最终回复事件 | Phase C-2 已将原 `index.js` 内联聊天生命周期抽到 runtime 可测试边界；`index.js` 只注入依赖并挂到 `MessageRouter` | Keep（新边界，后续再拆内部职责） | `oct-gateway/test/chatRequestHandler.test.js`、`oct-gateway/test/gatewaySmoke.test.js` |
| Gateway Capability Snapshot | `oct-gateway/runtime/gatewayCapabilities.js` | Phase C-1 新增能力快照 helper，封装 providerRouter 与 MCP 状态读取 | 从 `index.js` 抽出的可测试纯组装逻辑；失败时返回保守默认值 | Keep（新边界） | `oct-gateway/test/gatewayCapabilities.test.js` |
| Image Config Projection | `oct-gateway/runtime/imageGenerationConfig.js` | Phase C-1 新增图片生成配置投影 helper，封装 image provider/baseUrl/model 默认值与 key 透传 | 从 `image.generate` 分支抽出的配置拼装；不执行图片生成 | Keep（新边界） | `oct-gateway/test/imageGenerationConfig.test.js` |
| OmniRoute 边界层 | `oct-gateway/runtime/omniRoute.js` | 逻辑能力别名、legacy alias 兼容、能力状态检查 | 与 `externalOmniRoute.js` 不是直接重复；它是能力边界层，是否可继续缩小需通过调用链确认 | 需优化 | `oct-gateway/test/omniRoute.test.js`、`externalOmniRoute.test.js` |
| OmniRoute 外部适配 | `oct-gateway/runtime/externalOmniRoute.js` | 读取外部 OmniRoute baseUrl/key/model，探测 `/models`，解析可选模型 | 是外部网关适配层，不应定性为重复实现 | Keep（运行时适配权威） | `oct-gateway/test/externalOmniRoute.test.js` |
| 本地 Provider Router | `oct-gateway/runtime/providerRouter.js` | 本地 provider/model 能力解析、Google 特例、fallback 信息 | 与“外部 OmniRoute 负责物理路由/fallback”的目标存在职责重叠；但本地兼容模式仍可能依赖它；Phase C-4 已移除 slash 内部重复实例化，改由 gateway 入口注入共享实例 | 测试后删/降级 | provider 能力、`/status`、`/model`、传统 provider 配置回归 |
| 运行时配置解析 | `oct-gateway/config.js` / `getProviderConfig()` | 合并 config file、env、legacy config，解析运行时 provider/API key/baseUrl/model | 是运行时解析权威，不能被前端硬编码替代 | Keep（权威） | provider config 单元测试、OmniRoute 开关测试 |
| 用户设置持久化 | `electron/main.ts` 的 `get-api-keys` / `save-api-keys`、`electron/config/apiKeys.ts` | 读取/写入 Electron userData config，并触发 gateway 相关状态更新 | Phase C-1 已将 `get-api-keys` 读取投影与 `save-api-keys` 字段写入、OmniRoute 旧模型清理、重启/重连判断抽到可测试 helper；`main.ts` 保留 IPC 与副作用编排 | Keep（需继续拆小） | `electron/config/apiKeys.test.ts`、设置保存、回读、重连 |
| Electron Provider Metadata | `electron/config/providers.ts`、`oct-gateway/providers.js` | Settings UI provider 列表 fallback、provider/baseUrl/apiKey/model 投影、`test-ai-connection` 的连接参数解析 | Phase D-1 已将 Electron 内联 fallback provider registry 和连接测试配置投影抽到可测试 helper；前端仍消费 Electron IPC 返回的 provider metadata | Keep（新边界，后续向 gateway metadata 收敛） | `electron/config/providers.test.ts`、`test-ai-connection`、`get-provider-list` |
| Memory Vector Recall Config | `electron/config/vectorRecall.ts`、`electron/main.ts` 的 `get/save-memory-vector-recall-config` | 向量召回 provider 推断、embedding 配置投影、preset 应用、threshold/topK 边界 | Phase D-2 已将 Electron 内联向量召回配置读写规则抽到可测试 helper；`main.ts` 保留 IPC、文件写入与 Gateway 重启副作用 | Keep（新边界，后续与前端 preset 去重） | `electron/config/vectorRecall.test.ts`、Memory 设置保存/回读 |
| Memory Summarizer Config | `electron/config/memorySummarizer.ts`、`electron/main.ts` 的 `get/save-memory-summarizer-config` | 摘要模型启用状态、API baseUrl/key/model 投影与嵌套写入 | Phase D-3 已将 Electron 内联摘要模型配置读写规则抽到可测试 helper；`main.ts` 保留 IPC、文件写入与 Gateway 重启副作用 | Keep（新边界） | `electron/config/memorySummarizer.test.ts`、Memory 摘要设置保存/回读 |
| 前端设置投影 | `src/hooks/settings/useApiKeys.ts`、`src/hooks/settings/recommendedModels.ts`、`src/ui/settings/tabs/ConnectionTabView.tsx`、`src/ui/settings/tabs/ConnectionTabView.Beginner.tsx` | 展示 provider/model/key，构造保存 payload，读取 OmniRoute 状态，触发连接测试 | Phase D-4 已将高级/新手设置页重复的 `testAIConnection` provider/baseUrl/apiKey/model 分支收口到 `buildAiConnectionTestPayload()`；Phase D-5 已将前端完整 `FALLBACK_PROVIDERS` 降级为最小 `EMERGENCY_FALLBACK_PROVIDERS`；Phase D-6 已将高级 provider 切换与 Base URL 读写分支收口到 `apply/read/writeChatProviderBaseUrl` helpers；Phase D-7 已补 provider metadata 权威/兜底测试；Phase D-8 删除前端 `RECOMMENDED_MODELS`，新手推荐模型改从 provider metadata 派生 | Keep（Phase D 基本收口） | `src/hooks/__tests__/recommendedModels.test.ts`、`src/hooks/__tests__/settingsPayload.test.ts`、`src/hooks/__tests__/settings.test.ts` |
| 消息/渲染协议 | `src/types/gateway.ts`、`src/hooks/useWebSocket.ts`、`src/ui/chat/MessageList.tsx`、`src/core/*Router*`、`oct-gateway/services/renderBlocksNormalizer*` | 前端解析 `chat`/`tool`/`agent-phase`/CoT/render blocks 并渲染 | 多处兼容旧格式；后续需要唯一 Render Protocol spec，而不是直接删除 | 暂不删除（需协议收敛） | render protocol golden、stream/router/FSM、tool leak 回归 |
| 通用工具层 | `oct-gateway/tools/`、`oct-gateway/tool_loader.js` | gateway 通用工具发现与执行 | 与 script_adapter 同属“能力层”，但职责不是同一个；不建议合并 | 可选化/懒加载 | tool adapter、tool loop、至少一个安全工具调用回归 |
| 内容生产工作流 | `oct-gateway/script_adapter/`、`src/modules/script-adapter` | 长内容/有声书/生产工作台 Agents 与 UI | Phase C-1 已将 `scriptAdapter.*` 消息分发集中到 `script_adapter/messageHandler.js`；该能力仍非核心聊天主链，适合后续模块化/懒加载 | 可选化/懒加载 | `oct-gateway/test/scriptAdapterMessageHandler.test.js`、script-adapter agents、export client、工作台入口 smoke |

## Phase C-0 测试先行清单

本轮已新增：

- `oct-gateway/test/messageRouterRegression.test.js`
  - 覆盖 slash 分流、普通 `chat.send`、`sessions.list`、未知 method、`tool` event 的协议 roundtrip。
- `oct-gateway/test/wsTransportAuth.test.js`
  - 覆盖 WS challenge、未认证拒绝、错误 token 拒绝、认证成功 hello-ok、认证后消息派发、连接关闭回调。
- `oct-gateway/test/slashHandlerRegression.test.js`
  - 覆盖 `/help`、未知命令、`/status`、`/model` 列表/切换、`/provider` 列表/切换、`/think high`、`/cot` 状态查询，锁定系统命令输出不应进入普通业务重构。
  - Phase C-4 增加共享 provider router 注入断言，锁定 `/model` 切换和 `/status` 使用入口注入的同一能力解析边界。
- `oct-gateway/test/gatewaySmoke.test.js`
  - 启动真实 `oct-gateway/index.js` 子进程，使用临时配置和临时 localhost 端口验证 WS challenge、connect、`sessions.list`、`/help`。
- `oct-gateway/test/bootstrapTransports.test.js`
  - 覆盖 Phase C-1 新增 `startGatewayTransports()` helper，确认 WS/HTTP 端口、依赖注入与统一关闭语义。
- `oct-gateway/test/bootstrapLifecycle.test.js`
  - 覆盖 Phase C-1 新增 shutdown signal 注册与 `task-board-update` broadcast 注册，锁定入口副作用抽离后的行为。
- `oct-gateway/test/bootstrapEnvironment.test.js`
  - 覆盖 Phase C-3 新增 `ensureWebFileShim()` / `setupFetchProxyFromEnv()`，锁定 File shim、proxy 读取、敏感信息遮蔽和 env-proxy 清理行为。
- `oct-gateway/test/bootstrapMemoryJobs.test.js`
  - 覆盖 Phase C-3 新增 `startGatewayMemoryJobs()`，锁定 memory/scheduler 启动注册顺序和依赖注入参数。
- `oct-gateway/test/gatewayCapabilities.test.js`
  - 覆盖 Phase C-1 新增 `createGatewayCapabilitiesProvider()` helper，确认 provider/MCP 状态组装和失败 fallback。
- `oct-gateway/test/imageGenerationConfig.test.js`
  - 覆盖 Phase C-1 新增图片配置投影 helper，验证 minimax/openai/siliconflow/google 默认值与显式配置优先级。
- `oct-gateway/test/scriptAdapterMessageHandler.test.js`
  - 覆盖 Phase C-1 新增 `scriptAdapter.*` 消息分发 helper，验证 intake、run start、batch subscribe、未知方法 fallthrough。
- `oct-gateway/test/chatRequestHandler.test.js`
  - 覆盖 Phase C-2 新增 `createChatRequestHandler()`，锁定普通 `chat.send` 生命周期、tool/canvas event 转发、agent 短路、session 写入、最终 done payload。
- `src/hooks/__tests__/settingsPayload.test.ts`
  - 覆盖前端设置 payload 作为“设置投影”的边界，验证 OmniRoute 字段、NewAPI 自定义模型、Google scoped baseUrl 不串写到 DashScope 字段。
  - Phase D-4 增加连接测试 payload 覆盖，锁定高级/新手设置页共用同一套 chat provider 投影规则。
  - Phase D-6 增加 provider selection / editable Base URL helper 覆盖，锁定高级设置页 Base URL 分支不再散落在 JSX 中。
- Phase D-5 将前端 provider fallback 从完整模型目录压缩为 emergency metadata，减少与 `oct-gateway/providers.js` / Electron provider helper 的重复维护面。
- Phase D-7 增加 `useApiKeys()` provider metadata 加载测试，区分正常 `getProviderList()` 权威来源和无 Electron bridge 时的 emergency fallback。
- Phase D-8 删除前端推荐模型目录，新增 `recommendedModels.test.ts` 锁定新手推荐模型来自 provider metadata。
- `electron/config/apiKeys.test.ts`
  - 覆盖 Electron `get/save-api-keys` 配置 helper，验证 env 解析、config 优先级、图片 provider 投影、boolean 规范化、无关配置保留、OmniRoute 旧模型字段清理、默认连接字段、Gateway 重启/重连判断。

仍建议补强但不阻塞 Phase C-0 当前批次：

- Electron `save-api-keys` 的可注入文件系统测试；当前仅覆盖了 renderer payload 构造，尚未抽离 Electron 文件写入 helper。
- 前端设置页“不维护 provider registry 权威”的结构性测试已补到 `src/hooks/__tests__/settings.test.ts`；后续如继续收敛 UI，可补浏览器交互层 smoke。
