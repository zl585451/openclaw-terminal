# Canvas Expression Workbench Implementation Plan

## 1. Goal

将现有 `Canvas` 从“单块内容的预览/编辑抽屉”升级为“AI 的第二表达通道”：

- Chat 负责对话、追问、解释
- Canvas 负责承载复杂成果物，如结构化文档、图表、UI 草稿、代码产物
- AI 可以主动创建和更新 Canvas 内容
- 用户可以在 Canvas 中编辑，再继续让 AI 基于当前内容迭代

这次实施优先追求“表达工作流成立”，暂不追求一次性做完独立窗口、拖拽布局、复杂图形编辑器。

## 2. Product Definition

### 2.1 Canvas 的产品定位

Canvas 是 OCT 中 AI 输出复杂成果物的工作台，而不是单纯的文本编辑器。

用户体验目标：

- 当问题适合用结构化内容表达时，AI 除了聊天回复，还会同步生成一个 Canvas artifact
- 用户打开 Canvas 后，看到的是一份“可消费的成果物”，而不是一大段原始文本
- 用户修改内容后，可以继续要求 AI “完善”、“解释”、“重写”、“转换表现形式”

### 2.2 第一阶段支持的 Artifact 类型

第一期只做 4 类，避免泛化过早：

1. `document`
适用于方案拆解、PRD 草稿、研究总结、需求梳理

2. `diagram`
适用于 Mermaid 流程图、架构图、时序图、状态图

3. `ui-draft`
适用于 HTML/CSS 原型、卡片布局、信息架构草图

4. `code`
适用于组件草稿、函数草稿、配置样例、脚本

## 3. Current State Assessment

### 3.1 已有基础

- 前端已有 `CanvasContext`，但当前是单文档状态
- 聊天代码块已支持“Open”到 Canvas
- `CanvasPanel` 已有预览、编辑、复制、导出、发送给 AMY 的交互
- 已有一版 Claude 风格 Canvas 抽屉样式

### 3.2 当前短板

- 只有 `markdown | code | html` 三种底层模式，没有 artifact 概念
- 只有单个 `content`，无法支撑多文档/多成果物工作区
- WebSocket 协议没有 `canvas` 一等消息类型
- Gateway 不能主动触发或更新 Canvas
- 用户编辑后的内容没有结构化回流给 AI
- 界面更像“编辑器”，不像“成果工作台”

## 4. Technical Strategy

### 4.1 总体原则

- 先建立数据模型和通信协议，再做复杂 UI
- 先做右侧抽屉工作区，再考虑独立窗口
- 先做规则触发，再做模型自主判断
- 先做 4 类固定 artifact，再考虑自定义类型

### 4.2 架构路线

#### Frontend

- 将 `CanvasContext` 升级为多文档 store
- `CanvasPanel` 升级为 workspace 视图
- `useWebSocket` 新增 `canvas` 事件接收
- 新增 artifact renderer 层

#### Gateway

- 新增 `canvas` 工具
- 在 `orchestrator` 中增加 Canvas 触发决策
- 在流式回复过程中允许推送 Canvas 创建/更新事件

#### Protocol

- 定义统一的 `canvas` event 协议
- 定义前端发回 AI 的 `canvas context` 协议

## 5. Phase Plan

## Phase 0: Groundwork and Data Model

### Objective

把当前单文档 Canvas 升级为可持续扩展的多 artifact 工作区。

### Deliverables

- 重构 `CanvasContext` 的状态模型
- 引入 `CanvasDocument`、`CanvasArtifactType`、`CanvasVersion` 等类型
- 保持当前抽屉 UI 可用，不破坏已有 Open 按钮体验

### Proposed Types

```ts
export type CanvasArtifactType = 'document' | 'diagram' | 'ui-draft' | 'code';

export type CanvasRenderMode = 'markdown' | 'mermaid' | 'html' | 'code';

export interface CanvasDocument {
  id: string;
  title: string;
  artifactType: CanvasArtifactType;
  renderMode: CanvasRenderMode;
  content: string;
  language?: string;
  origin: 'ai' | 'user';
  sourceMessageId?: string;
  explanation?: string;
  status: 'draft' | 'refining' | 'final';
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface CanvasState {
  isOpen: boolean;
  documents: CanvasDocument[];
  activeDocumentId: string | null;
}
```

### Files to Change

- `src/contexts/CanvasContext.tsx`
- `src/components/CanvasPanel.tsx`
- `src/ui/chat/markdownComponents.tsx`

### Acceptance Criteria

- 代码块“Open”后仍能打开 Canvas
- Canvas 支持管理多个 document
- 用户切换 active document 不会丢失内容
- 原有 markdown/code/html 预览能力继续可用

## Phase 1: Canvas Event Protocol

### Objective

让 Canvas 成为协议中的一等消息类型，而不是前端本地孤岛。

### Event Shape

```ts
type CanvasEvent =
  | {
      type: 'canvas';
      action: 'create';
      payload: { document: CanvasDocument };
    }
  | {
      type: 'canvas';
      action: 'update';
      payload: {
        documentId: string;
        patch: Partial<CanvasDocument>;
      };
    }
  | {
      type: 'canvas';
      action: 'focus';
      payload: { documentId: string };
    }
  | {
      type: 'canvas';
      action: 'delete';
      payload: { documentId: string };
    }
  | {
      type: 'canvas';
      action: 'explain';
      payload: {
        documentId: string;
        explanation: string;
      };
    };
```

### Frontend Work

- `useWebSocket.ts` 中识别 `type === 'canvas'` 或 `event === 'canvas'`
- 将 Canvas 事件分发给 store
- 若收到 `create/focus`，自动展开右侧抽屉

### Gateway Work

- 明确 `oct-gateway/index.js` 或 `ai.js` 的消息透传方式
- 增加发送 `canvas` event 的帮助方法

### Files to Change

- `src/hooks/useWebSocket.ts`
- `oct-gateway/index.js`
- `docs/03_specs/WEBSOCKET_PROTOCOL.md`

### Acceptance Criteria

- 前端可接收并消费 `canvas create/update/focus`
- 文档协议同步更新
- 未接入 Canvas 的普通聊天不受影响

## Phase 2: Gateway Canvas Tool

### Objective

让 AI 可以明确调用工具来创建或更新 Canvas，而不是靠前端猜测文本内容。

### Tool Design

建议新增：

- `create_canvas`
- `update_canvas`
- `focus_canvas`

也可以合并为单个 `canvas` 工具，用 `action` 参数区分。

### Suggested Schema

```js
{
  name: 'canvas',
  description: 'Create or update a canvas artifact for complex structured output',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create', 'update', 'focus']
      },
      documentId: { type: 'string' },
      title: { type: 'string' },
      artifactType: {
        type: 'string',
        enum: ['document', 'diagram', 'ui-draft', 'code']
      },
      renderMode: {
        type: 'string',
        enum: ['markdown', 'mermaid', 'html', 'code']
      },
      content: { type: 'string' },
      language: { type: 'string' },
      explanation: { type: 'string' }
    },
    required: ['action']
  }
}
```

### Files to Change

- `oct-gateway/tools/canvas.js`
- `oct-gateway/tools.js`
- `oct-gateway/tool_loader.js`
- `oct-gateway/ai.js`

### Acceptance Criteria

- AI 能通过工具创建 artifact
- AI 能增量更新已有 artifact
- 工具事件和 Canvas 事件能在前端联动展示

## Phase 3: Triggering Strategy

### Objective

控制“什么时候自动开 Canvas”，避免误触发。

### Strategy

先采用“双轨触发”：

1. 规则强触发
- 用户明确说“画流程图”“梳理方案”“做页面草图”“输出成文档”

2. 模型辅助触发
- 系统 prompt 提示：当内容明显更适合结构化表达时，可创建 Canvas artifact

### Initial Rules

强触发关键词建议：

- `流程图`
- `架构图`
- `时序图`
- `状态图`
- `梳理方案`
- `整理成文档`
- `做个草图`
- `页面结构`
- `信息架构`
- `PRD`

### Files to Change

- `oct-gateway/orchestrator.js`
- `resources/system_prompts/*.md` 中与工具使用有关的提示词

### Acceptance Criteria

- 简单聊天不触发 Canvas
- 明确结构化请求时高概率触发 Canvas
- 误触发率可控

## Phase 4: Workspace UI

### Objective

让 Canvas 从“编辑器”升级成“成果工作台”。

### UI Structure

- 左侧：artifact 列表
- 中间：预览区 / 编辑区
- 右侧：AI explanation / refine action
- 顶部：artifact 类型、标题、版本、来源信息
- 底部：协作动作区

### Core Actions

- `Continue`
基于当前 artifact 继续完善

- `Explain`
只解释，不改内容

- `Rewrite`
基于用户改动重写

- `Convert`
在 document / diagram / ui-draft / code 之间转换表达形式

### Files to Change

- `src/components/CanvasPanel.tsx`
- `src/components/CanvasPanel.css`
- 可拆分新增：
  - `src/components/canvas/CanvasSidebar.tsx`
  - `src/components/canvas/CanvasArtifactView.tsx`
  - `src/components/canvas/CanvasAssistantPanel.tsx`
  - `src/components/canvas/CanvasToolbar.tsx`

### Acceptance Criteria

- 用户能直观看到多个 artifact
- 用户能切换预览/编辑
- 用户能从 Canvas 直接发起 AI 协作动作

## Phase 5: Specialized Renderers

### Objective

补齐不同 artifact 的最佳表现形式。

### Renderers

- `markdown` renderer
- `code` renderer
- `html` preview renderer
- `mermaid` renderer

### Notes

- Mermaid 放在这一阶段，不要阻塞前面协议和数据模型
- Mermaid 渲染失败时要降级为源码展示
- HTML 预览继续放在 sandbox iframe 内

### Files to Add

- `src/components/canvas/MermaidRenderer.tsx`
- `src/components/canvas/ArtifactRenderer.tsx`

### Acceptance Criteria

- `diagram` artifact 可以直接预览
- 渲染失败不致命

## Phase 6: Roundtrip Editing with AI

### Objective

打通“用户改 Canvas -> AI 感知 -> AI 继续迭代”的闭环。

### Interaction Model

前端在用户点击 `Continue / Rewrite / Explain` 时，向网关发送：

- 当前 active document 内容
- artifact 类型
- renderMode
- 用户附加指令
- 可选的最近一次版本信息

### Suggested Payload

```ts
{
  message: '请基于当前 Canvas 继续完善',
  canvasContext: {
    activeDocumentId: 'doc_xxx',
    documents: [...],
    userIntent: 'continue'
  }
}
```

### Files to Change

- `src/hooks/useWebSocket.ts`
- `src/hooks/useMessages.ts`
- `src/components/CanvasPanel.tsx`
- `electron/main.ts`
- `oct-gateway/index.js`

### Acceptance Criteria

- AI 能感知当前 artifact 内容
- AI 的回复和 Canvas 更新能保持一致

## Phase 7: Polish and Optional Window Mode

### Objective

在主链路稳定后再做体验增强。

### Optional Enhancements

- 独立 Canvas BrowserWindow
- 拖拽排序 / 分组
- 导出 PNG / SVG
- 版本历史
- Canvas 内评论批注
- 多 artifact 并排对比

### Rule

这些能力全部排在核心工作流稳定之后，不提前插队。

## 6. Suggested File Map

### Existing Files to Refactor

- `src/contexts/CanvasContext.tsx`
- `src/components/CanvasPanel.tsx`
- `src/components/CanvasPanel.css`
- `src/hooks/useWebSocket.ts`
- `src/ui/chat/markdownComponents.tsx`
- `oct-gateway/orchestrator.js`
- `oct-gateway/ai.js`

### New Files to Add

- `src/components/canvas/ArtifactRenderer.tsx`
- `src/components/canvas/MermaidRenderer.tsx`
- `src/components/canvas/CanvasSidebar.tsx`
- `src/components/canvas/CanvasToolbar.tsx`
- `src/components/canvas/CanvasAssistantPanel.tsx`
- `oct-gateway/tools/canvas.js`

## 7. Milestone Breakdown

### Milestone A

完成数据模型升级，保留现有 Canvas 基础体验。

预计结果：

- 可多文档
- 可切换 active document
- 现有 Open 按钮无回归

### Milestone B

打通 Canvas 协议与 AI 主动创建。

预计结果：

- AI 可主动创建 artifact
- 前端可自动打开并聚焦对应内容

### Milestone C

完成工作台 UI 与核心协作动作。

预计结果：

- Continue / Explain / Rewrite 可用
- 多 artifact 工作流成立

### Milestone D

补齐 Mermaid 与表现层，接近 Claude 风格表达能力。

## 8. Risks and Mitigations

### Risk 1: 误触发过多

Mitigation:

- 规则优先
- 只对高价值结构化场景开放自动触发
- 记录触发日志，便于调参

### Risk 2: 数据模型改动引发回归

Mitigation:

- 保留兼容层，如 `openCanvas(content, mode, title, language)` 内部转换成 document
- 先不改聊天主链路，只替换 Canvas 内部 store

### Risk 3: Mermaid 渲染不稳定

Mitigation:

- 延后到 Phase 5
- 渲染失败时回退源码视图

### Risk 4: Canvas 与 chat 状态脱节

Mitigation:

- 每个 artifact 记录 `sourceMessageId`
- Canvas 更新通过协议流转，不靠局部猜测

## 9. Verification Plan

每个阶段都执行以下验证：

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npx vitest run`

Canvas 相关专项验证：

- 聊天代码块打开 Canvas
- AI 主动创建 Canvas artifact
- 切换 artifact 不丢内容
- 用户修改后触发继续完善
- Mermaid 错误输入时安全降级

## 10. Recommended Start Order

建议开工顺序：

1. Phase 0: 重构 `CanvasContext`
2. Phase 1: 接入 `canvas` 协议
3. Phase 2: 新增 gateway canvas tool
4. Phase 3: 增加触发策略
5. Phase 4: 重构 `CanvasPanel` 为 workspace
6. Phase 5: 接入 Mermaid renderer
7. Phase 6: 打通 roundtrip editing

## 11. Definition of Done for the First Usable Version

满足以下条件，即认为第一版可用：

- AI 可在合适场景主动创建 Canvas artifact
- Canvas 至少支持 `document`、`diagram`、`code`
- 用户能在 Canvas 中编辑并继续让 AI 完善
- Chat 与 Canvas 能双向联动
- 常规聊天体验无明显回归
