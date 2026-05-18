# Workbench Foundation Phase 1

日期：2026-04-12

## 结论

Canvas 现在开始作为 `Workbench` 子系统演进，但仍保留 `Canvas` 兼容入口，避免一次性重命名带来的高风险改动。

这一阶段的目标不是改 UI 形态，而是先把职责边界切开：

- `WorkbenchContext` 负责 React 层工作台状态
- `DocumentStore` 负责纯文档数据状态
- `WorkbenchBus` 负责聊天层、传输层、工作台层之间的命令桥接
- `Canvas*` 入口保留为兼容别名

## 当前落地结构

### Workbench 根层

- [src/workbench/types.ts](/e:/windows-window/OpenClaw-Terminal/src/workbench/types.ts)
- [src/workbench/DocumentStore.ts](/e:/windows-window/OpenClaw-Terminal/src/workbench/DocumentStore.ts)
- [src/workbench/WorkbenchContext.tsx](/e:/windows-window/OpenClaw-Terminal/src/workbench/WorkbenchContext.tsx)
- [src/workbench/WorkbenchBus.ts](/e:/windows-window/OpenClaw-Terminal/src/workbench/WorkbenchBus.ts)
- [src/workbench/plugins/index.ts](/e:/windows-window/OpenClaw-Terminal/src/workbench/plugins/index.ts)

### UI 宿主层

- [src/components/workbench/WorkbenchHost.tsx](/e:/windows-window/OpenClaw-Terminal/src/components/workbench/WorkbenchHost.tsx)
- [src/components/workbench/WorkbenchPanel.tsx](/e:/windows-window/OpenClaw-Terminal/src/components/workbench/WorkbenchPanel.tsx)

### 兼容层

- [src/contexts/CanvasContext.tsx](/e:/windows-window/OpenClaw-Terminal/src/contexts/CanvasContext.tsx)
- [src/components/canvas/CanvasHost.tsx](/e:/windows-window/OpenClaw-Terminal/src/components/canvas/CanvasHost.tsx)
- CanvasPanel 兼容入口已移除，相关样式与工作台入口已并入 [src/components/workbench/WorkbenchPanel.tsx](/e:/windows-window/OpenClaw-Terminal/src/components/workbench/WorkbenchPanel.tsx) 与 [src/components/workbench/WorkbenchPanel.css](/e:/windows-window/OpenClaw-Terminal/src/components/workbench/WorkbenchPanel.css)
- [src/hooks/useCanvasBridge.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useCanvasBridge.ts)

## 分层职责

### Conversation Layer

- `ChatTab.v2.tsx`
- `useMessages.ts`
- `useWebSocket.ts`

只负责会话、流式消息、传输，不再拥有工作台数据模型。

### Workbench Layer

- `WorkbenchContext`
- `WorkbenchHost`
- `WorkbenchPanel`

负责工作台开关、活跃文档、命令消费、面板渲染。

### Artifact Domain Layer

- `DocumentStore`
- `WorkbenchDocument`
- `WorkbenchCommand`

负责文档 CRUD、activeDocumentId、版本与元信息。

### Renderer Plugin Layer

当前仍复用 `src/components/canvas/plugins/*` 的实现，但已经新增 `src/workbench/plugins/` 作为新命名空间入口。

### AI Integration Layer

- `oct-gateway/tools/canvas.js`
- `oct-gateway/runtime/toolLoop.js`

开始同时支持 `canvasEvent` 和 `workbenchEvent`，为后续完全改名铺路。

## 迁移原则

- 不批量重命名旧文件
- 先切数据和命令边界，再迁移 UI 和目录
- 新能力优先从 `workbench/*` 入口接入
- 旧 `canvas/*` 路径只做兼容，不再继续堆新职责

## 下一阶段

下一步可以继续做两件事：

1. 让聊天链路优先从 `useWorkbenchBridge` 和 `workbenchBus.getContext()` 读取工作台上下文
2. 把插件注册从 `components/canvas/plugins` 逐步迁到 `workbench/plugins`
