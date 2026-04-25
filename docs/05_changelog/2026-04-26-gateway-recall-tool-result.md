# 2026-04-26 Gateway 工具结果归档与回读

本次为 Gateway 工具循环补齐“截断 + 存档 + 按需回读”闭环。

## 本次调整

- `oct-gateway/runtime/toolResultArchive.js`
  - 新增 JSONL 归档模块。
  - 工具完整结果追加写入 `oct-gateway/data/tool_results.jsonl`。
- `oct-gateway/runtime/toolLoop.js`
  - 在把工具结果写入 `messages` 前，先归档完整原文。
  - 对高产出工具结果做截断，避免上下文被单轮工具结果冲爆。
- `oct-gateway/tools/recall_tool_result.js`
  - 新增 `recall_tool_result(callId, maxChars?)` 工具。
  - 模型看到 `callId` 提示后，可以按需回读完整结果。

## 影响

- 长调研任务中，大体量工具结果不再反复堆进上下文。
- Week 0 保持 JSONL 方案，不引入 SQLite；更完整的状态化存储留到后续阶段处理。
