# 2026-04-10 Canvas Artifact Sync To Main

## 背景

`v0.2.0` 安装包已经包含 Canvas artifact 渲染能力，但 `main` 分支源码停留在早期文本抽屉版本，导致 `canvas()` 产物无法从 Gateway 推送到前端渲染层。

## 本次同步

- 恢复 `canvas` 工具：支持 `create / update / focus / delete / explain`
- Gateway 工具执行后可转发 `canvas` 事件，而不只发送普通 `tool` 卡片
- Electron `openclaw-send` 补充 `canvasContext` 透传
- 前端恢复文档型 `CanvasContext`：
  `documents / activeDocument / artifactType / applyCanvasEvent`
- 新增 `useCanvasBridge`
- Canvas 面板改为插件渲染：
  Markdown / Code / HTML / Mermaid Diagram / ECharts
- 补回图表与结构图渲染所需文件：
  `EChartsRenderer`、`MermaidRenderer`、`diagramSchema`

## 影响

- `canvas()` 产物现在可以真正推送到渲染层
- Canvas 面板不再只是打开空抽屉，而是可以承载图表、结构图和 HTML 草稿
- `main` 与 `v0.2.0` 客户端的 Canvas 数据链路重新对齐
