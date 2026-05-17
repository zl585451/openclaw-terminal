# 分层记忆命令与工具

## Slash Commands

- `/summary daily YYYY-MM-DD`：读取当天 L3 raw turns 并生成 L2 日摘要。
- `/summary weekly YYYY-Www`：读取该周日摘要并生成 L1 周摘要。
- `/summary monthly YYYY-MM`：读取该月覆盖周摘要并生成 L0 月摘要。
- `/recall test <文本>`：测试 embedding API 是否可用。
- `/recall status`：查看本地向量库状态。
- `/recall query <文本>`：手动执行语义召回。
- `/recall backfill [YYYY-MM-DD|retry]`：从 L3 raw turns 回填向量。

## Memory Tools

- `memory_read`：读取 Memory v2/legacy 记忆节点，支持 `core://...`。
- `memory_write`：写入或更新 Memory v2/legacy 记忆节点。默认写到 `~/.openclaw/memory/notes/<domain>/<path>.md`。
- `memory_search`：按关键词搜索显式 notes 和近 30 天 raw-turn 文本候选。
- `memory_vector_search`：按语义搜索向量库中的历史对话片段。
- `memory_recall`：按日期检索原始对话日志。

## Memory v2 配置

关键配置位于 `memory`：

- `backend`：默认 `file`，当前主链仅使用本地 Memory v2 文件后端。
- `root`：Memory v2 根目录；默认 `~/.openclaw/memory`。
- `auto_save_feedback`：默认 `false`。
- `load_feedback_on_boot`：默认 `false`。

向量写入配置位于 `memory.vectorRecall.write`：

- `mode`：默认 `selective`；可选 `selective`、`all`、`off`。
- `minUserChars`：精选写入的最小用户文本长度参考值。
- `assistantPreviewChars`：写入 embedding text 时保留的 AMY 回复预览长度。

## P3 语义召回

启用 `memory.vectorRecall.enabled` 后，L3 raw turn 写入成功会按精选策略异步生成 embedding 并保存到本地 sqlite-vec 数据库。

自动召回与手动查询使用不同策略：

- 自动召回：严格门控，只注入高置信整轮历史，避免污染当前闲聊。
- 手动查询：`/recall query` 和 `memory_vector_search` 使用更宽阈值，允许探索低置信候选。
- 手动查询结果里的低置信/文本候选只适合核对，不应直接当作确定记忆。

关键召回配置位于 `memory.vectorRecall.recall`：

- `autoThreshold`：自动注入基础阈值。
- `strongThreshold`：强命中阈值，达到后可直接进入自动候选。
- `recallIntentThreshold`：用户有明确回忆意图时的阈值。
- `manualThreshold`：手动查询阈值。
- `minLexicalOverlap`：自动注入所需关键词重叠比例。
- `candidateTopK`：自动召回第一阶段候选数量。

## `memory_recall` 参数

- `date`：必填，`YYYY-MM-DD`。
- `keyword`：可选，按用户消息和助手回复文本做包含匹配。
- `limit`：可选，默认 5，最大 20。

返回：

- `turns[].uri`
- `turns[].ts`
- `turns[].user`
- `turns[].assistant`
- `turns[].tools`
