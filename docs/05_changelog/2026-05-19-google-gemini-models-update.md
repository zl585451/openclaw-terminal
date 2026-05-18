# 2026-05-19 — Google Gemini 模型更新与工具能力补强

## 摘要
- 更新了 `google` Provider 的预设模型列表，引入了 Gemini 2.0 系列正式版与 1.5 系列稳定版。
- 开启了 Gemini 2.0/1.5 系列主流模型的工具调用 (`tools: true`) 支持。
- 将默认模型切换为 `google/gemini-2.0-flash`。

## 改动内容

### oct-gateway/providers.js
- **默认模型变更**：从 `google/gemini-2.5-flash` 切换为 `google/gemini-2.0-flash`（目前最快且能力均衡的正式版模型）。
- **新增/更新模型列表**：
    - `google/gemini-2.0-flash`：正式版，具备工具调用能力。
    - `google/gemini-2.0-flash-lite-preview-02-05`：极速预览版。
    - `google/gemini-2.0-pro-exp-02-05`：最强推理实验版。
    - `google/gemini-1.5-pro`：百万上下文窗口的主力模型。
    - `google/gemini-1.5-flash`：高性价比稳定版。
- **工具调用补强**：对上述新版本模型显式设置 `tools: true`。虽然底层仍走 OpenAI 兼容层，但最新的 Gemini 2.x/1.5 对工具调用的支持已显著提升。

## 文档同步
- `docs/02_architecture/provider-system.md` 已在逻辑上保持一致。
- 变更已记录在本 changelog 中。
