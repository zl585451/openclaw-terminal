# 2026-04-26 Tool Result Summarizer

## Summary

Track B 将 Week 1 的通用 summarizer 接入 Gateway ToolLoop。工具结果在写回模型上下文前可按阈值自动摘要，默认关闭；关闭时行为保持 Week 1 基线。

## Files

1. `oct-gateway/runtime/toolResultSummarizer.js`
   新增工具结果摘要 wrapper，包含开关、阈值、白名单和失败降级。
2. `oct-gateway/runtime/toolLoop.js`
   在 `truncateToolResult(...)` 之后、`toolResults.push(...)` 之前接入摘要 wrapper。
3. `oct-gateway/test/toolResultSummarizer.test.js`
   新增离线测试和可选 live 测试。
4. `oct-gateway/config.js`
   暴露工具结果摘要相关配置默认值。
5. `docs/02_architecture/summarizer-service.md`
   新增 ToolLoop 集成、安全网层级和配置说明。

## Config

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TOOL_RESULT_SUMMARIZER_ENABLED` | 关 | 总开关，设为 `1` 启用 |
| `TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS` | `2400` | 工具结果超过此长度才触发摘要 |
| `TOOL_RESULT_SUMMARIZER_TARGET_CHARS` | `600` | 摘要目标长度 |
| `TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP` | `1500` | 降级时保留原文长度 |
| `TOOL_RESULT_SUMMARIZER_TOOLS` | 空 | 工具白名单，逗号分隔；空表示全部允许 |

## Enable

PowerShell 示例：

```powershell
$env:TOOL_RESULT_SUMMARIZER_ENABLED='1'
$env:TOOL_RESULT_SUMMARIZER_TOOLS='web_search,read_document'
```

设置后需要重启 Gateway 才能进入新的运行时配置。

## Rollout

建议先灰度 2-3 个高产出工具：

```powershell
$env:TOOL_RESULT_SUMMARIZER_TOOLS='web_search,read_document'
```

观察日志中的 `tool result summarizer`，重点检查：

1. `mode`
2. `latencyMs`
3. `originalChars`
4. `finalChars`

## Safety Net

ToolLoop 写回模型上下文前保留三层保护：

1. 归档层：完整结果仍由 `archiveToolResult(...)` 保存。
2. 硬截断层：`truncateToolResult(...)` 保留头尾并提示 `recall_tool_result`。
3. 摘要层：默认关闭，启用后仅压缩写回模型的 `role: 'tool'` content。

## Known Limits

1. 第一版只压缩写回 model 的内容，不影响 UI `tool_result` preview。
2. 摘要失败时只做前缀标记和前段截断，不尝试二次摘要。
3. 设置面板暂不提供开关 UI，留给 Week 3。

## Related

1. `docs/07_research/2026-04-26-toolloop-pre-summarizer.md`
2. `docs/03_specs/Week2-Track-B-Followup-After-B1.md`
