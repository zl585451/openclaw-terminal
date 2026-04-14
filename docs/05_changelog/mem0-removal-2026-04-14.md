# mem0 动态记忆系统移除

> Date: 2026-04-14  
> Type: removal

## 变更内容

完整移除 mem0 动态记忆子系统，恢复为纯 Nocturne 记忆链路。

## 已删除文件

| 文件 | 说明 |
|---|---|
| `resources/mem0_service/` | Python FastAPI 服务（含 server.py、requirements.txt、qdrant 数据目录）|
| `oct-gateway/mem0_client.js` | Node.js HTTP 客户端 |
| `oct-gateway/tools/mem0_search.js` | AI 工具：语义搜索记忆 |
| `oct-gateway/tools/mem0_delete.js` | AI 工具：删除记忆 |

## 已修改文件

| 文件 | 变更 |
|---|---|
| `oct-gateway/index.js` | 移除 mem0Client require、postProcessor/contextBuilder 构造参数 |
| `oct-gateway/services/postProcessor.js` | 移除 `_shouldExtractMemory`、`_extractMemoryWithFallback`；process() 直接走 nocturneQueue |
| `oct-gateway/runtime/contextBuilder.js` | 移除双轨并行搜索，`_buildContextMemory` 改为纯 Nocturne 关键词搜索 |
| `src/ui/settings/tabs/MemoryTabView.tsx` | 移除 Mem0 设置区块（API Key 输入、状态 badge、记忆查看器）|
| `src/components/LogPanel.tsx` | 移除 mem0 日志分类与解析规则 |
| `electron/main.ts` | 移除 `getMem0ServicePath()`、`startMem0Service()`、`mem0ServiceProcess` 变量及全部 cleanup 代码 |

## 已归档文档

- `docs/02_architecture/mem0-dynamic-memory.md` → `docs/_archive/mem0-dynamic-memory.md`

## 影响

- 记忆提取链路：postProcessor 直接 enqueue 到 nocturneQueue → `extractAndSaveMemory`
- 上下文构建：contextBuilder 单轨 Nocturne 关键词搜索，不再有 Mem0 语义搜索
- 不再自动启动 Python 8002 端口服务，不再依赖 SiliconFlow API Key
