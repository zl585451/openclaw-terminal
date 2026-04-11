# 2026-04-12 React Flow 排版层级与连线修复

## 本次改动

- `src/components/canvas/ReactFlowRenderer.tsx`
  - 将 React Flow 节点句柄改为“按图方向只保留一组 source/target 端口”，避免多句柄但未指定 handle id 时，边无法稳定挂载到节点上。
  - 布局算法从简单 BFS 分层升级为“按弱连通分量拆图 + 组件内分层 + 双向 barycenter 重排”。
  - 断开的小图不再都被塞进同一层，而是作为独立组件顺序展开，减少互相遮挡与层级错乱。
  - 对只有回边/环路的图增加兜底 depth 分配，避免所有节点落到同一主轴位置。
  - `parseContent()` 增加 react-flow JSON 容错规范化：兼容模型误输出的 `edges[].from / to`，统一转成 React Flow 需要的 `source / target`。

## 解决的问题

- Canvas 里的 react-flow 图不再只剩一排节点而看不到明显层级。
- 连线现在会跟随 `LR / RL / TB / BT` 正确从节点主方向出入，流程图阅读顺序更清晰。
- 多分支和多个小子图的排版更稳定，`fitView` 后不会再轻易挤成一团。
- 当模型把 react-flow 边错误写成 `from/to` 时，前端不再直接丢边，而会自动修正并继续渲染。
