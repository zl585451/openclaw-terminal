# FEATURE_MAP.md — OCT 项目功能活地图

> **维护规则**：每次新增/修改功能后，必须更新此文件。  
> **最后更新**：2026-04-19（移除录音转文字 ASR 链路，保留 TTS）  
> **AI 入口**：先看 `docs/00_ai_entry/README.md`，再按问题类型进入链路文档。

---

## 快速导航

| 层级 | 模块 | 文件 |
|------|------|------|
| **AI 协作** | 入口总览 | [`../00_ai_entry/README.md`](../00_ai_entry/README.md) |
| **AI 协作** | 聊天流式入口 | [`../00_ai_entry/chat-stream-entry.md`](../00_ai_entry/chat-stream-entry.md) |
| **AI 协作** | 图片链路入口 | [`../00_ai_entry/image-flow-entry.md`](../00_ai_entry/image-flow-entry.md) |
| **AI 协作** | 音频链路入口 | [`../00_ai_entry/audio-entry.md`](../00_ai_entry/audio-entry.md) |
| **AI 协作** | 排错顺序 | [`../00_ai_entry/bug-triage.md`](../00_ai_entry/bug-triage.md) |
| **AI 协作** | 图形路由策略 | [`diagram-routing-strategy.md`](./diagram-routing-strategy.md) |
| **架构设计** | Workbench 独立化方案 | [`../06_features/WORKBENCH_ARCHITECTURE_PLAN.md`](../06_features/WORKBENCH_ARCHITECTURE_PLAN.md) |
| 第一层 | Gateway/基础设施 | [`01-gateway.md`](./01-gateway.md) |
| 第二层 | 对话后自动处理管线 | [`02-auto-pipeline.md`](./02-auto-pipeline.md) |
| 第三层 | 前置思考管线 | [`03-hypothesis.md`](./03-hypothesis.md) |
| 第四层 | 记忆搜索与启动加载 | [`04-memory-search.md`](./04-memory-search.md) |
| 第五层 | 图片处理 | [`05-image-file.md`](./05-image-file.md) |
| 第六层 | Slash 命令 | [`06-slash-commands.md`](./06-slash-commands.md) |
| 第七层 | Electron 桌面应用 | [`07-electron.md`](./07-electron.md) |
| 第八层 | 提示词系统 | [`08-prompts.md`](./08-prompts.md) |
| 第九层 | 工具系统 | [`09-tools.md`](./09-tools.md) |
| 附录 | 数据流向 | [`98_data_flow.md`](./98_data_flow.md) |
| 附录 | Provider 系统 | [`provider-system.md`](./provider-system.md) |
| 附录 | AI.library 集成 | [`AI_LIBRARY_OCT.md`](./AI_LIBRARY_OCT.md) |
| **AI 协作** | 项目总览 | [`AI_PROJECT_OVERVIEW.md`](./AI_PROJECT_OVERVIEW.md) |
| **AI 协作** | IPC 通道 | [`../03_specs/ELECTRON_IPC_CHANNELS.md`](../03_specs/ELECTRON_IPC_CHANNELS.md) |
| **AI 协作** | WebSocket 协议 | [`../03_specs/WEBSOCKET_PROTOCOL.md`](../03_specs/WEBSOCKET_PROTOCOL.md) |
| **AI 协作** | 文档差距报告（历史） | [`../03_specs/DOCUMENTATION_GAP_REPORT.md`](../03_specs/DOCUMENTATION_GAP_REPORT.md) |

> 注意：旧的 `feature-map/` 子目录引用已废弃，现已统一指向实际存在的文档路径。

---

## 核心架构一览

### 基础设施（第一层）
- **Gateway WebSocket**：前端 ↔ AI 的桥梁，OCT 自有 token 认证（无 ECDSA）
- **Transport 分层**：`transport/ws.js` / `transport/http.js` / `transport/protocol.js` 已接管网络生命周期，仍保留 legacy fallback 便于联调
- **Gateway 分层**：`gateway/router.js` / `gateway/slash.js` 承接请求路由与稳定 Slash 命令
- **Runtime 分层**：`runtime/chatEngine.js` / `contextBuilder.js` / `streamController.js` / `providerRouter.js` / `toolLoop.js`
- **Service 分层**：`services/postProcessor.js` / `imageService.js`
- **Orchestrator**：意图分类、后台任务派发，预留 Agent 路由
- **Agent 层**（新）：`agents/base_agent.js`（基类）/ `agents/agent_runner.js`（执行引擎）；独立会话、非流式工具循环、工具白名单隔离
- **后台任务队列**：task_queue + worker，持久化、60s 超时
- **AI 对话引擎**：Provider 抽象，支持百炼/DeepSeek/硅基/Groq/OpenAI/Ollama 等
- **Provider 系统**：服务商预设、按模型能力动态组装、Settings 服务商选择器
- **System Prompt**：从 Nocturne + 本地 MD 文件 + 人格配置动态加载
- **Nocturne 记忆后端**：Python FastAPI + SQLite

### 自动处理管线（第二层）
所有功能在 `onDone` 回调中异步触发，不阻塞对话：
- ✅ 对话历史保存
- 🔇 自我评估评分（已停用 2026-03-20，评分不准确）
- 🔇 模式提炼（已停用，依赖自评）
- ✅ 用户反馈检测（`memory_feedback.js:422`，2026-03-20 修复：已在 onDone 调用）
- ✅ 停车场待办检测（`index.js:424`）
- ✅ 自动记忆提炼（`index.js:431`，已接入 Governor）
- ✅ 追问偏好学习（已接入 Governor）
- ✅ Memory Governor（已接管历史摘要 / 反馈 / 自动提炼 / 追问偏好 / 工具层 memory_write / 注入筛选）
- ✅ review_queue 候选层与低频维护（软过期）
- ✅ Memory Management Agent 最小巡检骨架（低频治理报告）

**文档清理**：2026-03-20 删除 4 个重复的独立文件（`feedback-detect.md` 等），合并到 `02_auto_pipeline.md`

### 关键数据流
```
用户消息 → Gateway → AI 流式回复 → onDone 回调
                                     │
                                     ├─→ 保存历史
                                     ├─→ 检测反馈
                                     ├─→ 检测待办
                                     └─→ 提炼记忆
```

---

## 状态图例

| 符号 | 含义 |
|------|------|
| ✅ | 正常运行 |
| 🔇 | 已停用 |
| ⚠️ | 有问题但可用 |
| ❌ | 失效 |
| 🚧 | 未实现/进行中 |

---

## 最近修复

### 2026-04-19 移除录音转文字（ASR）链路
- **目标**：删除低使用率且易受密钥配置影响的录音输入能力，简化输入链路。
- **实现**：
  - 删除输入区录音按钮与录音编码逻辑（`src/ui/chat/ChatInput.tsx`）。
  - 删除 Electron `asr-transcribe` IPC handler 与 preload 暴露（`electron/main.ts`、`electron/preload.ts`）。
  - 清理能力系统中的 `asr` capability 映射（`src/core/capabilities/types.ts`、`src/core/capabilities/providers.ts`）。
- **结果**：
  - Chat 输入区仅保留文本、快捷命令、附件发送。
  - 架构与排错文档统一收敛到打字音效与 TTS 两条音频链。

### 2026-04-06 人格配置产品化
- **目标**：让 OCT 作为可发布产品时不再绑定开发者私人设定
- **实现**：
  - 设置面板新增人格配置：`AI 名称`、`用户称呼`、`风格预设`
  - Electron 将人格配置保存到 `userData/config.json`
  - Gateway 读取人格配置，运行时替换 `{{AI_NAME}} / {{USER_NAME}}`
  - Nocturne 初始化预设记忆改为按配置生成身份描述
  - 聊天 UI、通知、状态条的主要展示名称与人格配置保持一致
- **结果**：
  - 发布默认人格为中性可配置
- 私人化人格改为用户自己的本地配置，而不是写死在仓库主链里

### 2026-04-08 oct-gateway 分层重构收口
- **Service 层**：后处理链与图片路由已从 `index.js` 抽到 `services/`
- **Gateway 层**：`MessageRouter` 现已统一承接 Slash、`sessions.list`、普通 `chat.send`
- **Runtime 层**：`ChatEngine` / `ContextBuilder` / `ProviderRouter` / `ToolLoop` 已接线
- **Transport 层**：`WsTransport` / `HttpTransport` / `protocol` 已接线，协议格式保持不变
- **现状**：Feature Flag 与 legacy fallback 仍保留，等待联调后进入清理阶段

### 2026-04-08 联调修复与右栏状态增强
- **系统消息隔离**：Electron 仅信任 gateway 显式 `isSystemReply/type=system` 标记，普通 AI 回复不再误进系统气泡。
- **并发消息修复**：Slash 系统命令会先中断当前流；系统回复和普通流式正文分缓冲处理，避免 `/status` 插入搜索流后串流。
- **思考模式展示修复**：`/think off` 会关闭本地 CoT 面板渲染，正文与思考块不再交织。
- **图片识别降级增强**：`image_analyzer` 云端失败时会继续尝试本地降级，并在最终回复中明确说明视觉分析状态。
- **任务看板体验修复**：任务面板前端快速添加、Electron 本地任务写入、gateway `task_add/tasks_add` 均新增去重保护；任务与停车场项支持 hover 查看完整内容。
- **右栏 TOK/CTX**：`electron/main.ts` 和 `main_utf8.ts` 对多 provider usage 做统一抽取；右栏在厂商未返回显式上下文占用时，会基于模型窗口显示近似 `CTX`。

### 2026-04-06 语音助手与能力路由产品化
- **目标**：把语音能力做成产品级 capability routing，而不是 MiniMax 私有定制链
- **实现**：
  - 接入 MiniMax `speech-2.8-hd` WebSocket TTS
  - 保留浏览器本地朗读兜底
  - 语音输入改为录音 → IPC → 云端 ASR → 文本回填
  - `LogPanel` 新增 `TTS` 分类，只显示用量、成功与错误
  - 设置面板新增云端音色选择，但只有检测到可用 MiniMax TTS 能力时才展示
  - `auto` 朗读改为跟随当前 `OCT_PROVIDER`，不再因残留 Key 误触发别家云端语音
- **结果**：
  - MiniMax Token Plan 用户可直接启用云端朗读
  - 非 MiniMax 用户不会平白承担额外系统负担
  - 后续生图/多模态套餐能力可沿用同一套路由思路

### 2026-04-15 首屏引导组件（Phase P0 · Task P0-1）
- **新增**：`src/ui/onboarding/WelcomeHero.tsx`、`CapabilityCards.tsx`、`onboarding.css`（`oct-` 类名前缀；卡片点击带调试日志）
- **类型**：`vite-env.d.ts` 中 `musicHistoryLoad` 的 `clips` 形状与主进程 IPC 对齐（修复历史加载与构建）

### 2026-04-15 首屏引导接入聊天（Phase P0 · Task P0-2）
- **ChatTab.v2**：空会话时 `ChatMessageList` 注入 `WelcomeHero`；跳过或点卡后写入 `oct.onboarding.dismissed`；点卡发送走 `sendMessage(text, null)`。
- **MessageList**：`emptyConversationPlaceholder` 可选 prop，仅替换空会话占位，不碰消息列表渲染。

### 2026-04-15 聊天输入占位符（Phase P0 · Task P0-3）
- **ChatInput.tsx**（`ChatInputArea`）：可选 `isEmptyConversation`；空会话与有消息时切换中文 `placeholder`；`hasPendingPills` 时仍为「或者自己输入...」。
- **ChatTab.v2**：传入 `isEmptyConversation={messages.length === 0}`。

### 2026-04-15 主导航 Tab 文案（Phase P0 · Task P0-5）
- **TabBar**：`对话` / `音频`（Beta）/ `Reaper`（Beta）/ `保险箱`；Tab `id` 仍为 `chat` | `sound` | `reaper`，`SHOW_BETA_TABS` 逻辑不变。
- **TabBar.css**：`.oct-tab-beta-badge`。

### 2026-04-15 右栏默认折叠（Phase P0 · Task P0-4）
- **ChatTabRightPanel**：默认折叠为 **40px** 窄条；`oct.devpanel.expanded === '1'` 时初始展开；收放为侧边 **`right-panel-toggle`**（旧版同款箭头按钮），与早期交互一致；GW/MEM 状态点仍在面板内展示。
- **ChatTab.css**：沿用 `.right-panel-toggle` / `.right-panel--collapsed` 等既有样式。

### 2026-04-15 开发临时：首屏复测按钮
- **DEV**：输入区 **「欢迎页」** 按钮重置引导并可选择清空记录（见 `docs/05_changelog/2026-04-15-dev-onboarding-force-welcome.md`）；产品化前删除。

### 2026-04-15 欢迎卡画布能力
- **ChatTab.v2**：`capabilityId === 'canvas'` 时打开画布面板；发送文案 **仅为卡片 prompt**（见 `docs/05_changelog/2026-04-15-welcome-canvas-capability.md`）。

### 2026-04-16 能力系统核心（Phase P1 · Task P1-1～7）
- **core**：`src/core/capabilities/`（`types`、`providers`、`resolver`）；`src/hooks/useCapabilities.ts`（`oct.capabilities.userKeys` / `oct.capabilities.secrets`、自定义事件 `oct:capabilities-updated`）
- **onboarding**：`CapabilitySetupDrawer.tsx`、`CapabilityStatusBar.tsx`；`CapabilityCards` / `WelcomeHero` 按能力状态分支；`onboarding.css` 抽屉与状态条
- **ChatTab.v2**：首屏 `handleWelcomeSend` 仅 `sendMessage(prompt, null)` 并 dismiss onboarding（与此前欢迎卡「生图 / 画布」专用分支解耦；详见 `docs/05_changelog/2026-04-16-p1-capability-core.md`）

### 2026-04-16 聊天区 Kimi 风格伪工具调用（正文泄漏）
- **现象**：模型把 `<|…tool_calls_section_begin|>…JSON…<|…tool_calls_section_end|>` 写进 `delta.content`，原网关 `extractPseudoToolCalls` 只认 Ruby 风格，前端也未剥离，导致气泡内「代码外露」。
- **前端**：`cotExtract.stripLeakedToolCallSections` / `getAssistantVisibleMain`；`useMessages` 流式与 finalize；`MessageList` assistant 分流前剥离（见 `docs/05_changelog/2026-04-16-chat-kimi-tool-syntax-leak.md`）。
- **网关**：`oct-gateway/ai.js` 在 Ruby 无匹配时增加 `extractKimiStylePseudoToolCalls`，从 section 内解析 `{"name","arguments"}` 以触发既有 `toolLoop`（含 `canvas`）。

### 2026-03-24 网络稳定性、OpenClaw Skills、http_request/image_gen、VaultPanel 抽屉
- **网络稳定性**：ai.js 代理绕过（getDirectFetchOptions）、fetchWithRetry（90s 超时 + 重试）、流中断截断提示、工具调用 30s 超时隔离；config.js NO_PROXY 直连 DashScope
- **OpenClaw Skills**：skill_adapter.js 解析 SKILL.md（YAML frontmatter），注入 `<skills>` 到系统提示词，支持 bins 依赖检查
- **http_request**：通用 HTTP 工具，GET/POST/PUT/DELETE，对接第三方 API
- **image_gen**：通义万象 wanx-v1 图像生成，复用 DashScope API Key
- **VaultPanel 抽屉**：从右下角悬浮球改为 TabBar 内嵌 🔐 VAULT 按钮，右侧滑入抽屉，深绿黑主题

### 2026-04-05 记忆治理与 MiniMax 流式优化
- **Memory Governor Phase 1 / 1.5**：新增 `memory_governor.js`，统一接管历史摘要、反馈、自动提炼、追问偏好、`memory_write`、相关记忆注入筛选
- **review_queue**：新增标准候选层结构，带 `retention_hours`、`expires_at`、`cleanup_hint`
- **维护器**：新增 `review_queue_maintenance.js`，低频后台软过期弱候选
- **管理 Agent 骨架**：新增 `memory_management_agent.js`，输出治理报告与待处理建议
- **MiniMax 流式优化**：前端改为按帧合并刷新，并在流式阶段减轻重型解析，明显降低“系统被拖住”的顿感

### 2026-03-24 OCT 握手 + 工具层 + Orchestrator + 后台任务 + 保险箱与邮件
- **OCT 握手**：移除 OpenClaw ECDSA 签名，改为 `params.auth.token` 认证
- **工具层**：静态 tools.js → 动态 tool_loader + tools/*.js，23 个工具按文件拆分
- **Orchestrator**：意图分类（code/write/research），后台任务触发词（帮我搜/查一下/**查邮件/查验证码**等）
- **后台任务**：task_queue.js、worker.js，任务持久化到 tasks_runtime.json，AMY 下次对话时注入结果
- **保险箱**：vault_manager.js 加密存储、key normalize、HTTP 18790/tool、VaultPanel 编辑/邮箱表单
- **邮件工具**：email_reader（imapflow）、email_sender（nodemailer）、email_manager（count_unread/search 等）
- **文档**：更新 01-gateway、09_tools、CHANGELOG、OCT_MAS_ARCHITECTURE

### 2026-03-22 Gateway 稳定性修复（API 400 错误）
- **问题**：复杂调研时 API 返回 400 错误，原因是消息截断导致孤立的 tool 消息
- **修复 1**：`ai.js` 重写 `truncateHistory` 函数，智能查找安全截断点，保护 `tool_calls`/`tool` 消息配对
- **修复 2**：`ai.js` 新增 `validateAndFixMessages` 函数，防御性地移除孤立的 tool 消息
- **修复 3**：`tools.js` 的 `exec_command` 在 Windows 上先执行 `chcp 65001`，解决中文路径编码问题
- **影响**：彻底解决「messages with role "tool" must be a response to a preceeding message with "tool_calls"」错误

### 2026-03-22 会话稳定性修复（三处改动）
- **问题**：复杂调研任务时「会话假断开」，前端无视觉反馈
- **改动 1**：`ai.js` 超时从 2 分钟延长到 10 分钟
- **改动 2**：`index.js` 添加「思考心跳」每 8 秒推送 `thinking` 事件
- **改动 3**：`ChatTab.tsx` 显示「深度思考中」动画 + 计时器
- **文档**：更新 09-tools.md

### 2026-03-22 多引擎搜索封装
- **新增**：`src/gateway/search.ts` TypeScript 封装
- **特性**：Brave/Tavily/DuckDuckGo 三引擎自动降级
- **配置**：Settings 面板新增搜索引擎 API Key 入口
- **文档**：更新 FEATURE_MAP.md、09-tools.md

### 2026-03-22 提示词优化
- **SOUL.md**：新增「诚实铁律」+「语气校准锚点」，删除自动学习规则
- **OCT_PROTOCOL.md**：新增「复杂任务处理协议」，>3 个工具调用先拆分确认
- **目标**：对抗 Qwen 模型的献媚性撒谎和风格不稳定问题

### 2026-03-21 AI.library 集成（P0+P1+P2）
- **P0**：search_knowledge 工具、KnowledgeBaseAPI.search 方法、OCT 返回格式
- **P1**：config.json ai_library 配置节、从 config 读取 url/timeout/default_top_k、/status 显示 AI.library 状态
- **P2**：搜索结果 UI 美化（PDF 图标、百分比、截断）、错误提示优化、内存缓存（10 次/5 分钟）
- **文档**：更新 `AI_LIBRARY_OCT.md`、09-tools、config-system、06_commands

### 2026-03-20 停用自评系统，强化用户反馈
- **目标**：减少 API 消耗，稳定 AMY 风格
- **修改**：`index.js` 注释 selfEval 调用；`SOUL.md` 删除自动学习规则段落
- **保留**：用户反馈检测 (`memoryFeedback.detectAndSaveFeedback`) 正常运行，作为替代方案
- **验证**：发「好的」后终端应出现 `[Feedback]` 或 `[Memory] 反馈已写入`

### 2026-03-20 Provider 系统 Phase 1+2
- **目标**：市场化改造，用户选服务商 → 填 Key → 选模型 → 开聊
- **Phase 1**：providers.js 注册表、getProviderConfig、按模型能力动态组装、`/model`/`/provider` 命令
- **Phase 2**：Settings 服务商选择器、模型下拉、测试连接、保存后重启 Gateway
- **文档**：新增 `provider-system.md`，更新 ai-engine、config-system、06_commands、07_electron

### 2026-03-20 文档清理
- **问题**：自动管线 4 个模块有重复的独立文档，状态标记错误（❌ 失效）
- **修复**：删除 `feedback-detect.md`、`parking-detect.md`、`memory-extract.md`、`pattern-distill.md`，内容合并到 `02_auto_pipeline.md`
- **结果**：所有 6 个模块状态统一为 ✅，调用位置清晰记录

### 2026-03-20 BUG3 修复
- **问题**：反馈检测未在 onDone 中调用
- **修复**：在 `index.js` 的 `onDone` 回调中添加调用
- **验证**：发送「好的」后终端看到 `[Memory] 反馈已写入:`

### 2026-03-20 模式提炼修复
- **问题**：计数未持久化，重启后归零
- **修复**：计数写入文件 + 路径 fallback 逻辑

---

**📖 详细文档**：AI 排错优先进入 [`../00_ai_entry/README.md`](../00_ai_entry/README.md)，架构补充再看本目录各模块文档。
