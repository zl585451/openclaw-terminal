# 1.1 Gateway WebSocket 服务器

| 项目 | 内容 |
|------|------|
| 做什么 | 接收前端消息，转发给 AI，返回流式回复 |
| 文件 | `oct-gateway/index.js` |
| 调用链 | 前端 WebSocket → index.js 收到消息 → ai.js streamChat → 流式返回前端 |
| 验证 | 打开 OCT 界面，发消息能收到回复 |
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
| 做什么 | 启动时从 Nocturne 加载记忆 + 本地 MD 文件拼接成 system prompt |
| 文件 | `oct-gateway/ai.js` → `loadSystemPrompt()` |
| 调用链 | Gateway 启动 → loadSystemPrompt(PROMPTS_DIR) → 尝试 Nocturne loadBootMemory → 失败则读本地 SOUL.md/AGENTS.md/USER.md/MEMORY.md |
| 写到哪 | 同步写回 `MEMORY.md`（让文件和 Nocturne 保持一致） |
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

# 1.6 Nocturne 记忆后端

| 项目 | 内容 |
|------|------|
| 做什么 | Python FastAPI 服务，SQLite 存储，提供记忆的增删改查 |
| 文件 | `oct-gateway/memory.js`（JS 客户端），`nocturne_memory/`（Python 后端） |
| 调用链 | memory.js → HTTP 请求 → 127.0.0.1:8000 → SQLite |
| 启动 | Electron main.ts spawn Python 进程 |
| 健康检查 | `memory.isAlive()` → GET /health → 200 则在线 |
| 已知问题 | 曾频繁掉线（2026-03-16 已修复 Electron 启动逻辑） |
| 验证 | `/memory status` 或 `/status` 看 Nocturne 是否 ✅ |
| 状态 | ⚠️ 偶尔掉线（是所有记忆功能的基础，掉了全失效） |
