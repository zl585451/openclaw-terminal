# 2026-04-26 ToolLoop Pre-Summarizer Research

## Scope

本简报只调查 `summarizer` 接入 ToolLoop 的兼容点，不修改 `oct-gateway/runtime/toolLoop.js`。

## 1. ToolLoop 入口

主入口：

1. `oct-gateway/runtime/toolLoop.js:6`
   `class ToolLoop`
2. `oct-gateway/runtime/toolLoop.js:23`
   `async handleToolCalls(...)`

实例化位置：

1. `oct-gateway/ai.js:11`
   `const ToolLoop = require('./runtime/toolLoop')`
2. `oct-gateway/ai.js:21`
   `const toolLoop = new ToolLoop(...)`

调用位置：

1. `oct-gateway/ai.js:1931`
   正常 OpenAI-compatible `finish_reason === 'tool_calls'` 时进入 `toolLoop.handleToolCalls(...)`。
2. `oct-gateway/ai.js:2025`
   pseudo tool call 被解析后进入同一个 `toolLoop.handleToolCalls(...)`。

结论：当前 ToolLoop 没有跨多个执行文件拆散，核心接入点集中在 `oct-gateway/runtime/toolLoop.js`。

## 2. 工具结果处理链路

现有链路在 `ToolLoop.handleToolCalls` 内按以下顺序执行：

1. 规范化工具调用
   - `oct-gateway/runtime/toolLoop.js:35`
   - `const normalizedToolCalls = toolCalls.filter(Boolean)`

2. 工具轮次和重复调用保护
   - `oct-gateway/runtime/toolLoop.js:38-58`
   - 超出最大轮次或重复签名时直接 graceful stop。

3. 逐个执行工具
   - `oct-gateway/runtime/toolLoop.js:65-100`
   - 通过 `this.toolLoader.executeTool(toolName, args, { onToolEvent })` 执行。
   - 使用 `Promise.race` 叠加工具级 timeout。

4. 推送工具完成事件给前端
   - `oct-gateway/runtime/toolLoop.js:128-144`
   - `onToolEvent({ type: 'tool_result', ... resultPreview ... })`
   - 这里的 preview 只给 UI，不是写回模型上下文的最终内容。

5. 完整工具结果归档
   - `oct-gateway/runtime/toolLoop.js:148-156`
   - 调用 `archiveToolResult({ callId, toolName, args, result, turnId })`。
   - 归档实现位于 `oct-gateway/runtime/toolResultArchive.js:57`。

6. 工具结果硬截断
   - `oct-gateway/runtime/toolLoop.js:160-164`
   - 调用 `truncateToolResult(toolName, result, toolCall.id)`。

7. 截断日志
   - `oct-gateway/runtime/toolLoop.js:166-173`
   - 仅当 `truncated === true` 时记录 `工具结果已截断`。

8. 写回 OpenAI-compatible messages
   - `oct-gateway/runtime/toolLoop.js:175-181`
   - 写入：

```js
{
  tool_call_id: toolCall.id,
  role: 'tool',
  content: typeof truncatedResult === 'string'
    ? truncatedResult
    : JSON.stringify(truncatedResult),
}
```

9. 继续下一轮模型调用
   - `oct-gateway/runtime/toolLoop.js:200-213`
   - `continuedMessages = [...truncatedMessages, assistantToolMessage, ...toolResults]`
   - 随后调用 `this.streamChat({ messages: continuedMessages, preserveToolChain: true, ... })`。

## 3. 当前硬截断阈值与策略

硬截断实现在 `oct-gateway/runtime/toolResultArchive.js`。

核心常量：

1. `oct-gateway/runtime/toolResultArchive.js:23`
   `DEFAULT_MAX_CHARS = 2500`
2. `oct-gateway/runtime/toolResultArchive.js:26-34`
   `HIGH_VOLUME_TOOLS`：
   - `web_search`
   - `web_fetch`
   - `http_request`
   - `read_file`
   - `read_document`
   - `search_knowledge`
   - `memory_search`

策略：

1. 先序列化工具结果
   - `oct-gateway/runtime/toolResultArchive.js:119-121`
   - string 保持原样，object 走 `JSON.stringify(rawResult)`。

2. 未超过 2500 字符时不截断
   - `oct-gateway/runtime/toolResultArchive.js:125-127`

3. 非高产出工具在 `<= 3750` 字符时不截断
   - `oct-gateway/runtime/toolResultArchive.js:129-132`
   - 即普通工具有 1.5 倍缓冲。

4. 需要截断时保留头尾
   - `oct-gateway/runtime/toolResultArchive.js:134-139`
   - 头部 60%，尾部 30%，中间插入省略说明。

5. 截断文本会提示完整结果已归档
   - `oct-gateway/runtime/toolResultArchive.js:139`
   - 提示模型可调用 `recall_tool_result`。

6. 完整结果读取工具
   - `oct-gateway/tools/recall_tool_result.js:14`
   - 工具名为 `recall_tool_result`。

## 4. 建议的 Summarizer 触发点

推荐插入点：

1. 保留 `archiveToolResult(...)` 在前。
2. 保留 `truncateToolResult(...)` 作为第一道保护。
3. 在 `toolResults.push(...)` 之前，对最终要写入模型上下文的字符串做 summarize。

也就是插入在：

1. `oct-gateway/runtime/toolLoop.js:160-164`
   `truncateToolResult(...)` 之后。
2. `oct-gateway/runtime/toolLoop.js:175-181`
   `toolResults.push({ role: 'tool', content })` 之前。

推荐形态：

```js
const contentForModel = typeof truncatedResult === 'string'
  ? truncatedResult
  : JSON.stringify(truncatedResult);

const summarized = await summarizeToolResult(toolName, contentForModel);

this.log.info('tool result summarizer', {
  toolName,
  mode: summarized.mode,
  latencyMs: summarized.latencyMs,
  reason: summarized.reason || null,
});

toolResults.push({
  tool_call_id: toolCall.id,
  role: 'tool',
  content: summarized.text,
});
```

## 5. 兼容性注意点

1. 必须先把 `truncatedResult` 统一转成 string。
   当前 `truncateToolResult` 在未截断时可能返回原始 object；如果 wrapper 只接受 string，会导致 object 类工具结果被 `not_string` 跳过。

2. summarizer 默认必须关闭。
   默认关闭时 `summarizeToolResult(...)` 应返回 `{ mode: 'noop', text: contentForModel }`，确保行为等价于当前 hard truncate。

3. summarizer 失败必须内部降级。
   ToolLoop 不应因为摘要失败中断工具链；wrapper 应返回 fallback truncate 文本。

4. 不建议替换归档逻辑。
   完整结果归档和 `recall_tool_result` 是现有安全网，summarizer 应只影响写回模型上下文的 `content`。

5. UI 的 `tool_result` preview 暂不建议改。
   `onToolEvent` 的 `resultPreview` 当前发生在归档/截断/写回前，仅用于前端状态提示。第一版 summarizer 集成应只改模型上下文，不改前端工具事件。

6. 日志要记录 noop。
   开关关闭、低于阈值、不在白名单，都建议打 debug 或 info 级摘要模式日志，便于灰度核对。

## 6. 下一步建议

若确认继续，建议按以下顺序实现：

1. 新建 `oct-gateway/runtime/toolResultSummarizer.js`。
2. 新建 `oct-gateway/test/toolResultSummarizer.test.js`，优先覆盖离线路径：feature disabled、under threshold、over threshold、allow list、fallback。
3. 修改 `oct-gateway/runtime/toolLoop.js`，只在写回 `toolResults` 前插入 wrapper。
4. 更新 `docs/02_architecture/summarizer-service.md` 和 changelog。

当前节点需要人工确认后再继续修改 `toolLoop.js`。
