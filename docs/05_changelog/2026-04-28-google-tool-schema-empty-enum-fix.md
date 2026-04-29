# 2026-04-28 Google 工具 Schema 空枚举修复

## 背景

Google Gemini Vertex 原生 SDK 在发起工具调用前，会严格校验 `function_declarations` 的 JSON Schema。

排查 `google/gemini-3.1-flash-lite-preview` 报错日志时发现：

- `GenerateContentRequest.tools[0].function_declarations[23].parameters.properties[priority].enum[3]: cannot be empty`

根因是 `task_add` 工具把 `priority` 定义成了：

- `['P0', 'P1', 'P2', '']`

其中空字符串枚举值会被 Google 判为非法参数定义并直接返回 `400 INVALID_ARGUMENT`。

## 本次修复

- 删除 `oct-gateway/tools/task_add.js` 中 `priority` 的空字符串枚举项
- 保留执行层默认值兜底：未传或非法 `priority` 仍回落到 `P2`

## 结果

- `google/gemini-3.1-flash-lite-preview` 不会再因为 `task_add` 的 schema 空枚举而在请求起始阶段被拒绝
- Google Vertex 原生模型对工具 schema 的兼容性与其他工具定义保持一致
