# 2026-04-15 — Workbench 工具栏：文档字数与阅读时长（P1-A）

## 摘要

当当前 Workbench 产物的 `artifactType === 'document'` 时，工具栏 meta 行在原有 `类型 · 来源 · 版本` 之后追加「去空白后的字符数」与按400 字/分钟估算的阅读分钟数（至少 1 分钟）。非文档类（如 diagram、code）不显示这两项。

## 改动

- `src/components/workbench/WorkbenchPanel.tsx`：增加 `cnCharCount`、`readMinutes`、`isDocumentArtifact`，并在 `canvas-toolbar-meta` 中条件渲染。

## 依赖

- 需 P0 文档滚动/阅读样式已合入或同分支可用；本步不修改 CSS与其他插件。
