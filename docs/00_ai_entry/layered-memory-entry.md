# AI 入口：分层记忆

Gateway 启动时，`ai.js#loadSystemPrompt()` 先通过 `memory.js` 门面加载记忆。当前主链固定指向 Memory v2 本地文件后端。

注入顺序：

1. Memory v2 核心 notes：`core://agent/identity`、`core://my_user/profile` 等。
2. 追问偏好。
3. 最近日/周/月摘要。
4. 每轮运行时的相关记忆候选。
5. 向量召回命中时的临时 system 注入。

每轮对话结束后，`services/postProcessor.js` 会写入 L3 raw turn。默认写入 `~/.openclaw/memory/turns/YYYY-MM-DD.jsonl`，因此本地记忆不依赖额外后端进程。

当用户询问摘要未覆盖的历史细节时，AMY 可调用：

- `memory_search`：统一查显式 notes、raw-turn 文本候选、语义向量候选和指定日期原始对话；用 `mode=keyword|vector|date|auto` 区分。
- `memory_read`：按 URI 精确读取 Memory v2/legacy 节点。

旧的 `memory_vector_search` / `memory_recall` 名称只作为兼容别名保留到工具兼容层，不再作为模型可选工具暴露。

自动注入仍然是临时 system 消息，只用于当前轮回答，不进入 session history。AMY 应只在相关时自然使用，不应因为有候选就强行联想。
