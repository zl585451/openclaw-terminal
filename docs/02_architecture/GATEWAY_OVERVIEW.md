# oct-gateway 架构概览

**oct-gateway（OCT Gateway）**：独立 Node.js 网关进程；通过 WebSocket 与 Electron/前端对齐，并把聊天与工具编排接到「当前配置」所选的大模型后端，以流式方式把正文与事件推回客户端。

---

## 启动方式与监听端口

- **默认 WebSocket 端口**：**18789**（`config.PORT`，可由环境变量 `OCT_GATEWAY_PORT` 覆盖）
- **默认 HTTP 辅助端口**：**18790**（源码中为 `PORT + 1`，与其它服务并列）
- **启动**：在 `oct-gateway/` 目录执行 `npm run start` 或 `npm run dev`（见 `package.json`：`node index.js`；含 Node 版本检查与原生依赖自检）

---

## 实际目录中与「计划中旧文件名」的对照（本仓库）

| 计划中名称 | 本仓库实际情况 |
|-----------|----------------|
| `streamChat.js` | **不存在**：流式编排主体在 **`ai.js`**（导出 `streamChat` 等） |
| `sessionManager.js` | **不存在**：会话保存在 **`session.js`**，由 `gateway/router.js` 等以 session 能力接入 |
| `toolRouter.js` | **不存在**：工具在执行层由 **`runtime/toolLoop.js`** 与 **`tool_loader.js`** 组合完成路由与递归调用 |
| `memoryService.js` | **不存在**：记忆能力分散在 **`memory.js`**、`memory_*`、`services/`、`memory_vector/` 等 |

---

## 关键文件一览（节选）

| 路径 | 职责 |
|------|------|
| `index.js` | 入口：补齐运行环境 shim、按需配置全局 fetch 代理、`require('./config')` 后拼装路由/传输与业务依赖，启动 **`transport/ws`** 与 **`transport/http`** |
| `config.js` | 通过 dotenv 依次加载 `.env.local`、`.env`（详见源码中 `override: false` 行为），再结合多级 `config.json`、Google 分项、`~/.openclaw/openclaw.json` legacy，合并为全局 `module.exports`，暴露 `getProviderConfig`、`getEnvOrConfig` 等 |
| `providers.js` | 各厂商预设（endpoint、示例模型、密钥环境变量列表等）；与 `runtime/providerRouter.js` 搭配解析当前模型能力 |
| `ai.js` | 与大模型会话的核心：**`streamChat`**、工具循环挂接、`ProviderRouter`、`ToolLoop`、Google 等特殊路径 |
| `session.js` | 会话历史持久化（默认落在用户缓存目录）、裁剪与查询 |
| `orchestrator.js` | 进入主模型流之前的调度：任务/触发词、`dispatch`（含可被专门 Agent「短路」的分支），再交给 `handleChatRequest` |
| `runtime/chatEngine.js` | 单次对话执行封装（与 `runtime/streamController.js`、后处理管线衔接） |
| `runtime/streamController.js` | 流控、合并节流、中止等 |
| `runtime/providerRouter.js` | 给定模型 ID → 选定 provider/API Key/Base URL（及工具能力语义） |
| `runtime/toolLoop.js` | 模型产出 `tool_calls` 后：逐个执行、`onToolEvent` 推送、归档与截断摘要、超限保护 |
| `tool_loader.js` | 工具注册与实际执行入口（`oct-gateway/tools/` 下为各工具模块） |
| `gateway/router.js` | **`chat.send`** 走聊天或 Slash；**`sessions.list`** 等走 session |
| `gateway/slash.js` | `/` 命令与系统指令 |
| `transport/ws.js` | WebSocket server、鉴权钩子、分发到上层 `onAuthenticatedMessage` |
| `transport/http.js`、`transport/httpRoutes.js` | HTTP 端口上的健康/管理能力等 |

---

## 消息流转（网关视角）

1. 客户端发起 **`type: req, method: chat.send`**（经 WS 鉴权链路），`transport` 交由 **`handleTransportMessage`** / **`gateway/router`**。
2. **`orchestrator.dispatch`**：若命中专职 Agent「短路」，直接拼装回复并经 `connection.send` 推送 `chat`/`tool`/`agent-phase` 等事件，**跳过**下文主 `streamChat`。
3. 否则 **`runtime/contextBuilder`** 拉取会话、附件与工作台上下文并生成 `messages`。
4. **`runtime/chatEngine.execute`**：`ai.js` **`streamChat`** 驱动模型流式输出；产出 delta 时对连接发送 **`event: chat`，`payload.delta`**；结束发送 **`payload.text`/`usage`/done**。
5. 途中工具：**`ToolLoop`** 执行工具，`sendToolEvent` 将 **`tool_call`/`tool_result`** 等发往客户端；keepalive（首 token / 工具阶段等）由 `index.js` 内计时器 **`event: keepalive`** 同步。

---

## 支持的 Provider（语义来源）

网关通过 **`config.js` 当前 provider** + **`providers.js`/`runtime/providerRouter.js`** 解析路由。注册表中包含（按 `providers.js` 声明至少涵盖）：  
**阿里云百炼 / 百炼 Coding、DeepSeek、硅基 SiliconFlow、Kimi Moonshot、Groq、OpenAI、Ollama、MiniMax、Google Gemini（Vertex/SDK）、自定义 OpenAI 兼容（custom）。**  
具体可用的 Base URL 与密钥名以各条目 `baseUrl`、`keyEnvVars` 及 `google.profile.json`/`GOOGLE_*` 分项为准。

---

## 工具调用链路（简述）

模型在流中带 **`tool_calls`** → **`runtime/toolLoop.js`** 解析参数 → **`tool_loader.executeTool`** → `oct-gateway/tools/*.js` 或 MCP →  **`tool_result`**（及可选归档/摘要）写回下一轮模型上下文；超过轮次或重复签名则由 ToolLoop **优雅终止**并向用户说明。Canvas/Workbench 类结果可通过 **`onToolEvent`** 侧路推送。

---

## 配置与 API Key：加载优先级（读代码的结论）

加载顺序的起点（先后顺序影响 `process.env`）：

1. Dotenv：项目根的 `.env.local`、`.env`（先后顺序与 `override: false` 见 `config.js`）。
2. 合并后的 **`_fileConfig`**：按路径列表寻找第一个存在的 **`config.json`**（Electron `userData`、`OCT_GATEWAY`/项目内 `oct-gateway/config.json` 等）。
3. **`google.profile.json`** 等分项里 **允许的 `GOOGLE_*` 键**（空字符串不写回，避免占位覆盖）。
4. **`~/.openclaw/openclaw.json`** 中的兼容字段（legacy）。
5. 出站 **`HTTPS_PROXY`/`HTTP_PROXY`**：**用户配置文件中的值优先**写回 `process.env`，再回落到环境里已有值（见源码注释）。

单行键读取：**`getEnvOrConfig`** = **`config.json`** 同名字段 **`>`** **`process.env`** **`>`** **legacy**。  
密钥解析在 **`getProviderConfig()`** 中又按 **`providers.js` 里的 `keyEnvVars`**、`pickKey`、`siliconflow`/`moonshot` 特例分支处理；与设置面板保存的路径一致时需参考实际 `preset`。

---

## 高风险区域（改动前建议通读）

- **`ai.js`**：`streamChat`、多厂商分支、Thinking/原生 Google、与 **`ToolLoop`** 的耦合。
- **`runtime/toolLoop.js`**：递归轮次上限、超时、事件形状与归档。
- **`config.js`** / **`providers.js`**：Provider 选择与 Key 推导；一处改动易出现「能连但不能调工具」或错模。
- **`index.js`** 中 **`handleChatRequest`**：keepalive、取消、Orchestrator 短路与主链路分支。
- **代理与 Google**：全局 fetch 代理 shim（`index.js`）、Gemini **`x-goog-api-key`/代理重复鉴权** 等环境与 Header 惯例（参阅 `AGENTS.md` 备忘）。

---

*本文仅描述结构与路径；行为以运行时源码为准。*
