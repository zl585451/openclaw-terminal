# 2026-04-12 — Canvas → Workbench 独立化架构方案（设计稿）

> 类型：架构设计 / 未落地  
> 状态：PROPOSAL

---

## 背景

Canvas 子系统持续作为聊天副产物演进，导致以下问题：

- `CanvasContext` 混管 UI 状态和 artifact 数据
- `useMessages.ts` 直接 import `CanvasRoundtripContext`
- `CanvasHost` 写死 `enabled={activeTab === 'chat'}`
- 无法在不改 ChatTab 的情况下新增工作台类型

## 本次新增

- 新建 `docs/06_features/WORKBENCH_ARCHITECTURE_PLAN.md`
  - 完整的 Canvas → Workbench 独立化分层设计
  - 5 阶段渐进式重构路线（Phase 1-5）
  - 核心抽象定义：`WorkbenchDocument` / `WorkbenchCommand` / `WorkbenchEvent` / `WorkbenchBus` / `RendererPlugin`
  - 当前文件与目标文件映射表

## 推荐行动

1. **Phase 1**（最高优先级）：拆 `CanvasContext`，抽 `WorkbenchBus`，消除 `useMessages` 对 canvas 类型的直接 import
2. **Phase 2**：`WorkbenchHost` 全局挂载，解除 `activeTab === 'chat'` 绑定
3. **Phase 3**：Gateway 侧追加 `workbenchEvent` 兼容别名
4. **Phase 4**：Plugin 注册机制标准化，迁移到 `src/workbench/plugins/`
5. **Phase 5**：新增第一个非图表工作台（里程碑验证）

## 未改动代码

本次仅产出设计文档，未修改任何源代码。
