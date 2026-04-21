# 分层记忆系统

OCT 记忆系统现在分为四层：

- L3 原始层：每轮对话写入 `core://logs/raw/YYYY-MM-DD/T时间-序号`。
- L2 日摘要：`core://logs/summary/daily/YYYY-MM-DD`。
- L1 周摘要：`core://logs/summary/weekly/YYYY-Www`。
- L0 月摘要：`core://logs/summary/monthly/YYYY-MM`。

Gateway 启动时会读取最近摘要并注入系统提示词。摘要生成由 `oct-gateway/summarizer/` 负责，调度器使用简单 `setInterval`，不依赖额外调度库。

P3 语义召回在 L3 写入后异步生成 embedding，默认保存到 `~/.openclaw/vector_recall/vectors.db`。主对话构建上下文时，`runtime/contextBuilder.js` 调用向量召回器，将 topK 相关历史作为本轮临时 system 消息注入；该注入不进入 session history，避免重复污染上下文。
