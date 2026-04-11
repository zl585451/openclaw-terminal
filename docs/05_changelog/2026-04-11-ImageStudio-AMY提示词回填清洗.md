# ImageStudio AMY 提示词回填清洗

日期：2026-04-11

## 调整内容

- 在 `ChatTab.v2.tsx` 增加 `extractOptimizedImagePrompt()`，用于把 AMY 最终回复清洗为适合直接回填到 Image Studio 的 prompt。

## 兼容场景

- 模型输出显式 CoT 标记：
  - `[cot]...[/cot]`
  - `<think>...</think>`
  - `<redacted_thinking>...</redacted_thinking>`
- 模型复述用户要求
- 模型输出编号列表、说明文字、代码块、引号包裹结果

## 当前策略

- 优先使用去掉 CoT 后的 `mainContent`
- 过滤常见指令回声：
  - `用户：`
  - `要求：`
  - `生图提示词：`
  - `只输出...`
  - `不要解释...`
  - `不要加引号...`
  - `不要使用 markdown...`
- 过滤编号步骤行
- 若回复包在 fenced code block 中，优先取代码块正文
- 最终去掉首尾引号后回填
