# FEATURE_MAP.md — OCT 项目功能活地图

> **维护规则**：每次新增/修改功能后，必须更新此文件。  
> **最后更新**：2026-04-06（语音能力路由产品化：云端 TTS 按当前 Provider 能力启用）  
> **详细说明**：查看 `docs/feature-map/` 文件夹中的分模块文档

---

## 快速导航

| 层级 | 模块 | 文件 |
|------|------|------|
| 第一层 | 基础设施 | [`01_infrastructure.md`](./feature-map/01_infrastructure.md) |
| 第二层 | 对话后自动处理管线 | [`02_auto_pipeline.md`](./feature-map/02_auto_pipeline.md) |
| 第三层 | 前置思考管线 | [`03_hypothesis.md`](./feature-map/03_hypothesis.md) |
| 第四层 | 记忆搜索与启动加载 | [`04_memory_search.md`](./feature-map/04_memory_search.md) |
| 第五层 | 图片处理 | [`05_image.md`](./feature-map/05_image.md) |
| 第六层 | Slash 命令 | [`06_commands.md`](./feature-map/06_commands.md) |
| 第七层 | Electron 桌面应用 | [`07_electron.md`](./feature-map/07_electron.md) |
| 第八层 | 提示词系统 | [`08_prompts.md`](./feature-map/08_prompts.md) |
| 第九层 | 工具系统 | [`09_tools.md`](./feature-map/09_tools.md) |
| 附录 | AI.library 集成 | [`AI_LIBRARY_OCT.md`](./AI_LIBRARY_OCT.md) |
| 附录 | Provider 系统 | [`provider-system.md`](./feature-map/provider-system.md) |
| 附录 | 已知问题 | [`99_known_issues.md`](./feature-map/99_known_issues.md) |
| 附录 | 数据流向 | [`98_data_flow.md`](./feature-map/98_data_flow.md) |
| **AI 协作** | 项目总览 | [`AI_PROJECT_OVERVIEW.md`](./AI_PROJECT_OVERVIEW.md) |
| **AI 协作** | IPC 通道 | [`ELECTRON_IPC_CHANNELS.md`](./ELECTRON_IPC_CHANNELS.md) |
| **AI 协作** | WebSocket 协议 | [`WEBSOCKET_PROTOCOL.md`](./WEBSOCKET_PROTOCOL.md) |
| **AI 协作** | 提示词加载 | [`PROMPT_LOADING_ORDER.md`](./PROMPT_LOADING_ORDER.md) |
| **AI 协作** | 选项框解析 | [`OPTIONBOX_PARSER_REFERENCE.md`](./OPTIONBOX_PARSER_REFERENCE.md) |
| **AI 协作** | Skills 目录 | [`SKILLS_DIRECTORY.md`](./SKILLS_DIRECTORY.md) |
| **AI 协作** | 文档差距报告 | [`DOCUMENTATION_GAP_REPORT.md`](./DOCUMENTATION_GAP_REPORT.md) |

> AI 协作文档补全于 2026-03-24 · CURSOR

---

## 核心架构一览

### 基础设施（第一层）
- **Gateway WebSocket**：前端 ↔ AI 的桥梁，OCT 自有 token 认证（无 ECDSA）
- **Orchestrator**：意图分类、后台任务派发，预留 Agent 路由
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

**📖 详细文档**：进入 [`docs/feature-map/`](./feature-map/) 查看各模块完整说明
