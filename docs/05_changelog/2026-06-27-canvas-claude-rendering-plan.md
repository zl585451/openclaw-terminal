# 目标计划：Canvas 按 Claude 范式重设计（单一 HTML/SVG 主路 + 通用点击解释层）

> 分支：`feat/canvas-claude-rendering`
> 日期：2026-06-27
> 背景：当前 canvas 有三条产图渲染器（ui-draft SVG / react-flow / Mermaid），风格割裂、
> 路由有洞、模型会裸奔选丑的 react-flow；而"点击解释"只绑在最丑的 react-flow 上，
> 导致"想要交互被迫用丑渲染器"。目标是对齐 Claude.ai 官方做法。

## Claude 官方范式（已查证）

来源：[Custom visuals in chat and Cowork — Claude Help Center](https://support.claude.com/en/articles/13979539-custom-visuals-in-chat-and-cowork)

1. **渲染**：所有自定义视觉一律用 **HTML/SVG**，丢进沙箱 iframe，没有"节点图引擎"分叉。
   > "Claude builds them using HTML… so they're interactive and specific to your question rather than static images."
2. **点击解释**：在同一张 HTML/SVG 上盖一层通用"点击元素→发追问"。
   > "clicking inside a visual sends a follow-up prompt to Claude (for example, 'drill into Q3')."

结论：**单一 HTML/SVG 渲染管线 + 通用点击层**。这正好同时解决"统一"与"可点击解释"。

## 现状结构节点（基线）

- 后端：`orchestrator.js` `CANVAS_TRIGGER_RULES`（关键词→artifactType，无 react-flow 规则）
  → `contextBuilder.js` `_buildArtifactHint`（按类型注入出图协议）→ `tools/canvas.js`（工具）
- 前端：事件桥 → `WorkbenchContext`（持有 `onNodeInspect` 点击解释回调）
  → `ChatTab.v2.tsx`（注册 quickSend 为 inspect handler）
  → `WorkbenchPanel` → `plugins/index.ts`（解析顺序）→ 三个渲染器
- 点击解释基础设施是**通用**的，但目前**只有 `ReactFlowRenderer` 调用** `onNodeInspect`。

## 设计原则

- 主路收口到 **htmlPlugin（HTML/SVG）**，它已具备满版自适应 + 设计系统外壳，最接近 Claude。
- 点击解释做成 **iframe 通用层**：任何 HTML/SVG 产物都能点，不再依赖 react-flow。
- react-flow / Mermaid **降级为特例**（时序/甘特/超大可拖拽图），默认不再触发。
- **不动数据模型**（artifactType 枚举），只在路由/协议/渲染优先级/点击层四处收口。低风险、可回退。

## 执行阶段（目标计划）

### Phase 1 — 通用点击解释层（核心）✅
- [x] `artifactShell.ts`：注入脚本增加点击监听——冒泡找最近 `[data-explain]`，
      取 label → `postMessage({__octArtifactInspect:true, label})`；注入 `[data-explain]{cursor:pointer}` + hover 高亮。
- [x] `htmlPlugin.tsx`：组件内 `useCanvas()` 拿 `onNodeInspect`；监听 `__octArtifactInspect` 消息 → 调用之。
- [ ] 验收（需启动 app）：SVG 架构图里点节点 → 聊天框自动发"请详细说明节点「X」…"。

### Phase 2 — 系统协议收口（contextBuilder）✅
- [x] ui-draft 协议新增：每个节点包进 `<g data-explain="节点全名">`。
- [x] react-flow 协议加【适用范围】，明确仅"可拖拽/缩放探索的大型交互图"。
- （默认 fallback 改由 canvas 工具描述承担，见 Phase 3，更稳——总在上下文里）

### Phase 3 — 路由收口（orchestrator + canvas 工具）✅
- [x] `CANVAS_TRIGGER_RULES` ui-draft 关键词扩充：工作流程/工作流/数据流/调用链/pipeline/流水线…
- [x] `tools/canvas.js`：react-flow enum 描述收窄；明确普通结构/流程/架构图一律 ui-draft。

### Phase 4 — 渲染优先级确认 ✅
- [x] 核对 `plugins/index.ts`：ui-draft(mode=html) 不被 markdown(reading)/code(mode=code) 拦截，稳定落 htmlPlugin。无需改动。

### Phase 5 — react-flow 降级保留
- [x] 暂不删除、暂不修布局；通过 P2/P3 让它默认不再被触发。后续如仍出现再单独处理。

## 验证状态
- 前端 `tsc --noEmit` 通过；gateway `contextBuilder/orchestrator/canvas` 加载通过；注入脚本 `node --check` 通过。
- **端到端点击验收待启动 app**（且后端改动需重启 gateway 才生效）。

## 不做（本次范围外）
- 不重构 artifactType 九种枚举（耦合持久化/gateway/script，单独立项）。
- 不删 react-flow / Mermaid 渲染器。
- 不改后端核心链路。
