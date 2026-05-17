# 1.1 Gateway WebSocket 服务器

| 项目 | 内容 |
|------|------|
| 做什么 | 接收前端消息，转发给 AI，返回流式回复 |
| 文件 | `oct-gateway/index.js` |
| 调用链 | 前端 WebSocket → index.js 收到消息 → **orchestrator.dispatch** → ai.js streamChat → 流式返回前端 |
| 验证 | 打开 OCT 界面，发消息能收到回复 |
| 状态 | ✅ 正常 |
| 保活 | `oct-gateway/transport/ws.js` 握手成功后约每 **25s** 服务端 **ping**，降低长任务期间客户端 pong 超时导致 **1006** 的概率 |

---

## 1.0 Electron 托管 Gateway 与断连语义

| 项目 | 内容 |
|------|------|
| 做什么 | 区分 **OCT Gateway 子进程退出** 与 **仅 WebSocket 断连**（对端仍监听端口等） |
| 文件 | `electron/main.ts`（`octGatewayProcess.on('exit')`、`suppressAutoReconnect`、`expectOctGatewayProcessExit`） |
| 行为 | 非预期子进程退出：`suppressAutoReconnect = true`，连接日志提示手动启动/重启 Gateway，并向渲染进程发送 `gateway-status`（`managed: true`、`processExit: true`、`exitCode`）。主动 `stop-gateway` / `gateway-restart` / 退出应用前 kill 等路径置 `expectOctGatewayProcessExit`，避免误判为崩溃 |
| 验证 | 手动结束 Gateway 进程后，连接日志不应再无限次无意义自动重连；点击「启动 Gateway」后应恢复连接 |

---

# 1.1.1 连接握手（OCT 协议）

| 项目 | 内容 |
|------|------|
| 协议 | OCT 自有协议，仅验证 token，无 ECDSA 签名 |
| 握手格式 | `params.auth.token` 或 `params.token`，`params.client: { id, version, mode }` |
| 文件 | `electron/main.ts` → `sendOctConnectRequest()`，`oct-gateway/index.js` connect 处理 |
| 验证 | 前端点击「重连」→ 日志显示 `[OCT] 已发送 connect 请求` → `[OCT] 认证成功，已连接` |
| 状态 | ✅ 正常 |

---

# 1.1.2 Orchestrator 意图分类

| 项目 | 内容 |
|------|------|
| 做什么 | 分析用户消息意图，派发后台任务，预留 Agent 路由扩展点 |
| 文件 | `oct-gateway/orchestrator.js` |
| 调用链 | chat.send → orchestrator.dispatch() → 意图分析 + tryDispatchAsTask → 返回分析结果 |
| 特性 | 关键词匹配（code/write/research）、后台任务触发词（帮我搜/查一下/搜索一下等） |
| 工具执行 | `exec_command` 使用异步 `child_process.exec`，避免同步 `execSync` 阻塞事件循环导致 WS 心跳停滞 |
| 状态 | ✅ 正常 |

---

# 1.1.3 后台任务队列

| 项目 | 内容 |
|------|------|
| 做什么 | AMY 派发任务给 Worker 异步执行，主对话不中断 |
| 文件 | `oct-gateway/task_queue.js`、`oct-gateway/worker.js` |
| 持久化 | `tasks_runtime.json` |
| 超时 | 60 秒，失败/超时状态可被 AMY 在下次对话中获知 |
| 调用链 | orchestrator.tryDispatchAsTask → taskQueue.createTask → worker.dispatch → toolLoader.executeTool |
| 触发词 | 帮我搜/查一下/搜索一下/**查邮件/查验证码/查一下邮件**等 |
| 状态 | ✅ 正常 |

---

# 1.1.4 HTTP 工具端口（保险箱 /tool）

| 项目 | 内容 |
|------|------|
| 端口 | 18790（PORT+1） |
| 用途 | 前端 VaultPanel、IPC invoke-gateway-tool 调用工具 |
| 接口 | POST /tool、GET /health |
| 调用链 | Electron main → fetch 127.0.0.1:18790/tool → tool_loader.executeTool |
| 状态 | ✅ 正常 |

---

# 1.2 AI 对话引擎

| 项目 | 内容 |
|------|------|
| 做什么 | 调用阿里云百炼/DeepSeek API，处理流式响应和工具调用 |
| 文件 | `oct-gateway/ai.js` |
| 调用链 | streamChat() → fetch 百炼 API → 解析 SSE → onDelta/onDone 回调 |
| 依赖 | config.js（API Key、模型 ID、Base URL） |
| 特性 | 百炼失败时自动 fallback 到 DeepSeek |
| 验证 | 终端看到 `[Gateway] Stream done` |
| 状态 | ✅ 正常 |

---

# 1.3 System Prompt 加载

| 项目 | 内容 |
|------|------|
| 做什么 | 启动时从 Memory v2 加载记忆 + 本地 MD 文件拼接成 system prompt |
| 文件 | `oct-gateway/ai.js` → `loadSystemPrompt()` |
| 调用链 | Gateway 启动 → loadSystemPrompt(PROMPTS_DIR) → Memory v2 loadBootMemory → 不足时再读本地 SOUL.md/AGENTS.md/USER.md/MEMORY.md |
| 写到哪 | 同步写回 `MEMORY.md`（让文件和本地记忆保持一致） |
| 验证 | 终端看到 `[AI] System prompt 加载完成，长度：XXXX` |
| 状态 | ✅ 正常 |

---

# 1.4 会话管理

| 项目 | 内容 |
|------|------|
| 做什么 | 维护对话历史，支持多会话、重置 |
| 文件 | `oct-gateway/session.js` |
| 调用链 | 每条消息 → session.addMessage() → 历史数组 |
| 验证 | `/status` 显示当前会话消息条数 |
| 状态 | ✅ 正常 |

---

# 1.5 配置系统

| 项目 | 内容 |
|------|------|
| 做什么 | 加载 API Key、模型、记忆配置、图片分析配置 |
| 文件 | `oct-gateway/config.js` |
| 数据源 | `.env` > `config.json` > `~/.openclaw/openclaw.json` > 默认值 |
| 关键配置 | `memory.auto_save_history`、`memory.auto_save_feedback`、`memory.load_feedback_on_boot` |
| 验证 | 终端看到 `[Config] Model: xxx` |
| 状态 | ✅ 正常 |

---

# 1.6 Memory v2 记忆后端

| 项目 | 内容 |
|------|------|
| 做什么 | 本地文件后端，负责 notes / raw turns / summaries 的读写与搜索 |
| 文件 | `oct-gateway/memory.js`（门面），`oct-gateway/memory_v2_store.js`（本地文件后端） |
| 调用链 | memory.js → memory_v2_store.js → `~/.openclaw/memory/*` |
| 启动 | Gateway 启动即就绪，无需额外后端进程 |
| 健康检查 | `memory.isAlive()` 固定返回可用，异常主要来自本地文件 IO |
| 已知问题 | 当前无额外服务依赖，重点关注 raw-turn 清理与向量回填质量 |
| 验证 | `/memory status` 或 `/status` 看 Memory v2 是否 ✅ |
| 状态 | ✅ 默认主链 |

---

> **最后更新**：2026-03-24（OCT 握手、Orchestrator、后台任务、HTTP 工具端口）
