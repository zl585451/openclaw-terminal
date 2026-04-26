# AI.library 与 OCT 集成指南

> **最后更新**：2026-04-26 | **状态**：✅ 已集成（P0+P1+P2 + 书库 Phase 1 内嵌与 userData 数据根）

---

## 内嵌源码与数据目录（书库 Phase 1）

OCT 仓库内提供 **`resources/ai_library/`**（`api_server.py`、`audio_knowledge_base.py` 等）。Electron 在用户 **未** 配置 `OCT_AI_LIBRARY_PATH` 时，若该目录存在 `api_server.py`，则自动将其作为启动 **cwd**。

运行时的向量库、SQLite、文档扫描目录等 **不再默认写入** `resources/ai_library/data/`，而是由主进程在 spawn 子进程时注入：

| 环境变量 | 值 | 说明 |
|----------|-----|------|
| `AI_LIBRARY_DATA_ROOT` | `%APPDATA%/…/userData/ai_library_data`（macOS/Linux 为对应 userData） | Chroma、SQLite、QA JSON、`library/` 子目录等均在此之下 |
| `AI_LIBRARY_DOCS_ROOT` | `ai_library_data/documents` | 与旧版「论文 documents」语义一致，独立于源码树 |

仍可通过在 shell 中导出上述变量，在未经 OCT 启动时本地调试 Python 服务。

**CORS**：`api_server.py` 已允许 OCT 前端开发端口 **5176**。

---

## 端口约定

| 服务 | 默认端口 |
|------|----------|
| Nocturne 记忆 | **8000** |
| AI.library 知识库 | **8001** |

二者互不占用，可并行。

---

## 方式 A：在 OCT 设置里启用（推荐）

1. 打开 **设置 → 记忆** 标签页。
2. 找到 **AI.library 知识库（插件）**。
3. 勾选 **随 OCT 自动启动**；**项目根目录**可留空——若仓库内已有 `resources/ai_library/api_server.py`，将自动使用内嵌目录。仍填写外部路径（如 `E:\AI.library`）时以外部目录为准。端口保持 **8001**（或与 `api_server.py` 中一致）。
4. 点击 **保存并应用**（会重启 Gateway 以注入 `AI_LIBRARY_URL`）。

关闭 OCT 时，由 OCT 拉起的 AI.library 子进程会一并结束。

---

## 方式 B：Gateway config.json 配置（P1）

在 `oct-gateway/config.json` 中添加 `ai_library` 配置节：

```json
{
  "ai_library": {
    "enabled": true,
    "url": "http://127.0.0.1:8001",
    "timeout_ms": 3000,
    "default_top_k": 3
  }
}
```

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `enabled` | 是否启用知识库检索 | `true` |
| `url` | AI.library API 地址 | `http://127.0.0.1:8001` |
| `timeout_ms` | 搜索超时时间（毫秒） | `3000` |
| `default_top_k` | 默认返回结果数量 | `3` |

---

## 方式 C：环境变量 / Electron config

写入用户数据目录下的 `config.json`（与 `OPENCLAW_WS_URL` 同级），例如：

```json
{
  "OCT_AI_LIBRARY_AUTO_START": true,
  "OCT_AI_LIBRARY_PATH": "E:\\\\AI.library",
  "OCT_AI_LIBRARY_PORT": 8001
}
```

或在项目根 `.env`：

```env
OCT_AI_LIBRARY_AUTO_START=1
OCT_AI_LIBRARY_PATH=E:\AI.library
OCT_AI_LIBRARY_PORT=8001
```

若已设置 `AI_LIBRARY_URL`，将优先使用该地址。

---

## Gateway 集成

### 知识检索工具：search_knowledge

| 项目 | 内容 |
|------|------|
| 文件 | `oct-gateway/tools.js`、`oct-gateway/tools/ai_library.js` |
| 触发 | AI 模型在用户询问音频/混音/母带/录音/声学等问题时自动调用 |
| 参数 | `query`（必填）、`top_k`（可选，默认 3） |
| 返回 | `{ success, results, formatted, hint? }` |

### 调用链

```
用户消息 → Gateway(ai.js) → 模型返回 tool_calls
  → executeTool("search_knowledge", { query, top_k })
  → aiLibrary.searchKnowledge() → HTTP POST /api/search
  → 结果作为 tool message 拼回 messages → 模型生成最终回答
```

### 上下文注入

除工具调用外，Gateway 在发送每条用户消息前，会主动调用 `searchKnowledge` 并将结果注入系统 prompt 的 `[相关知识库]` 段落，供模型参考。未启动时静默跳过，不影响对话。

---

## 状态检查

- **`/status` 命令**：显示 `📚 AI.library：✅ 在线` 或 `📚 AI.library：⚫ 未启动`
- **健康检查**：`aiLibrary.checkHealth()` 调用 `http://127.0.0.1:8001/health`

---

## P2 体验优化（2026-03-21）

### 搜索结果格式

| 字段 | 说明 |
|------|------|
| `sourceDisplay` | 来源文件名，PDF 自动加 📄 图标 |
| `contentSnippet` | 超过 100 字自动截断 + "..." |
| `scorePercent` | 相似度百分比（0.89 → 89%） |
| `content` | 完整内容（供展开） |

### 错误提示（友好 emoji）

| 情况 | 提示 |
|------|------|
| 超时 | ⏱️ 搜索超时，图书馆响应太慢 |
| 空结果 | 📚 没找到相关内容，换个词试试？ |
| 服务离线 | 📚 AI.library 未启动，请先运行 api_server.py |
| 网络错误 | 📚 连接图书馆失败，请检查服务状态 |

### 缓存机制

- **内存缓存**：最近 10 次查询，5 分钟 TTL
- **Key**：`query + top_k`
- **清空**：`aiLibrary.clearCache()` 可手动清空缓存

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `resources/ai_library/` | 内嵌 AI.library 源码；运行时数据见 userData `ai_library_data/` |
| `electron/main.ts` | 解析内嵌路径、`AI_LIBRARY_*` 子进程环境变量 |
| `oct-gateway/config.js` | ai_library 配置加载 |
| `oct-gateway/tools/ai_library.js` | 检索模块、缓存、错误处理 |
| `oct-gateway/tools.js` | search_knowledge 工具注册与执行 |
| `oct-gateway/index.js` | 上下文注入、/status 状态显示 |
