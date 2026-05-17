# 分层记忆系统

OCT 记忆系统现在默认且主线只使用 Memory v2 本地文件后端。

## 默认存储

Memory v2 位于 `~/.openclaw/memory`，由 `oct-gateway/memory_v2_store.js` 管理，并继续兼容 `core://...` URI：

- L3 原始层：`turns/YYYY-MM-DD.jsonl`，逻辑 URI 为 `core://logs/raw/YYYY-MM-DD/T时间-序号`。
- L2 日摘要：`summaries/daily/YYYY-MM-DD.json`，逻辑 URI 为 `core://logs/summary/daily/YYYY-MM-DD`。
- L1 周摘要：`summaries/weekly/YYYY-Www.json`。
- L0 月摘要：`summaries/monthly/YYYY-MM.json`。
- 显式长期记忆：`notes/<domain>/<path>.md`，对应 `core://my_user/...`、`core://agent/...` 等 URI。
- 去重索引：`indexes/raw_dedupe.json`。

`oct-gateway/memory.js` 是兼容门面：当前主线把 read/write/search/boot-load 都转到 Memory v2。

## 启动链路

Gateway 启动时：

1. `ai.js#loadSystemPrompt()` 从 Memory v2 读取核心 notes 和最近日/周/月摘要。
2. `runtime/contextBuilder.js` 构建每轮上下文时，先走关键词记忆搜索，再按需要追加近期 raw turns。
3. 如果启用了向量召回，`memory_vector/recaller.js` 会生成临时 system 注入。
4. 记忆相关链路不再依赖额外记忆服务启动。

## 写入链路

每轮对话结束后，`services/postProcessor.js` 调用 `memory_raw_log.saveRawTurn()`。默认行为：

- 原文整轮写入 Memory v2 JSONL。
- 通过 dedupeKey 避免同一轮重复写入。
- 如果 `memory.vectorRecall.enabled` 为 true，按 `memory.vectorRecall.write.mode` 决定是否写入向量库。

向量写入默认 `selective`，只索引有长期回忆价值的轮次：明确记忆/决策/项目/架构/调研信号、使用工具或附件、较长上下文等。`mode = "all"` 可恢复旧的全量写入，`mode = "off"` 可关闭向量写入。

## 摘要链路

摘要生成仍由 `oct-gateway/summarizer/` 负责。调度器除了原有定时点外，启动后会补跑一次昨天的日摘要：如果昨天有 raw turns 但没有 daily summary，就自动生成，避免应用未在凌晨 4 点运行时摘要永远缺席。

## 当前结论

产品主链已经不再依赖旧记忆后端。当前保留的少量兼容逻辑仅用于过渡期代码整理，不属于默认运行链路。
