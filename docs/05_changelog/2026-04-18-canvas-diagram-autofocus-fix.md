# 2026-04-18 · Canvas 结构图渲染与自动打开修复

## 问题现象
- 模型调用 `canvas update` 成功，但 Canvas 面板未自动弹出。
- 结构图内容在 Canvas 中显示为普通文本，没有按 Mermaid 图渲染。

## 根因
1. 前端 Workbench 仅在 `create/focus` 事件时自动打开面板，`update/explain` 不会自动打开。
2. 网关 `canvas` 工具在 `update` 场景下依赖模型显式传 `artifactType=diagram`；若模型漏传，内容会按 `document` 存储，导致渲染插件走文本链路。

## 修复
1. `src/workbench/WorkbenchContext.tsx`
- 将 `update/explain` 事件也纳入自动打开面板逻辑。

2. `oct-gateway/tools/canvas.js`
- 增加 diagram 内容自动识别：
  - diagram JSON（`diagramType/nodes/edges`）
  - Mermaid fenced block（```mermaid）
  - Mermaid DSL 起始关键词（`flowchart/graph/pie/...`）
- `create` 场景：若未传 `artifactType` 且内容像结构图，自动设为 `diagram`。
- `update` 场景：若未传 `artifactType` 且内容像结构图，自动给 patch 注入 `artifactType='diagram'`（并补 `language='mermaid'`）。

## 结果
- 用户从欢迎面板触发“画结构图”时，即使模型参数不完整，也能落到 diagram 渲染链路。
- Canvas 在更新结构图时会自动弹出，不再需要手动点开查看。
