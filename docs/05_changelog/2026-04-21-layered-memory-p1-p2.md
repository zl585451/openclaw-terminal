# 2026-04-21 分层记忆 P1/P2

- 新增 L2/L1/L0 摘要生成器：`/summary daily`、`/summary weekly`、`/summary monthly`。
- 新增摘要调度器：按 `config.memory.summarizer.schedule` 自动生成日/周/月摘要。
- Gateway 启动时会把最近日/周/月摘要注入启动记忆，写回 `MEMORY.md`。
- 新增 `memory_recall` 工具，可按日期和关键词检索 L3 原始对话日志。
