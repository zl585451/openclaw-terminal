# 分层记忆系统

OCT 记忆系统现在分为四层：

- L3 原始层：每轮对话写入 `core://logs/raw/YYYY-MM-DD/T时间-序号`。
- L2 日摘要：`core://logs/summary/daily/YYYY-MM-DD`。
- L1 周摘要：`core://logs/summary/weekly/YYYY-Www`。
- L0 月摘要：`core://logs/summary/monthly/YYYY-MM`。

Gateway 启动时会读取最近摘要并注入系统提示词。摘要生成由 `oct-gateway/summarizer/` 负责，调度器使用简单 `setInterval`，不依赖额外调度库。

P3 语义召回在 L3 写入后异步生成 embedding，默认保存到 `~/.openclaw/vector_recall/vectors.db`。入库粒度是“整轮对话”（用户原文 + AMY 回复摘要），不再按碎片切块，避免召回时失去当时语境。

主对话构建上下文时，`runtime/contextBuilder.js` 调用向量召回器。自动注入采用严格策略：

- 先以较低阈值取候选，再由 `recaller.js` 做二次门控。
- 只有高相似、关键词有重叠，或用户有明确“之前/上次/当时”回忆意图时，才注入少量历史。
- 注入内容是本轮临时 system 消息，不进入 session history。
- 低置信结果不会自动注入，避免闲聊被无关历史污染。

显式查询与自动注入分离：`/recall query` 和 `memory_vector_search` 使用更宽的手动检索阈值，并返回 `confidence` / `lexical_overlap` / `lexical_matches` 供 AMY 或用户核对。
