# Gemini thinking + tool chain 检测规范

## 风险模式

同一条请求链路同时出现以下条件时，按高风险处理：

1. 模型属于 thinking 系列，例如 Gemini 3 / Gemini 2.5 / DeepSeek reasoner / Qwen thinking。
2. 本轮触发了工具调用，且后续请求会追加 `assistant.tool_calls` + `tool` 结果继续续写。
3. 响应里出现 provider 私有状态字段，例如：
   - `reasoning_content`
   - `tool_calls[].extra_content.google.thought_signature`
   - 其他 provider 的 thinking/session/signature 字段
4. 错误发生后准备跨 provider fallback。

这四项叠加时，不能把原始工具历史直接交给另一个 provider。要么完整保留并映射私有状态，要么禁用 thinking/tool 续写，要么停止 fallback 并向用户暴露原始 provider 错误。

## Gemini OpenAI 兼容层要求

Gemini 3 function calling 会在 OpenAI 兼容格式的 `tool_calls[].extra_content.google.thought_signature` 上返回签名。下一轮请求必须把该字段放回同一个 tool call 对象。

并行工具调用时，通常只有第一个 function call 带签名；不要给其它并行调用随意补签名。

顺序工具调用时，同一用户 turn 内每一步模型返回的 function call 签名都必须保留。

## 日志检测

排查相似问题时按顺序看：

1. 第一轮模型响应是否有 `finish_reason=tool_calls`。
2. 解析后的 `toolCalls` 是否包含 `extra_content.google.thought_signature` 或 `reasoning_content`。
3. 工具结果续轮的 `messages` 中，紧邻 `tool` 消息之前的 `assistant.tool_calls` 是否仍保留这些字段。
4. `validateAndFixMessages` 是否丢弃了 assistant/tool 组。
5. 错误是否包含 `thought_signature`、`reasoning_content`、`thinking mode`、`tool_call_id`、`HTTP 429`。
6. 出错后是否进入了跨 provider fallback。

只要第 5 项命中协议或配额错误，第 6 项应停止。

## 续轮收束策略

Google Gemini 工具链默认只允许一次工具探索后进入最终回答：

1. 第 0 轮允许模型选择工具。
2. 第 1 次工具结果回传后，续轮请求仍携带工具定义，但设置 `tool_choice: none`。
3. 如果最终续写仍触发 `429`，网关返回已取得的工具结果摘要，并提示 Vertex 资源耗尽，不跨 provider fallback。

这么做牺牲一部分多步自主检索能力，换取 Google thinking + function calling 链路的稳定性。复杂任务应拆成多个用户 turn，而不是在同一个 turn 内连续消耗 Vertex 配额。

## 回归测试建议

新增 provider 或模型时，至少构造一条离线工具续轮测试：

1. 人工模拟流式 `delta.tool_calls`，包含 provider 私有字段。
2. 执行一次工具结果拼接。
3. 断言续轮 `assistant.tool_calls` 原样保留私有字段。
4. 断言协议错误和 `429` 不进入 fallback。
