# 第四层：记忆搜索与启动加载

## 4.1 关键词搜索

| 项目 | 内容 |
|------|------|
| 默认后端 | Memory v2 本地文件 |
| 文件 | `oct-gateway/memory_search.js`、`oct-gateway/memory_v2_store.js` |
| 调用链 | `/memory search 关键词` 或 `memory_search` 工具 -> Memory v2 notes/raw-turn 搜索 -> 返回候选内容 |
| 缓存 | Memory v2 直接搜索 notes/raw turns，不依赖 glossary |
| 状态 | 默认可用 |

Memory v2 的搜索范围：

- `notes/<domain>/.../*.md`：显式长期记忆、规则、偏好、项目事实。
- `turns/YYYY-MM-DD.jsonl`：近 30 天 raw turns 的轻量文本候选。

当前实现直接走 Memory v2 的本地 notes 与 raw turn 搜索。

## 4.2 语义与日期搜索

显式工具 `memory_search` 是统一检索入口：

- `mode=keyword` 查显式 notes 和轻量 raw-turn 文本候选。
- `mode=vector` 查 embedding 后的历史对话内容，适合“之前关于这个主题聊过什么”这类问题。
- `mode=date` 按 `YYYY-MM-DD` 检索原始对话日志，可配合 `keyword` 过滤。
- 自动向量注入只接受高置信整轮历史；手动工具可以返回低置信候选，但 AMY 必须先核对再使用。

旧的 `memory_vector_search` / `memory_recall` 名称只作为兼容别名保留，不再作为模型可选工具暴露。

## 4.3 启动加载

Gateway 启动时，`ai.js#loadSystemPrompt()` 会读取：

- Memory v2 notes 中的核心 URI，如 `core://agent/identity`、`core://my_user/profile`。
- 最近日/周/月摘要。
- 追问偏好。

反馈启动加载链路已删除；Gateway 启动时不再注入最近反馈记录。

## 4.4 历史清理

`memory_history.cleanupOldHistory()` 现在仅保留兼容壳。Memory v2 的 raw turns 按日期 JSONL 分片保存，后续清理策略应直接删除超过保留期的日期文件。
