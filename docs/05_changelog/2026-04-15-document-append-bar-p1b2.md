# 2026-04-15 — DocumentAppendBar：文档类 Canvas 底部 AI 追加栏（P1-B-2）

## 摘要

当 Workbench 当前产物 `artifactType === 'document'` 时，在面板底部展示常驻追加栏：5 个快捷 chip 仅预填输入框与 intent，用户可编辑后 Enter 或点击发送；通过 `workbenchBus.requestSendMessage` 走 P1-B-1 已接通的聊天链路。非文档类产物不渲染该栏。

## 改动

- 新增 `src/components/workbench/DocumentAppendBar.tsx`
- `src/components/workbench/WorkbenchPanel.tsx`：在 `.canvas-workspace` 外、`.canvas-panel` 内条件挂载 `DocumentAppendBar`
- `src/components/CanvasPanel.css`：追加 `document-append-*` 样式块（位于 `@media (max-width: 900px)` 之前）

## 说明

- 组件实现中为使用 `React.KeyboardEvent`，入口为 `import React, { ... } from 'react'`（与方案原文仅 named import 等价扩展，满足类型检查）。
