# 2026-04-12 React Flow Large Graph Layout

## 背景

当用户基于已有 React Flow 图继续追加节点时，节点数量和连线复杂度上升，原来的布局仍使用固定节点尺寸与固定层间距，容易出现：

- 节点重叠
- 同层节点互相挤压
- 多条边在中心区域缠绕

## 本次优化

文件：

- [src/components/canvas/ReactFlowRenderer.tsx](/e:/windows-window/OpenClaw-Terminal/src/components/canvas/ReactFlowRenderer.tsx)
- [src/components/canvas/ReactFlowRenderer.css](/e:/windows-window/OpenClaw-Terminal/src/components/canvas/ReactFlowRenderer.css)

改动点：

- 布局改为按节点文案估算宽高，而不是固定 `180 x 48`
- 层间距 / 同层间距 / 分组间距改为按图规模自适应
- 每层位置改为按节点实际估算尺寸累计排布，降低长标签节点互撞
- 大图自动把边从 `smoothstep` 切到 `step`，减少中心区域缠绕
- 标题栏增加复杂度提示
- 单张图做绝对保护：最多渲染前 `24` 个节点，避免失控大图把工作台彻底挤坏

## 建议阈值

- 推荐：单张 React Flow 图控制在 `12` 个节点以内
- 可接受上限：`18` 个节点
- 超过 `24` 个节点应优先拆图，而不是继续塞进一张图

## 验证

- `npx tsc --noEmit`
- `npm run build`
