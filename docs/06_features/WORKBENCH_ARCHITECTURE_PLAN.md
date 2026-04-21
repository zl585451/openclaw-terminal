# Canvas → Workbench 独立化架构方案

> 状态：IMPLEMENTED  
> Last Updated: 2026-04-21  
> Original Proposal Date: 2026-04-12  
> 作者：架构评审  
> 针对版本：当前 `main` 分支（commit 83494f5 附近）  
> Implementation: `src/workbench/`、`src/components/workbench/`、`src/hooks/useWorkbenchBridge.ts`、`oct-gateway/tools/canvas.js`、`oct-gateway/runtime/toolLoop.js`

---

## 0. 结论先行

**推荐命名：`Workbench`（工作台）**，不叫 Studio，原因见第 1 节。

**现在最不该做的事：**
- 一次性重命名所有 `canvas` → `workbench` 文件
- 先改 UI 形态再解耦逻辑
- 在没隔离 Context 之前就开始加新的工作台类型

**优先投入的 20% 改动（第一阶段，就这 4 件事）：**
1. 把 `CanvasContext` 拆成两个：**文档仓库** 和 **UI 状态**
2. 抽 `WorkbenchBus`（事件总线），让聊天侧不再直接 import canvas 类型
3. 在 `App.tsx` 中解除 `CanvasHost` 对 `activeTab === 'chat'` 的硬绑定
4. 在 gateway 侧加一个 `workbenchEvent` 字段作为 `canvasEvent` 的兼容别名

---

## 1. 架构判断

### 1.1 Canvas 继续当聊天抽屉 → 不适合

当前 Canvas 的定位本质上是"聊天的副产品展示区"。以下迹象说明已经越界：

| 迹象 | 位置 |
|------|------|
| `CanvasHost` 写死 `enabled={activeTab === 'chat'}` | `App.tsx:145` |
| `useMessages.ts` 直接 import `CanvasRoundtripContext` | `useMessages.ts:7` |
| `useWebSocket.ts` 的 options 里有 `onCanvasEvent` | `useWebSocket.ts:13` |
| `CanvasContext` 同时管 `isOpen`（UI）和 `documents`（数据） | `CanvasContext.tsx:55-60` |
| 节点点击（`onNodeInspect`）用一个 ref 传给 Chat 的 send 函数 | `CanvasContext.tsx:125` |

Canvas 已经不是"聊天功能的一个小抽屉"，它管理有生命周期的 artifact，支持多文档切换，还需要反向向聊天注入上下文（roundtrip）。应该把它提升为独立子系统。

### 1.2 推荐命名：Workbench，而非 Studio

| 候选名 | 评价 |
|--------|------|
| `Canvas` | 含义窄，容易联想到绘图/前端白板，不适合装代码/文档/图表 |
| `Studio` | 偏创意工具感，不符合 OCT 的技术助手定位 |
| `Workbench` | 工程感强，中性，可容纳图、文、代码、文档，VS Code 也用这个词 |
| `Artifact` | 准确但太偏概念层，不适合作为 UI 子系统名称 |

**结论：用 `Workbench` 作为新系统的统一命名前缀，旧的 `canvas` 保留为 Workbench 的内部实现细节或兼容别名。**

---

## 2. 分层设计

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Conversation Layer（对话层）                        │
│  ChatTab.v2.tsx · useMessages.ts · useWebSocket.ts           │
│  职责：消息生命周期、流式渲染、用户输入、TTS/ASR              │
│  边界：只能通过 WorkbenchBus 发布命令，不直接操作 Workbench   │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Workbench Layer（工作台层）                         │
│  WorkbenchContext · WorkbenchSession · WorkbenchHost         │
│  职责：管理工作台开关、活跃文档、会话级状态、命令路由         │
│  边界：不感知聊天内容，只消费 WorkbenchCommand               │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Artifact Domain Layer（产物领域层）                 │
│  WorkbenchDocument · ArtifactSchema · DocumentStore          │
│  职责：纯数据：文档 CRUD、版本、元信息、生命周期              │
│  边界：纯数据操作，无 React，可独立测试                       │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Renderer Plugin Layer（渲染插件层）                 │
│  plugins/reactFlowPlugin · diagramPlugin · echartsPlugin ... │
│  职责：根据 artifactType 选择渲染引擎，封装 Renderer 组件      │
│  边界：只读 WorkbenchDocument，不写状态                       │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: AI Integration Layer（AI 集成层）                   │
│  oct-gateway/tools/canvas.js → workbench tool               │
│  oct-gateway/runtime/contextBuilder.js                       │
│  职责：模型 tool call → WorkbenchCommand，roundtrip 上下文注入│
│  边界：产出标准 WorkbenchEvent，前端不感知网关实现细节        │
├─────────────────────────────────────────────────────────────┤
│  Layer 6: Persistence / Session Layer（持久化层）             │
│  目前：纯内存。未来：IndexedDB / IPC → electron userData     │
│  职责：跨 Tab、跨重启保留 artifact 会话                       │
└─────────────────────────────────────────────────────────────┘
```

### 层间通信规则

```
Conversation → Workbench：  只通过 WorkbenchBus.dispatch(WorkbenchCommand)
Workbench → Conversation：  只通过 WorkbenchBus.subscribe(WorkbenchEvent)
AI → Workbench：           Gateway 返回 workbenchEvent，
                           useWebSocket 作为 transport 透传，不解析
Workbench → AI：           getRoundtripContext() 由 WorkbenchContext 暴露，
                           useMessages 通过 WorkbenchBus.getContext() 读取
```

---

## 3. 目标模块关系图

```
用户输入
   │
   ▼
ChatTab.v2.tsx
   │  sendMessage(text, canvasRoundtripCtx)
   │  ← WorkbenchBus.getContext()
   ▼
useMessages.ts
   │  构建请求 payload（含 workbench roundtrip）
   ▼
useWebSocket.ts ─────────────────────────────────────────┐
   │  on('workbenchEvent') / on('canvasEvent' compat)     │
   │                                                      │ transport
   ▼                                                      ▼
WorkbenchBus                              oct-gateway/tools/canvas.js
   │  dispatch(WorkbenchCommand)           ↑ AI tool call
   ▼                                       │
WorkbenchContext                          oct-gateway/runtime/contextBuilder.js
   │  applyCommand(cmd)                    （注入 workbench roundtrip 上下文）
   ├──→ DocumentStore.create/update/delete
   ├──→ setActiveDocumentId
   └──→ setIsOpen
         │
         ▼
WorkbenchHost（脱离 chat-only 绑定，全局挂载）
   │
   ▼
WorkbenchPanel
   │  resolvePlugin(activeDocument.artifactType)
   ▼
RendererPlugin.render(document)
   ├── ReactFlowRenderer
   ├── MermaidRenderer
   ├── EChartsRenderer
   ├── MarkdownRenderer
   └── CodeRenderer（未来：TextWorkbench / DocWorkbench）
```

---

## 4. 目录结构建议

不推翻现有目录，做最小增量。

```
src/
├── workbench/                        ← 新建，Workbench 子系统根目录
│   ├── index.ts                      ← 导出公开 API
│   ├── WorkbenchContext.tsx          ← 原 CanvasContext 拆分后的核心，Phase 1
│   ├── WorkbenchBus.ts               ← 事件总线，Phase 1
│   ├── DocumentStore.ts              ← 纯数据层，从 Context 抽出，Phase 1
│   ├── types.ts                      ← WorkbenchDocument / WorkbenchCommand / WorkbenchEvent
│   └── plugins/                      ← 现有 src/components/canvas/plugins/ 迁入
│       ├── index.ts
│       ├── reactFlowPlugin.tsx
│       ├── diagramPlugin.tsx
│       ├── echartsPlugin.tsx
│       ├── markdownPlugin.tsx
│       ├── codePlugin.tsx
│       └── htmlPlugin.tsx
│
├── components/
│   ├── workbench/                    ← 新建
│   │   ├── WorkbenchHost.tsx         ← 原 CanvasHost，Phase 2
│   │   ├── WorkbenchPanel.tsx        ← 原 CanvasPanel，Phase 2
│   │   └── WorkbenchHost.css
│   │
│   └── canvas/                       ← 保留！作为兼容层，Phase 1-2 期间保持可用
│       ├── CanvasHost.tsx            ← Phase 2 后改为 re-export WorkbenchHost
│       ├── plugins/                  ← Phase 2 后改为 re-export workbench/plugins
│       └── ...renderers（不动）
│
├── contexts/
│   └── CanvasContext.tsx             ← Phase 1 后改为：import + re-export WorkbenchContext
│
└── hooks/
    ├── useCanvasBridge.ts            ← Phase 2 后改为 re-export useWorkbenchBridge
    └── useWorkbenchBridge.ts         ← Phase 2 新建
```

### Gateway 侧

```
oct-gateway/
└── tools/
    ├── canvas.js                     ← 保留，Phase 4 在返回值中追加 workbenchEvent 字段
    └── workbench.js                  ← Phase 4 新建，canvas.js 的真正继承者（可选）
```

---

## 5. 渐进式重构路线（5 阶段）

### Phase 1 — 拆分 CanvasContext，抽 WorkbenchBus（估计：1~2天）

**目标：** 把"文档数据"和"UI 状态"从一个 Context 里分离，引入事件总线消除 import 耦合。

**改哪些文件：**

| 文件 | 操作 |
|------|------|
| `src/workbench/types.ts` | 新建：`WorkbenchDocument` / `WorkbenchCommand` / `WorkbenchEvent`，与现有类型 1:1 映射 |
| `src/workbench/DocumentStore.ts` | 新建：纯 reducer 函数，从 `CanvasContext` 抽出 CRUD 逻辑 |
| `src/workbench/WorkbenchBus.ts` | 新建：`dispatch(cmd)` / `subscribe(handler)` / `getContext()` |
| `src/workbench/WorkbenchContext.tsx` | 新建：使用 `DocumentStore` + `WorkbenchBus`，取代原来的肥 Context |
| `src/contexts/CanvasContext.tsx` | 改为 re-export `WorkbenchContext` 的所有内容 + 保留旧 type aliases |
| `src/hooks/useCanvasBridge.ts` | 改为通过 `WorkbenchBus` 操作，不直接依赖 `useCanvas()` |
| `src/hooks/useMessages.ts` | 改为通过 `WorkbenchBus.getContext()` 获取 roundtrip context，不直接 import canvas 类型 |

**风险：** CanvasContext re-export 期间要保证所有 consumer 无感知。  
**兼容策略：** `CanvasContext.tsx` 保持原有所有导出名，只是内部 delegate 到 `WorkbenchContext`。

---

### Phase 2 — WorkbenchHost 脱离 chat 绑定（估计：半天）

**目标：** `WorkbenchHost` 全局挂载，不再受 `activeTab === 'chat'` 限制。

**改哪些文件：**

| 文件 | 操作 |
|------|------|
| `src/components/workbench/WorkbenchHost.tsx` | 新建，复制 `CanvasHost.tsx` 逻辑 |
| `src/components/workbench/WorkbenchPanel.tsx` | 新建，复制 `CanvasPanel.tsx` 逻辑，使用 `WorkbenchContext` |
| `src/App.tsx` | 将 `<CanvasHost enabled={activeTab === 'chat'} />` 改为 `<WorkbenchHost />`（无条件挂载） |
| `src/components/canvas/CanvasHost.tsx` | 改为 `export { WorkbenchHost as default } from '../workbench/WorkbenchHost'` |

**风险：** 工作台在非 chat Tab 也可见，需要确认 UI 布局不冲突（目前其他 Tab 全屏，drawer 模式不影响）。  
**兼容策略：** `WorkbenchHost` 内部判断"是否有 activeDocument"，无文档时仍然不展开 drawer，视觉上无变化。

---

### Phase 3 — Gateway 事件格式扩展，加 workbenchEvent 兼容别名（估计：半天）

**目标：** 让 gateway 侧开始使用 `workbenchEvent` 字段，前端同时兼容两个字段名，为日后改名铺路。

**改哪些文件：**

| 文件 | 操作 |
|------|------|
| `oct-gateway/tools/canvas.js` | `execute()` 返回值增加 `workbenchEvent: canvasEvent`（同内容，不同 key） |
| `src/hooks/useWebSocket.ts` | 收到消息时优先读 `workbenchEvent`，fallback 读 `canvasEvent`，统一发给 `WorkbenchBus.dispatch()` |

**风险：** 几乎没有，只加字段不删字段。  
**兼容策略：** 旧前端（canvasEvent）和新前端（workbenchEvent）同时能工作。

---

### Phase 4 — Renderer Plugin 注册机制标准化（估计：1天）

**目标：** 把 `src/components/canvas/plugins/` 迁移到 `src/workbench/plugins/`，插件注册改为显式列表，方便未来按 artifactType 动态加载。

**改哪些文件：**

| 文件 | 操作 |
|------|------|
| `src/workbench/plugins/index.ts` | 新建，显式导出插件数组 `WORKBENCH_PLUGINS: RendererPlugin[]` |
| `src/workbench/plugins/*.tsx` | 从 `canvas/plugins/` 复制过来（内容不变） |
| `src/components/workbench/WorkbenchPanel.tsx` | 改用 `WORKBENCH_PLUGINS` |
| `src/components/canvas/plugins/index.ts` | 改为 re-export `src/workbench/plugins/index.ts` |

**风险：** 插件 API 不变，风险极低。  
**兼容策略：** 旧的 `resolveCanvasPlugin()` 函数保留，内部 delegate 到 workbench/plugins。

---

### Phase 5 — 新增第一个非图表工作台（里程碑验证）

**目标：** 验证架构可扩展，新增一个 `text-gen` 工作台（文本生成工作台）作为第一个非图表 artifact 类型扩展。

**改哪些文件：**

| 文件 | 操作 |
|------|------|
| `src/workbench/types.ts` | 在 `WorkbenchArtifactType` 中追加 `'text-gen'` |
| `src/workbench/plugins/textGenPlugin.tsx` | 新建，`canRender: doc => doc.artifactType === 'text-gen'`，render 为富文本编辑器 |
| `oct-gateway/tools/canvas.js` 或新 `workbench.js` | 在 `artifactType` enum 中追加 `'text-gen'` |

**里程碑意义：** 如果这一步能在不改动 ChatTab / useMessages / WorkbenchContext 核心逻辑的情况下完成，说明架构分层已经成功。

---

## 6. 核心抽象定义

### 6.1 WorkbenchDocument（原 CanvasDocument）

```typescript
// src/workbench/types.ts

export type WorkbenchArtifactType =
  | 'document'     // Markdown 文档
  | 'diagram'      // Mermaid 图
  | 'react-flow'   // 交互节点图
  | 'echart'       // ECharts 数据图表
  | 'code'         // 代码
  | 'ui-draft'     // HTML 预览
  | 'text-gen';    // 未来：文本生成工作台（Phase 5）

export type WorkbenchMode = 'markdown' | 'code' | 'html';
export type WorkbenchDocumentStatus = 'draft' | 'refining' | 'final';

export interface WorkbenchDocument {
  id: string;
  title: string;
  artifactType: WorkbenchArtifactType;
  mode: WorkbenchMode;
  content: string;
  language: string;
  origin: 'ai' | 'user';
  sourceMessageId?: string;
  explanation?: string;
  status: WorkbenchDocumentStatus;
  version: number;
  createdAt: number;
  updatedAt: number;
}
```

**与 CanvasDocument 的映射关系：** 字段完全一致，只是类型名和 ArtifactType 枚举名变化。迁移时用 `type CanvasDocument = WorkbenchDocument` 别名即可。

---

### 6.2 WorkbenchCommand（新增，取代零散的事件调用）

```typescript
// src/workbench/types.ts

export type WorkbenchCommand =
  | { type: 'create'; payload: WorkbenchCreatePayload }
  | { type: 'update'; payload: WorkbenchUpdatePayload }
  | { type: 'focus';  payload: { documentId: string } }
  | { type: 'delete'; payload: { documentId: string } }
  | { type: 'explain'; payload: { documentId: string; explanation: string } }
  | { type: 'open-panel' }
  | { type: 'close-panel' };
```

**与 CanvasEvent 的关系：** `CanvasEvent` 里的 `{ type: 'canvas'; action: ... }` 对应 `WorkbenchCommand` 的各 `type`。迁移时 `applyCanvasEvent` 改为 `bus.dispatch(toWorkbenchCommand(event))`。

---

### 6.3 WorkbenchEvent（对外广播）

```typescript
// src/workbench/types.ts

export type WorkbenchEvent =
  | { type: 'document-created'; document: WorkbenchDocument }
  | { type: 'document-updated'; documentId: string; patch: Partial<WorkbenchDocument> }
  | { type: 'document-deleted'; documentId: string }
  | { type: 'active-changed';   documentId: string | null }
  | { type: 'panel-opened' }
  | { type: 'panel-closed' };
```

**用途：** 聊天侧如果需要响应 Workbench 变化（如产物创建后在消息中展示 badge），订阅此事件，而不是轮询 Context。

---

### 6.4 WorkbenchBus（解耦核心）

```typescript
// src/workbench/WorkbenchBus.ts

export class WorkbenchBus {
  dispatch(cmd: WorkbenchCommand): void;
  subscribe(handler: (event: WorkbenchEvent) => void): () => void; // 返回 unsubscribe
  getContext(): WorkbenchRoundtripContext; // 给 chat 侧注入 AI 上下文用
}

export const workbenchBus = new WorkbenchBus();
```

**与 useCanvasBridge 的关系：** `useCanvasBridge` 保留作为 React hook 形态的 WorkbenchBus adapter，内部调用 `workbenchBus.dispatch()`，不再直接操作 CanvasContext。

---

### 6.5 WorkbenchSession（未来，Phase 5+）

```typescript
// src/workbench/WorkbenchSession.ts（未来）

export interface WorkbenchSession {
  sessionId: string;
  conversationId?: string;   // 绑定的聊天会话（可选，非强制）
  documents: WorkbenchDocument[];
  activeDocumentId: string | null;
  createdAt: number;
  updatedAt: number;
}
```

**现在还不需要实现**，但数据结构应该在 Phase 1 设计时就预留 `conversationId` 字段，避免后来改型。

---

### 6.6 RendererPlugin（现有，已较好）

```typescript
// src/workbench/plugins/types.ts（从 canvas/plugins/types.ts 迁移）

export interface RendererPlugin {
  id: string;
  canRender: (document: WorkbenchDocument) => boolean;
  render: (document: WorkbenchDocument) => React.ReactNode;
  getExportFilename?: (document: WorkbenchDocument) => string;
}
```

当前 `src/components/canvas/plugins/types.ts` 的 `CanvasRendererPlugin` 已经是正确形态，只需改类型名引用。

---

## 7. 最小可行重构（第一批落地）

**如果你只有一个下午，先做这 4 件事：**

### Step A：新建 `src/workbench/types.ts`

- 把 `CanvasDocument` / `CanvasEvent` / `CanvasRoundtripContext` 从 `CanvasContext.tsx` 中复制过来
- 改名为 `WorkbenchDocument` / `WorkbenchCommand` / `WorkbenchRoundtripContext`
- 在 `CanvasContext.tsx` 中加 `export type CanvasDocument = WorkbenchDocument`（别名，保持兼容）

### Step B：新建 `src/workbench/DocumentStore.ts`

把 `CanvasContext.tsx` 里的这些函数抽成纯函数（无 React 依赖）：
- `createCanvasDocument()` → `createWorkbenchDocument()`
- state reducer 逻辑（create/update/delete/focus）

### Step C：`CanvasContext.tsx` 改为 delegate 到 DocumentStore

- 用 `useReducer` 替换现有的多个 `useState` + `useCallback`
- `documents` 和 `activeDocumentId` 改为 reducer 管理
- `isOpen` 仍然是独立 UI state（不进 reducer）

### Step D：`useMessages.ts` 不再直接 import `CanvasRoundtripContext`

- 改为通过 `useCanvasBridge().getRoundtripContext()` 获取（现在已经有这个方法了）
- 删掉 `useMessages.ts:7` 的 `import type { CanvasRoundtripContext }`

---

## 8. 不该动的东西（Phase 1-2 内）

| 不要动 | 原因 |
|--------|------|
| `oct-gateway/tools/canvas.js` 的函数名/返回格式 | 已有稳定调用链，改名引入风险 |
| `src/components/canvas/plugins/` 插件文件内容 | 插件逻辑稳定，搬运不改内容 |
| `MermaidRenderer` / `ReactFlowRenderer` / `EChartsRenderer` | 渲染器稳定，无需碰 |
| `ChatTab.v2.tsx` 里的 `useCanvasBridge` 调用 | 通过 bridge hook 解耦，ChatTab 不直接感知迁移 |
| WebSocket 协议格式 | 协议改动需要前后端同步，Phase 3 再处理 |

---

## 9. 未来工作台扩展路径

当 Phase 1-4 完成后，新增工作台只需：

1. 在 `WorkbenchArtifactType` 加新 type（如 `'text-gen'`）
2. 在 `src/workbench/plugins/` 加一个 `textGenPlugin.tsx`
3. 在 `oct-gateway/tools/canvas.js` 的 `artifactType` enum 加值
4. 完成，不需要碰 ChatTab / useMessages / WorkbenchContext

这就是"未来文本工作台/文档工作台/代码工作台"的扩展路径，全部落在 **Renderer Plugin Layer**，不影响上面的层。

---

## 10. 相关文档更新计划

本方案落地时，需同步更新：

| 文档 | 更新内容 |
|------|----------|
| `docs/02_architecture/FEATURE_MAP.md` | 新增 Workbench 子系统模块条目 |
| `docs/02_architecture/diagram-routing-strategy.md` | 把"Canvas 图"改为"Workbench 图" |
| `docs/03_specs/WEBSOCKET_PROTOCOL.md` | Phase 3 完成后，补 `workbenchEvent` 字段说明 |
| `docs/00_ai_entry/README.md` | 增加"Workbench 产物展示"问题类型入口 |
| `docs/05_changelog/` | 每个 Phase 完成后补 changelog |

---

## 附录：当前文件与目标文件的映射

| 当前文件 | 目标位置 | 操作 |
|----------|----------|------|
| `src/contexts/CanvasContext.tsx` | 保留为 re-export 兼容层 | 改写，delegate 到 workbench/ |
| `src/components/canvas/CanvasHost.tsx` | `src/components/workbench/WorkbenchHost.tsx` | 新建，旧文件改为 re-export |
| `src/components/CanvasPanel.tsx` | `src/components/workbench/WorkbenchPanel.tsx` | 新建，旧文件改为 re-export |
| `src/components/canvas/plugins/*.tsx` | `src/workbench/plugins/*.tsx` | 复制（内容不变），旧文件改为 re-export |
| `src/hooks/useCanvasBridge.ts` | 保留，内部改用 WorkbenchBus | 改写，保持 hook 接口不变 |
| `oct-gateway/tools/canvas.js` | 保留，追加 `workbenchEvent` 别名字段 | 增量改写 |

---

## 落地情况（2026-04-21 补注）

| 阶段 | 文档目标 | 实际代码路径 | 状态 |
|---|---|---|---|
| Phase 1 | 拆 `CanvasContext`、引入 `WorkbenchBus`、建立 `src/workbench/` 基础层 | `src/workbench/types.ts`, `src/workbench/DocumentStore.ts`, `src/workbench/WorkbenchBus.ts`, `src/workbench/WorkbenchContext.tsx`, `src/contexts/CanvasContext.tsx` | ✅ |
| Phase 2 | 引入 `WorkbenchHost/WorkbenchPanel`，解除 chat-only 绑定 | `src/components/workbench/WorkbenchHost.tsx`, `src/components/workbench/WorkbenchPanel.tsx`, `src/components/CanvasPanel.tsx`, `src/components/canvas/CanvasHost.tsx`, `src/App.tsx` | ✅ |
| Phase 3 | Gateway / 前端兼容 `workbenchEvent` | `oct-gateway/tools/canvas.js`, `oct-gateway/runtime/toolLoop.js`, `src/hooks/useWebSocket.ts`, `docs/03_specs/WORKBENCH_EVENT_COMPAT.md` | ✅ |
| Phase 4 | 插件注册迁移到 `src/workbench/plugins/` | `src/workbench/plugins/index.ts`, `src/workbench/plugins/*.tsx`, `src/components/canvas/plugins/index.ts` | ✅ |
| Phase 5 | 验证工作台可扩展到非图表 artifact | `src/workbench/plugins/scriptPlugin.tsx`, `src/workbench/types.ts`, `src/components/workbench/DocumentAppendBar.tsx` | ✅ |

说明：
- 本文档已从“待落地 proposal”转为“已落地设计基线”，保留其架构判断、边界和阶段拆分，供后续继续演进时参考。
- 真实演进记录可交叉查看 `docs/05_changelog/2026-04-12-workbench-foundation-phase1.md` 到 `phase4.md` 以及 2026-04-15 / 2026-04-18 的 workbench 相关 changelog。
