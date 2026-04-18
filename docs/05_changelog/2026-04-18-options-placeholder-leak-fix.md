# 2026-04-18 · 修复 `<!--OPTIONS_HERE-->` 在聊天正文泄露

## 背景
- 聊天正文中偶发显示 `<!--OPTIONS_HERE-->`。
- 典型场景：AI 输出被解析为 `QuestionCards` / `TaskList` 时，前端不走“行内 OptionBox”分支，占位符未被消费，最终作为普通文本渲染出来。

## 根因
- `src/ui/chat/MessageList.tsx` 中：
  - 只有 `showInlineOptions === true` 时才会 `split('<!--OPTIONS_HERE-->')` 并消费占位符。
  - 其他分支直接渲染 `cleanedText`，导致占位符原样显示。

## 修复
- 在非行内分支统一使用去占位符后的文本：
  - 新增 `textWithoutInlinePlaceholder = cleanedText.replace(/<!--OPTIONS_HERE-->/g, '')...`
  - `FinalizedMarkdownContent` 主正文渲染改为该变量。

## 影响
- 不影响行内 OptionBox 插入逻辑。
- `QuestionCards`、`TaskList`、普通文本分支都不会再出现 `<!--OPTIONS_HERE-->` 泄露。
