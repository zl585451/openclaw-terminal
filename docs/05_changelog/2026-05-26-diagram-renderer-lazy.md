# 2026-05-26 Diagram Renderer Lazy Load

## 变更

- Workbench 图表插件改用 `MermaidRendererLazy`，避免 Mermaid 渲染器进入首屏同步加载路径。

## 验证

- `npm test`
- `npm run build`
