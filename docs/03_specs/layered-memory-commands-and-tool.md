# 分层记忆命令与工具

## Slash Commands

- `/summary daily YYYY-MM-DD`：读取当天 L3 原始日志并生成 L2 日摘要。
- `/summary weekly YYYY-Www`：读取该周日摘要并生成 L1 周摘要。
- `/summary monthly YYYY-MM`：读取该月覆盖周摘要并生成 L0 月摘要。
- `/recall test <文本>`：测试 embedding API 是否可用。
- `/recall status`：查看本地向量库状态。
- `/recall query <文本>`：手动执行语义召回。
- `/recall backfill [YYYY-MM-DD|retry]`：从 L3 原始日志回填向量。

## Tool

`memory_recall` 用于按日期检索原始对话日志。

## P3 语义召回

启用 `memory.vectorRecall.enabled` 后，L3 原始日志写入成功会异步生成 embedding 并保存到本地 sqlite-vec 数据库。每轮对话构建上下文时，Gateway 会对用户本轮输入做一次带超时保护的向量召回。

自动召回与手动查询使用不同策略：

- 自动召回：严格门控，只注入高置信整轮历史，避免污染当前闲聊。
- 手动查询：`/recall query` 和 `memory_vector_search` 使用更宽阈值，允许探索低置信候选。
- 手动查询结果里的低置信/文本候选只适合核对，不应直接当作确定记忆。

向量召回配置可在设置面板“记忆系统 → 向量召回配置”中填写，面向普通用户预置百炼和火山两种供应商。

关键配置位于 `memory.vectorRecall.recall`：

- `autoThreshold`：自动注入基础阈值。
- `strongThreshold`：强命中阈值，达到后可直接进入自动候选。
- `recallIntentThreshold`：用户有明确回忆意图时的阈值。
- `manualThreshold`：手动查询阈值。
- `minLexicalOverlap`：自动注入所需关键词重叠比例。
- `candidateTopK`：自动召回第一阶段候选数量。

参数：

- `date`：必填，`YYYY-MM-DD`。
- `keyword`：可选，按用户消息和助手回复文本做包含匹配。
- `limit`：可选，默认 5，最大 20。

返回：

- `turns[].uri`
- `turns[].ts`
- `turns[].user`
- `turns[].assistant`
- `turns[].tools`
