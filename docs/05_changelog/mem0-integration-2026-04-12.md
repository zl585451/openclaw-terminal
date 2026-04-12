# Mem0 动态记忆集成 — 2026-04-12

## 背景

Nocturne 记忆系统存在根本性缺陷：
- 存储对话片段而非结构化事实，导致大量"垃圾记忆"
- 关键词搜索命中率低，AI 靠猜回答
- 已修复 priority 过滤 Bug + 子节点 URI 读取 Bug，但架构层面问题未解决

## 方案

**双轨并行记忆架构**：Nocturne 管身份（boot memory），Mem0 管动态记忆（对话事实）。

- LLM 提取：DashScope `qwen-plus`（复用用户已有 API Key）
- Embedding：DashScope `text-embedding-v3`，1024 维，中文优化
- 向量存储：Qdrant 本地磁盘模式（`userData/mem0_qdrant/`，跨重启保留）
- 端口：8002（Mem0 服务），8000（Nocturne 不变）

## 变更文件

### 新建
| 文件 | 说明 |
|------|------|
| `resources/mem0_service/requirements.txt` | Python 依赖（mem0ai, fastapi, uvicorn, qdrant-client） |
| `resources/mem0_service/server.py` | FastAPI 服务，端口 8002，端点：/health /add /search /get_all |
| `oct-gateway/mem0_client.js` | Node.js HTTP 客户端，带 5s 健康缓存，所有方法静默降级 |

### 修改
| 文件 | 变更摘要 |
|------|----------|
| `electron/main.ts` | 新增 `getMem0ServicePath()` + `startMem0Service()`，app.whenReady() 中启动，两处进程清理 |
| `oct-gateway/index.js` | require mem0_client，注入 postProcessor 和 contextBuilder |
| `oct-gateway/services/postProcessor.js` | 新增 `_extractMemoryWithFallback()`，extractAndSaveMemory 路由到 Mem0（不可用时降级 Nocturne） |
| `oct-gateway/runtime/contextBuilder.js` | `_buildContextMemory()` 双轨并行：Nocturne 关键词 + Mem0 语义，合并结果（Mem0 优先，score≥0.3） |

## 降级策略

- Mem0 服务未启动 → 自动走 Nocturne 原有路径，对话不中断
- Mem0 addMemory 失败 → 回退到 nocturneQueue.extractAndSaveMemory
- DASHSCOPE_API_KEY 未设置 → 服务启动但 /health 返回 ok=false，mem0Client.isAlive() 返回 false

## 验证步骤

```bash
# 1. 手动安装依赖（首次）
pip install -r resources/mem0_service/requirements.txt

# 2. 手动测试服务
set DASHSCOPE_API_KEY=xxx
python resources/mem0_service/server.py

# 3. 验证健康
curl http://127.0.0.1:8002/health
# 预期: { "ok": true, "mem0_ready": true }

# 4. 写入测试
curl -X POST http://127.0.0.1:8002/add \
  -H "Content-Type: application/json" \
  -d '{"user_message":"我喜欢简洁的回复","assistant_reply":"好的","user_id":"my_user"}'

# 5. 搜索测试
curl -X POST http://127.0.0.1:8002/search \
  -H "Content-Type: application/json" \
  -d '{"query":"回复偏好","user_id":"my_user","limit":3}'
# 预期 score > 0.3 的结果包含"简洁"
```

## 注意事项

- 首次 `pip install mem0ai + qdrant-client` 约 200MB，后续即时
- Qdrant 磁盘数据写入 `userData/mem0_qdrant/`，跨重启保留
- DashScope Embedding 费用极低（约 0.0007 元/千字）
- contextBuilder selectForInjection limit 从 4→5，maxChars 从 700→800（扩容以容纳 Mem0 结果）
