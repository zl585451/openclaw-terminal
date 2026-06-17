# OpenClaw Terminal（OCT）产品能力分析

> 文档性质：产品向结构化分析（基于当前仓库代码与文档，非实现说明）  
> 整理日期：2026-04-15

---

## 第一部分：产品能力地图

### 1. 核心能力分类（按类别）

#### AI 对话与多轮工具执行

- **与助手自然语言对话**：主聊天区输入，经 Gateway 调用大模型流式回复。  
  - 前端：`src/ui/chat/ChatTab.v2.tsx`、`src/hooks/useMessages.ts`、`src/hooks/useWebSocket.ts`  
  - 网关：`oct-gateway/index.js`（`handleChatRequest`）、`oct-gateway/runtime/chatEngine.js`、`oct-gateway/ai.js`  
  - 文档：`docs/00_ai_entry/chat-stream-entry.md`、`docs/02_architecture/AI_PROJECT_OVERVIEW.md`
- **模型自动调用工具（读文件、搜网页、HTTP、记忆、任务等）**：由模型发起 `tool_calls`，`ToolLoop` 调 `tool_loader.executeTool`。  
  - `oct-gateway/runtime/toolLoop.js`、`oct-gateway/tool_loader.js`、`oct-gateway/tools/*.js`

#### 自动化 / 后台执行

- **关键词触发的后台任务队列**（不阻塞当前对话）：如「帮我搜」「查邮件」「查验证码」等，写入 `task_queue` 并由 `worker` 执行。  
  - `oct-gateway/orchestrator.js`（`tryDispatchAsTask`、`TASK_TOOL_MAP`、`getCompletedTasksContext`）、`oct-gateway/task_queue.js`、`oct-gateway/worker.js`
- **对话结束后的自动管线**（历史、反馈、待办停车、记忆提炼等，在 `onDone` 侧异步触发）。  
  - `docs/02_architecture/98_data_flow.md`、`docs/02_architecture/FEATURE_MAP.md`（「自动处理管线」）

#### 「多 Agent」与意图（当前偏标注，非完整多 Agent 产品）

- **意图分类**（code / write / research）：关键词规则，`dispatch` 注释写明「现阶段只分析和记录，不实际切换 Agent」。  
  - `oct-gateway/orchestrator.js`（`INTENT_RULES`、`analyzeIntent`、`dispatch`）
- **Canvas / Workbench 意图**：根据关键词决定是否强制 `canvas` 工具等。  
  - `oct-gateway/orchestrator.js`（`CANVAS_TRIGGER_RULES`、`analyzeCanvasIntent`）

#### 本地控制与桌面集成

- **Electron 窗口、主进程、子进程（Gateway / 记忆等）**：  
  - `electron/main.ts`（`docs/02_architecture/AI_PROJECT_OVERVIEW.md`、`AGENTS.md`）
- **本地执行 shell 命令**（工具 `exec_command`）：  
  - `oct-gateway/tools/exec_command.js`
- **语音**：输入区录音 → IPC → ASR；TTS 朗读（含设置里音色等）。  
  - `src/ui/chat/ChatInput.tsx`、`docs/02_architecture/FEATURE_MAP.md`（2026-04-06 语音条目）

#### 文件与项目操作

- **读/写本地文件**：`oct-gateway/tools/read_file.js`、`oct-gateway/tools/write_file.js`
- **聊天附件 / 拖放**：`src/ui/chat/ChatTab.v2.tsx`、`src/hooks/useFileAttachment.ts`

#### 网络与检索

- **网页搜索**：`oct-gateway/tools/web_search.js`；前端多引擎封装：`src/gateway/search.ts`
- **抓取 URL**：`oct-gateway/tools/web_fetch.js`
- **通用 HTTP**：`oct-gateway/tools/http_request.js`

#### 浏览器 / 结构化展示（产品内「画布」而非远程控制浏览器）

- **Workbench / Canvas 侧栏**：图表、流程图、Markdown 等产物展示；工具侧有 `canvas`。  
  - 前端：`src/components/workbench/WorkbenchHost.tsx`、`src/workbench/*`  
  - 网关：`oct-gateway/tools/canvas.js`  
  - 头部入口：`src/ui/chat/ChatTab.v2.tsx` 通过 portal 在 `chat-header-portal` 渲染 `OPEN CANVAS` 按钮

#### 记忆与知识

- **Nocturne 记忆后端**（对话历史、反馈、停车场等 URI 规范）：  
  - `docs/02_architecture/98_data_flow.md`、`oct-gateway/memory*.js`、`oct-gateway/tools/memory_*.js`
- **AI.library / search_knowledge**：`oct-gateway/tools/search_knowledge.js`、`oct-gateway/tools/ai_library.js`

#### 私密配置与邮件

- **保险箱 Vault**（加密存储，HTTP 工具等）：`oct-gateway/vault_manager.js`、`oct-gateway/tools/vault_ops.js`、UI `src/components/VaultPanel.tsx`、`src/components/TabBar.tsx`（`VAULT`）
- **邮件**：读/发/管理：`oct-gateway/tools/email_reader.js`、`email_sender.js`、`email_manager.js`

#### 图片：理解、生成、独立工作台

- **聊天中带图 / 视觉分析**：网关侧 `image_analyzer` / `image_analyzer_local`（见 `oct-gateway/index.js` 引用与 FEATURE_MAP）
- **生图**：工具 `oct-gateway/tools/image_gen.js`；HTTP `image.generate` 等在 `oct-gateway/index.js`
- **Image Studio（侧栏工作台）**：`src/ui/image/ImageStudio.tsx`，由 `ChatTab.v2.tsx` 输入区旁生图按钮切换开关

#### 系统命令与运维向能力

- **Slash 命令**（`/status`、`/model`、`/memory ...`、`/new` 等）：  
  - `oct-gateway/gateway/router.js`（以 `/` 开头走 `SlashHandler`）、`oct-gateway/gateway/slash.js`  
  - 文档索引：`docs/02_architecture/06-slash-commands.md`（可能与实现略有滞后，实现以 `slash.js` 为准）
- **MCP 动态工具**：`oct-gateway/mcp/manager.js` 注册到 `tool_loader`

#### Skills（可插拔说明，仓库内示例少）

- **解析 `SKILL.md` 注入提示词**：`oct-gateway/skill_adapter.js`（`docs/02_architecture/AI_PROJECT_OVERVIEW.md`）  
- **示例技能目录**：`oct-gateway/skills/README.md`、`oct-gateway/skills/test-skill/SKILL.md`

#### 其他产品向 Tab

- **MUSIC / REAPER**：`src/components/TabBar.tsx`、`src/components/SoundTab.tsx`、`src/components/ReaperTab.tsx`

---

### 2. 用户触发方式

| 方式 | 说明 | 入口 / 文件 |
|------|------|-------------|
| **自然语言** | 主路径：用户在输入框发送消息 | `src/ui/chat/ChatInput.tsx` → `ChatTab.v2.tsx` → `useMessages.sendMessage` |
| **Slash 命令** | 以 `/` 开头的消息在网关侧截获 | `oct-gateway/gateway/router.js`、`oct-gateway/gateway/slash.js` |
| **快捷指令菜单** | 按钮展开菜单，插入 `/status`、思考档位、长「系统指令」等 | `src/components/QuickCommandMenu.tsx`（`MENU_STRUCTURE`），在 `ChatInput.tsx` 中使用 |
| **UI 按钮** | 设置、朗读、打开 Canvas、生图工作台、Tab 切换、Vault | `src/ui/chat/ChatTab.v2.tsx`（portal 区）、`src/components/TabBar.tsx` |
| **拖放文件** | 拖到聊天区域 | `ChatTab.v2.tsx`（`DROP FILES HERE`） |
| **自动 / 半自动** | ① 后台任务关键词；② 对话 `onDone` 后记忆/反馈等；③ Gateway 启动与健康检查 | `orchestrator.js`、`docs/02_architecture/98_data_flow.md`、`oct-gateway/services/*.js` |
| **配置驱动** | API Key、服务商、MCP、代理、人格等 | `src/components/SettingsPanel.tsx`、`oct-gateway/config.js`、用户 `userData/config.json`（见 `AGENTS.md`） |

---

### 3. 执行链路（用户输入 → UI）

**主聊天链路：**

1. **用户输入** — `ChatInput.tsx` / `ChatTab.v2.tsx`
2. **前端消息与状态** — `useMessages.ts`：`sendMessage` / `quickSend`，维护 Turn FSM、流式缓冲、工具事件展示等
3. **发到主进程** — `useWebSocket.ts` 通过 Electron IPC（`docs/00_ai_entry/chat-stream-entry.md`：`electron/main.ts` → `openclaw-send`）
4. **Gateway 入口** — `oct-gateway/index.js`：`MessageRouter.handleRequest`
5. **路由**  
   - 若 `params.message` 以 `/` 开头 → **`SlashHandler.handle`**（`oct-gateway/gateway/router.js`）  
   - 否则 → **`handleChatRequest`**
6. **`handleChatRequest` 内部**  
   - `orchestrator.dispatch`（意图、Canvas 意图、可选后台任务）  
   - `contextBuilder.build`（会话历史、记忆注入、附件等）  
   - `chatEngine.execute` → **`streamChat`（`ai.js`）** → 流式 `delta` / 结束时 `done`  
   - 工具调用时 **`ToolLoop`** → **`tool_loader.executeTool`**
7. **回到前端** — `useWebSocket` 解析事件 → `useMessages` 的 `onChatDelta` / `onChatDone` 等 → **`MessageList.tsx`** 渲染

**前端「Router / Adapter」角色说明（避免与网关混淆）：**

- **`blockRouter`（`src/core/blockRouter.ts`）**：把已收到的 Markdown 字符串切成 text / code 块，用于渲染管道，**不是**请求路由。
- **`blockAdapter`（`src/core/blockAdapter.ts`）**：legacy option/task 解析辅助；`BlockIngest` 已从生产链路移除并删除。
- **`TurnFSM` / `turnAdapter`（`src/core/turnFSM/*`）** + **`turnSegments` / `turnUiState`**：分别控制回合生命周期、assistant 正文段事实源与「思考 / 打字中」等 UI 状态；`StreamRouter` 当前不挂在生产聊天主链路。

**网关侧「调度核心」命名：**

- **消息路由**：`oct-gateway/gateway/router.js`（`MessageRouter`）
- **工具循环**：`oct-gateway/runtime/toolLoop.js`（`ToolLoop`）
- **对话执行封装**：`oct-gateway/runtime/chatEngine.js`（`ChatEngine`）

---

## 第二部分：关键文件定位

### 1. UI 核心入口

- **应用根布局与 Tab**：`src/App.tsx`、`src/main.tsx`
- **主聊天宿主**：`src/ui/chat/ChatTab.v2.tsx`
- **消息列表与 Markdown**：`src/ui/chat/MessageList.tsx`
- **输入区**：`src/ui/chat/ChatInput.tsx`
- **顶栏**：`src/components/TitleBar.tsx`、`src/components/TabBar.tsx`

### 2. 能力调度核心

- **Gateway 消息路由**：`oct-gateway/gateway/router.js`
- **Slash**：`oct-gateway/gateway/slash.js`
- **编排（意图 + 后台任务 + Canvas 意图）**：`oct-gateway/orchestrator.js`
- **上下文组装**：`oct-gateway/runtime/contextBuilder.js`
- **对话执行**：`oct-gateway/runtime/chatEngine.js`、`oct-gateway/ai.js`
- **工具循环**：`oct-gateway/runtime/toolLoop.js`
- **前端流式与回合状态**：`src/hooks/useMessages.ts`、`src/core/turnFSM/turnFSM.ts`、`src/core/turnFSM/turnAdapter.ts`、`src/core/turnSegments.ts`、`src/core/turnUiState.ts`
- **渲染用块切分**：`src/core/blockRouter.ts`、`src/core/blockAdapter.ts`

### 3. 功能定义（注册位置）

- **静态工具**：`oct-gateway/tools/*.js`，由 `oct-gateway/tool_loader.js` 扫描加载
- **MCP 动态工具**：`oct-gateway/mcp/manager.js` → `registerProvider` → `tool_loader.js`
- **Skills**：`oct-gateway/skill_adapter.js`，内容目录 `oct-gateway/skills/`
- **Slash 子命令实现**：`oct-gateway/gateway/slash.js`（及 `index.js` 中与之配合的初始化）

### 4. 空状态 / 首屏相关

- **首次启动 API Key 引导遮罩**：`src/components/FirstLaunchSetup.tsx`，显示逻辑在 `src/App.tsx`
- **未连接 Gateway 时的折叠引导**：`src/components/SetupGuide.tsx`，嵌入 `ChatTab.v2.tsx`
- **聊天区空列表**：无独立 Welcome 组件；空会话时主要是空白消息列表 + 条件性 `SetupGuide`

---

## 第三部分：当前产品问题（从结构推断）

1. **第一次打开容易不知道干什么**  
   - 有 Key 的用户可能看不到 `FirstLaunchSetup`；聊天区缺少面向普通人的「能做什么」说明。  
   - 连接成功后面向新手的任务型引导仍弱。  
   - 界面用语偏工程化：`CONNECTED`、`/status`、`DEBUG`（`QuickCommandMenu.tsx`）、`REAPER`、`OPEN CANVAS` 等。

2. **「存在但没有暴露」的能力**  
   - 大量工具仅在模型侧可见（`oct-gateway/tools/*.js`），UI 无按场景的能力列表。  
   - Orchestrator 意图标签（Coder/Writer/Researcher）未作为产品概念展示（`orchestrator.js` 注明未真正切换 Agent）。  
   - MCP、Skills 强依赖配置，普通路径几乎不可见。  
   - 后台任务依赖自然语言触发词（`orchestrator.js` 的 `ASYNC_TRIGGERS`），无显式入口或状态页。

3. **UI 更像开发者工具**  
   - 快捷菜单含 DEBUG、重启 Gateway、思考档位等（`QuickCommandMenu.tsx`）。  
   - 右栏与头部强调 Token / CTX、连接状态、Canvas 开关。  
   - 多 Tab（MUSIC、REAPER）与终端美学更偏极客/工作室风格。

---

## 第四部分：建议（非实现清单）

1. **建议放在首页（Top 5）**  
   - 一句话开聊 + 示例提示  
   - 传图 / 问图  
   - 网络搜索 / 资料整理  
   - 打开工作台 / 要图表或流程图  
   - 保险箱 / 账号密钥（VAULT）

2. **建议隐藏或降级**  
   - 快捷菜单里的 DEBUG、重启 Gateway、原始 Slash 说明 → 收到「高级 / 诊断」  
   - Token/CTX 对默认用户折叠  
   - MUSIC / REAPER 标 Beta 或收到「更多」（参考 `TabBar.tsx` 的 `SHOW_BETA_TABS`）

3. **应增加的入口 / 快速开始**  
   - 「试试这三句」可点击填入输入框  
   - 「生图」除图标按钮外增加文字标签  
   - 「连接诊断」一键（产品文案，等价 `/status`）  
   - 「后台任务」说明 + 示例句式（对齐 `orchestrator.js` 触发词）

4. **首屏一句话引导逻辑**  
   - **先确认能连上模型 → 再给三个一键示例 → 再提示需要图表时打开工作台**，避免空聊天与英文状态条让用户不知所措。

---

## 一句话产品总结

**OCT 是一个带本地 Gateway 的桌面 AI 终端**：用户主要在聊天里说话；后端会按配置自动上网、读写文件、执行命令、记记忆、管保险箱和邮件，并把图表类结果放进 Workbench/Canvas——但当前界面仍大量沿用开发者与运维语境，普通用户需要更强的首屏任务引导与能力显式化。
