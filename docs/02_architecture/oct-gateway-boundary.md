# OCT Gateway 职责边界定义 (加固版)

## 核心原则

OCT 核心主线收敛为外部 OmniRoute 客户端；本地多 provider 仅保留为过渡/降级模式。

## 三层配置权威

1. **用户设置持久化权威：Electron userData `config.json`**
   - 入口：`electron/main.ts` 中的 `get-api-keys` / `save-api-keys`。
   - 职责：保存用户输入的 Base URL、API Key、model、proxy、OmniRoute 开关等桌面端设置。
   - 注意：这是“用户设置持久化权威”，不是 provider 能力解析权威。

2. **运行时解析权威：`oct-gateway/config.js` / `getProviderConfig()`**
   - 职责：合并配置文件、环境变量、legacy config，解析当前运行时 provider、API key、baseUrl、model、能力声明。
   - 后续瘦身要求：gateway 运行时只能信任这一层的解析结果，不能让前端硬编码 provider registry 参与运行时判断。

3. **前端设置投影：`src/hooks/settings/useApiKeys.ts` / `src/ui/settings/*`**
   - 职责：展示、提交、触发保存与重连、展示 OmniRoute 诊断。
   - 限制：前端不应成为 provider registry 权威；现有 `FALLBACK_PROVIDERS` 只能作为加载失败时的 UI fallback，后续 Phase D 应收敛为消费 gateway 返回的 provider metadata。
   - Phase D-1 后，Electron 侧 provider fallback 列表和 `test-ai-connection` 的 provider/baseUrl/apiKey/model 投影已收口到 `electron/config/providers.ts`；`electron/main.ts` 只保留 IPC 编排、Google native 特例调用和真实 fetch 副作用。
   - Phase D-2 后，Memory 向量召回的 provider 推断、embedding preset、threshold/topK 边界已收口到 `electron/config/vectorRecall.ts`；`electron/main.ts` 只保留配置文件写入和 Gateway 重启副作用。
   - Phase D-3 后，Memory 摘要模型的 enabled/baseUrl/apiKey/model 投影与嵌套写入已收口到 `electron/config/memorySummarizer.ts`；`electron/main.ts` 继续只保留 IPC、写文件和 Gateway 重启副作用。
   - Phase D-4 后，高级/新手设置页的连接测试 payload 不再各自内联 provider/baseUrl/apiKey/model 分支，统一通过 `buildAiConnectionTestPayload()` 生成；前端仍只负责投影和触发，不参与 gateway 运行时 provider 解析。
   - Phase D-5 后，前端只保留最小 `EMERGENCY_FALLBACK_PROVIDERS` 作为 Electron bridge / provider list 不可用时的 UI 兜底；完整 provider/model metadata 不再在前端 fallback 中复制。
   - Phase D-6 后，高级设置页 provider 切换和 Base URL 输入框读写统一通过 `applyChatProviderSelection()` / `readChatProviderBaseUrl()` / `writeChatProviderBaseUrl()`；JSX 不再维护 provider Base URL 字段矩阵。
   - Phase D-7 后，`useApiKeys()` 已用测试锁定：正常路径使用 Electron `getProviderList()` 返回的 provider metadata；无 bridge 路径才使用最小 emergency fallback。

## OCT 与 OmniRoute 职责边界

| OCT 本地端保留 | 下放给 OmniRoute |
|---|---|
| 桌面 UI 生命周期 | 物理模型路由 |
| WebSocket / HTTP 本地协议包装 | provider fallback 策略 |
| 工具本地触发与前端渲染适配 | 额度、可用性、候选策略 |
| 用户设置写入与重连控制 | 多 provider 凭证仓与能力发现 |
| `req/res/event`、tool event、render block 的 OCT 协议稳定性 | 模型出口选择与自愈 |

## 重构方向

- `oct-gateway/runtime/omniRoute.js` 保持为逻辑能力别名与边界层。
- `oct-gateway/runtime/externalOmniRoute.js` 保持为外部 OmniRoute 适配层。
- `oct-gateway/runtime/providerRouter.js` 在本地兼容模式仍存在价值；后续只能在测试覆盖后逐步降级，而不是直接删除。
- `oct-gateway/index.js` 应逐步收敛为启动与依赖注入，不继续承载业务分流细节。
- Phase C-2 后，普通 `chat.send` 生命周期已收口到 `oct-gateway/runtime/chatRequestHandler.js`；入口层只负责注入 orchestrator、contextBuilder、chatEngine、session 与 transport helper。
- Phase C-3 后，运行时环境兼容层收口到 `oct-gateway/bootstrap/environment.js`，memory/scheduler 启动注册收口到 `oct-gateway/bootstrap/memoryJobs.js`；入口层不再内联这些启动副作用细节。
