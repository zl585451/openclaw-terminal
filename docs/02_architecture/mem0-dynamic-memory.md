# Mem0 动态记忆服务

> **创建日期**：2026-04-12 | **状态**：✅ 已集成（双轨并行架构）

---

## 定位

Mem0 负责「动态记忆」——从每轮对话中自动提取结构化事实，用语义向量搜索召回。  
Nocturne 继续负责「身份记忆」——boot 时加载的 agent/identity、my_user/profile 等固定节点。

## 架构

```
对话结束（postProcessor）
  ├─ Mem0 可用 → mem0Client.addMemory(userMsg, reply)
  │               → DeepSeek-V3 (SiliconFlow) 提取事实（中文自定义 prompt）
  │               → BAAI/bge-m3 (SiliconFlow) 向量化
  │               → Qdrant 磁盘持久化存储
  └─ Mem0 不可用 → nocturneQueue.extractAndSaveMemory（原路径）

构建上下文（contextBuilder._buildContextMemory）
  ├─ Nocturne 关键词搜索（memorySearch.searchMemory）   ─┐
  └─ Mem0 语义搜索（mem0Client.searchMemory）           ─┴─→ 合并 → 注入 [相关记忆]
```

## 文件清单

| 文件 | 职责 |
|------|------|
| `resources/mem0_service/server.py` | Python FastAPI 服务，port 8002 |
| `resources/mem0_service/requirements.txt` | Python 依赖 |
| `oct-gateway/mem0_client.js` | Node.js HTTP 客户端 |
| `electron/main.ts` `startMem0Service()` | Electron 自动启动 |
| `oct-gateway/services/postProcessor.js` `_extractMemoryWithFallback()` | 写入路由 |
| `oct-gateway/runtime/contextBuilder.js` `_buildContextMemory()` | 双轨并行搜索 |

## 配置

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `MEM0_LLM_API_KEY` | LLM API Key（SiliconFlow 或其他 OpenAI 兼容） | — |
| `MEM0_LLM_BASE_URL` | LLM base URL | `https://api.siliconflow.cn/v1` |
| `MEM0_LLM_MODEL` | 事实提取模型 | `deepseek-ai/DeepSeek-V3` |
| `MEM0_EMBED_API_KEY` | Embedding API Key | — |
| `MEM0_EMBED_BASE_URL` | Embedding base URL | `https://api.siliconflow.cn/v1` |
| `MEM0_EMBED_MODEL` | Embedding 模型 | `BAAI/bge-m3` |
| `MEM0_EMBED_DIMS` | 向量维度 | `1024` |
| `MEM0_DATA_DIR` | Qdrant 磁盘存储路径 | `userData/mem0_qdrant/` |
| `MEM0_PORT` | 服务端口 | `8002` |

## 中文支持方案

mem0 默认使用纯英文 extraction prompt，对中文对话提取 0 事实（已知问题）。

**解决方案（双保险）：**

1. **路径1（主）**：调用 `mem0.add(messages, prompt=中文prompt)` 传入自定义中文提取指令，覆盖默认英文 prompt。mem0 官方支持此参数。
2. **路径2（兜底）**：若 LLM 提取仍返回 0 事实，启动规则提取——把用户消息中的「我」替换为「用户」，按标点拆句，直接写入 Qdrant vector store（零 LLM 调用，零费用）。

**注意**：Windows PowerShell 测试时须先执行 `chcp 65001` + `$OutputEncoding = [System.Text.Encoding]::UTF8`，否则中文会变成 `?`。生产环境（Electron/Node.js）默认 UTF-8，无此问题。

## 合并规则

1. Mem0 结果优先（语义质量高），`score < 0.45` 过滤
2. Nocturne 结果补充（身份/偏好结构化数据）
3. 文本 snippet 去重（避免同一事实注入两次）
4. 今日历史对话最后追加
5. selectForInjection limit=5（recall 模式 7），maxChars=800（recall 1100）

## 降级

任何环节失败均静默回退到 Nocturne，不影响对话流程。

## 端点

```
GET  /health         → { ok, mem0_ready, error?, data_dir }
POST /add            → { user_message, assistant_reply, user_id? }
POST /search         → { query, user_id?, limit? }
GET  /get_all?user_id= → 调试用，返回所有记忆
```
