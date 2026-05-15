# React Flow 结构图默认布局优化

## 背景

截图里的结构图呈现为单列竖向链路，节点较小且画布右侧留白明显。根因是结构图提示词强制 `direction = "TB"`，导致架构类图也被排成自上而下的一根主线。

## 变更

- `oct-gateway/runtime/contextBuilder.js`
  - React Flow 结构图协议默认改为 `direction = "LR"`。
  - 明确“主链路横向展开、阶段能力下挂”的生成规则。
  - 补充 `shape` 语义：输入/输出用 `stadium`，判断用 `diamond`，普通处理用 `rect`。
  - 要求回退边使用 `style: "dashed"` 并带短标签。
- `src/components/canvas/ReactFlowRenderer.tsx`
  - 未指定方向时默认按 `LR` 渲染。
  - 将节点 `shape` 映射为 CSS class。
- `src/components/canvas/ReactFlowRenderer.css`
  - 增加 `stadium`、`diamond`、`circle` 节点样式。
- `docs/01_system_prompts/DIAGRAM_PROTOCOL.md`
  - 同步结构图协议与有声书改本工具样板 JSON。

## 影响

后续用户请求结构图时，默认更接近“左到右主流程 + 子能力下挂 + 回退路径”的预览形态，减少单列竖排导致的可读性问题。
