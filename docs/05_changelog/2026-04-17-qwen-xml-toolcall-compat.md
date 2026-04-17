# fix: 兼容 Qwen XML 风格伪工具调用（tool_call 标签）

> Date: 2026-04-17  
> Type: Bug Fix  
> Scope: `oct-gateway/ai.js`

## 问题

部分模型（Qwen/兼容通道）会把工具调用写进正文，格式为 XML-like 片段：

- `<tool_call>...</tool_call>`
- `<function=canvas>`
- `<parameter-xxx>...</parameter>`

网关原先只兼容 Ruby 风格与 Kimi section 风格伪调用，导致这类输出无法进入 toolLoop，最终直接在聊天区显示为“代码/标签文本”。

## 修复

- 在 `ai.js` 新增 `extractXmlPseudoToolCalls(text)`：
  - 解析 `<tool_call>` 块
  - 提取 `<function=...>` 作为工具名
  - 提取 `<parameter-...>` 作为参数
  - 统一转为内部 `tool_calls` 结构
- 在 `extractPseudoToolCalls(text)` 增加 XML 分支兜底。
- 增加常见参数别名纠正：`type -> artifactType`。
- 对 canvas 常见误用做兼容：`action=update` 且缺少 `documentId` 时退化为 `create`。

## 预期效果

- 模型把工具调用以 XML 文本吐出时，网关可自动识别并执行工具。
- 聊天区不再把整段 `<tool_call>` 直接当正文展示。
