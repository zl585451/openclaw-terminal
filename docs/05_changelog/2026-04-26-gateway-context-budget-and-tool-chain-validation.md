# 2026-04-26 Gateway 动态上下文预算与 Tool Chain 校验

本次改动针对长调研任务中常见的两类问题收口：

1. `truncateHistory()` 对不同模型窗口一刀切，预算过于保守。
2. 历史消息被截断后，`assistant.tool_calls` 与对应 `tool` 消息可能失配，触发远端 400。

## 本次调整

- `oct-gateway/ai.js`
  - 移除固定 `MAX_CONTEXT_CHARS`，改为 `getModelContextLimit(model) * 0.4` 的动态预算。
  - 新增 `estimateContentChars()` / `estimateMessageChars()`，兼容 multimodal `content` 数组：
    - `text` 按真实字符数统计
    - `image_url` 按 1500 字符粗估
  - 新增 `validateAndFixMessages()`，在真正发送 `requestBody.messages` 前统一清理：
    - 孤立 `role='tool'`
    - 不完整的 `assistant.tool_calls` 组
  - 被丢弃的消息会打 `debug` 日志，便于后续排查 400。

## 影响

- 长任务会更晚触发上下文裁剪。
- 工具递归路径与 fallback 重入路径都会经过同一层消息校验。
- 远端出现 `messages with role 'tool' must be a response to a preceeding message with 'tool_calls'` 的概率应明显下降。
