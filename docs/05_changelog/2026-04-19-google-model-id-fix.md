# fix: Google provider 默认模型 ID 修正（使用 `google/gemini-*`）

## 背景

`google` provider（Vertex AI Express OpenAI 兼容层）中，模型名需要与 Vertex OpenAI 文档示例一致，使用 `google/gemini-*` 形式。  
同时，部分旧配置或 UI 回填可能保存为无前缀的 `gemini-*`，会导致与 Vertex 端模型名不一致并触发 404。

## 变更

### `oct-gateway/providers.js`

- `google.defaultModel` 调整为稳定别名：`google/gemini-2.5-flash`
- `google.models[*].id` 调整为官方推荐形式并更新为较新的别名集合：
  - `google/gemini-2.5-flash`
  - `google/gemini-2.5-pro`
  - `google/gemini-3-flash-preview`
  - `google/gemini-3.1-pro-preview`
  - `google/gemini-3.1-flash-lite-preview`
  - `google/gemini-2.0-flash-001`

### `oct-gateway/runtime/providerRouter.js`

- 新增 Google 模型 ID 兼容补全：
  - 当 `provider.id === 'google'` 且模型名是无前缀 `gemini-*` 时，自动补成 `google/gemini-*`。
  - 已是 `google/*` 或其它带斜杠自定义路径时保持原样。
- 新增旧 preview 日期版本别名映射：
  - `google/gemini-2.5-pro-preview-03-25` → `google/gemini-2.5-pro`
  - `google/gemini-2.5-flash-preview-04-17` → `google/gemini-2.5-flash`
- 作用：兼容历史配置，避免用户必须手动改旧值。

## 影响

- 新增/默认配置将使用 Vertex 文档一致的模型命名格式。
- 历史无前缀模型名可继续使用（运行时自动补前缀）。
