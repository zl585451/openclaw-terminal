# Summarizer Service 架构说明

## 1. 服务定位

`summarizer` 是 Gateway 内的通用文本压缩服务，用来把长文本、工具结果、小说章节和对话历史压缩成可控长度的摘要。

它不是某个 Agent 的私有能力，而是后续多个系统共用的基础设施：

1. 主对话上下文压缩。
2. 工具返回结果压缩。
3. 内容创作工作台长章节预处理。
4. 多人演播有声书 Agent 的章节摘要、角色线索和剧情状态压缩。
5. 图书馆 / 资料库侧的长文档提要。

---

## 2. 文件位置

当前新增服务：

1. `oct-gateway/services/chunker.js`
   纯规则文本切分，不调用模型。
2. `oct-gateway/services/summarizer.js`
   OpenAI Chat Completions 兼容摘要服务。
3. `oct-gateway/tools/summarize_text.js`
   暴露给 AMY / Agent 的工具入口。
4. `oct-gateway/test/summarizer.test.js`
   无测试框架的基础验证脚本。

已有但用途不同的模块：

1. `oct-gateway/summarizer/client.js`
   记忆系统专用摘要客户端，服务日/周/月记忆总结。

二者不合并的原因：

1. 记忆总结有独立调度和重试策略。
2. 内容制作摘要需要按用途区分 prompt。
3. 后续 Agent 需要可直接调用的服务函数和工具。

---

## 3. Chunker API

### 3.1 `chunkByChars(text, options)`

按字符数切分，优先在自然边界切：

1. 空行。
2. 换行。
3. 中文句号。
4. 中英文感叹号、问号。
5. 实在没有边界再硬切。

返回：

```js
Array<{ index, content, startChar, endChar }>
```

### 3.2 `chunkByParagraphs(text, options)`

按段落合并到目标长度，尽量不把段落切散。

返回：

```js
Array<{ index, content, startChar, endChar, paragraphCount }>
```

### 3.3 `chunkByChapters(text)`

识别 `第一章`、`第1章`、`第二回` 等中文章节标题。

返回：

```js
Array<{ index, title, content, startChar, endChar }>
```

---

## 4. Summarizer API

### 4.1 `summarize(text, options)`

单段摘要。输入硬上限为 8000 字符，超过时调用方应先使用 chunker。

核心参数：

1. `purpose`
   `general | tool_result | chapter | scroll`
2. `targetLength`
   目标字数，默认 500。
3. `preserveKeywords`
   必须保留的关键词。
4. `language`
   输出语言，默认中文。
5. `timeoutMs`
   默认 20000。

返回：

```js
{
  summary,
  originalLength,
  summaryLength,
  model,
  latencyMs,
}
```

### 4.2 `summarizeChunks(chunks, options)`

Map-Reduce 式摘要：

1. 先逐块摘要。
2. 再把块摘要合成总摘要。
3. 单块失败时不会整体失败，会用原文截断作为降级摘要。

返回：

```js
{
  chunkSummaries,
  finalSummary,
  totalChunks,
  totalLatencyMs,
}
```

---

## 5. Prompt 模板

当前按 `purpose` 区分：

1. `general`
   压缩一般文本，保留关键信息、数据点、结论和限制。
2. `tool_result`
   提取工具返回结果中的事实、结构、错误和可执行信息。
3. `chapter`
   提取小说章节中的剧情进展、出场角色、关键事件、线索和悬念推进。
4. `scroll`
   提炼对话历史里的核心话题、已达成共识、未决问题和下一步计划。

所有模板都要求：

1. 严禁编造。
2. 不补充原文没有的事实。
3. 直接输出摘要正文。

---

## 6. 模型选择

优先级：

1. `SUMMARIZER_BASE_URL + SUMMARIZER_API_KEY + SUMMARIZER_MODEL`
2. 当前 Gateway Provider 配置

当前 Gateway Provider 的快速模型默认映射：

1. 百炼：`qwen-turbo`
2. DeepSeek：`deepseek-v4-flash`
3. OpenAI：`gpt-4o-mini`
4. Google：`google/gemini-2.5-flash`
5. MiniMax：`MiniMax-M2.7-highspeed`
6. 其他：沿用当前模型

---

## 7. 错误处理

1. 输入为空：抛 `SummarizerEmptyError`。
2. 输入超过 8000 字符：抛 `SUMMARIZER_INPUT_TOO_LONG`。
3. 超时：抛 `SummarizerTimeoutError`。
4. 模型返回空：抛 `SummarizerEmptyError`。
5. `summarizeChunks` 中单块失败：降级为原文截断，不中断整体流程。

---

## 8. ToolLoop 集成

Week 2 已将 summarizer 接入 Gateway 主工具循环。接入位置在 `oct-gateway/runtime/toolLoop.js` 中：

1. 工具完整结果先通过 `archiveToolResult(...)` 归档。
2. 工具结果再通过 `truncateToolResult(...)` 做 Week 0 硬截断。
3. 写回 `messages` 之前，调用 `summarizeToolResult(toolName, contentForModel)`。
4. 最终只有 `role: 'tool'` 的 `content` 会被摘要层影响，UI `tool_result` preview 不变。

### 8.1 触发条件

摘要层默认关闭，必须满足以下条件才会调用模型摘要：

1. `TOOL_RESULT_SUMMARIZER_ENABLED` 已设置为 `1` / `true` / `on`。
2. 写回模型上下文的工具结果字符串长度超过 `TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS`，默认 2400。
3. `TOOL_RESULT_SUMMARIZER_TOOLS` 为空，或当前工具名在白名单内。

### 8.2 配置项

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TOOL_RESULT_SUMMARIZER_ENABLED` | 关 | 总开关，设为 `1` 启用 |
| `TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS` | `2400` | 工具结果超过此长度才触发摘要 |
| `TOOL_RESULT_SUMMARIZER_TARGET_CHARS` | `600` | 摘要目标长度 |
| `TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP` | `1500` | 降级时保留原文长度 |
| `TOOL_RESULT_SUMMARIZER_TOOLS` | 空 | 工具白名单，逗号分隔；空表示全部允许 |

### 8.3 失败降级

1. summarizer 调用失败、超时或返回异常时，不中断工具循环。
2. 降级文本以 `[summarizer fallback: ...]` 开头。
3. 降级文本保留原工具结果前 `TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP` 字符，并在超长时追加 `...(truncated)`。

### 8.4 Tool Loop 集成中的安全网层级

工具结果在写回模型上下文之前，经过三层处理，任何一层失败都不影响下一层：

1. **归档层**（Week 0，默认开，无法关闭）
   - `oct-gateway/runtime/toolResultArchive.js`
   - 保存完整工具结果到 JSONL 归档。
   - 模型可调用 `recall_tool_result` 取回完整结果。

2. **硬截断层**（Week 0，默认开，无法关闭）
   - 同上文件，`truncateToolResult(...)`
   - 普通工具阈值 3750 字符，高产出工具（`web_search` 等）阈值 2500。
   - 截断后保留头 60% 尾 30%，中段插入“完整结果已归档”提示。

3. **摘要层**（Week 2，默认关，需手动开启）
   - `oct-gateway/runtime/toolResultSummarizer.js`
   - 阈值、工具白名单、失败 fallback 全部可配。
   - 失败时退化为 1500 字硬截断，文本以 `[summarizer fallback: ...]` 开头便于排查。

### 8.5 与 `recall_tool_result` 的关系

1. summarizer 不改变完整结果归档。
2. summarizer 不改变 `recall_tool_result` 工具定义。
3. 如果摘要层压缩了硬截断文本，摘要正文不强制保留截断提示行；完整结果仍可通过已注册工具按 `callId` 取回。
4. 第一版只压缩写回模型的工具消息，不压缩前端工具事件 preview。

---

## 9. 与内容创作 Agent 的集成点

多人演播有声书真实 Agent 接入时，推荐流程：

1. `parser.source_document@1.0` 解析全文。
2. `chunkByChapters` 识别章节。
3. 对目标章节使用 `chunkByParagraphs` 或 `chunkByChars`。
4. `summarizeChunks(..., { purpose: 'chapter' })` 生成章节剧情摘要。
5. 将摘要作为 `SourceProfile` / `AnalysisReport` 的输入。
6. 文本改编 Agent 只拿目标片段全文 + 上下文摘要，避免一次塞入整本小说。
