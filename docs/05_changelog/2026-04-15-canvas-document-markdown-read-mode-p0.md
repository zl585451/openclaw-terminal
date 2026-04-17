# 2026-04-15 — Canvas 文档类 Markdown：滚动与阅读排版（P0）

## 摘要

Workbench 中 `markdown` 模式的长文此前受共用 `.canvas-preview`的 `height: 100%` + `overflow: hidden` 影响，无法在父级 `.canvas-content` 内纵向滚动，且沿用聊天气泡式紧凑排版。

## 改动

- `src/workbench/plugins/markdownPlugin.tsx`：根节点增加 `canvas-preview--document`，内层增加 `canvas-document-reader` 容器。
- `src/components/CanvasPanel.css`：仅为 `.canvas-preview--document` 增加阅读模式样式（高度/溢出交给父级滚动、约 760px 栏宽、标题与段落层级、代码块/表格横向滚动等）。其他 plugin（Mermaid、HTML、Code 等）仍使用未修饰的 `.canvas-preview`，行为不变。

## 分支

`feature/canvas-document-p0`
