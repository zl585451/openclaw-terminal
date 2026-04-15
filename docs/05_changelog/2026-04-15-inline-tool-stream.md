# 工具调用内联卡片（Inline Tool Stream）

> Date: 2026-04-15  
> Type: Feature

## 改动内容

### oct-gateway/runtime/toolLoop.js
- `onToolEvent` 的 `done` 和 `error` 事件新增 `elapsedMs` 字段，记录工具执行耗时

### src/ui/chat/ChatTab.v2.tsx
- 新增 `ToolEventItem` interface（已 export）
- `ChatMessage` 新增可选字段 `toolEvents?: ToolEventItem[]`

### src/hooks/useMessages.ts
- `onToolEvent` 回调在更新 `activeTools` 的同时，同步将事件附加到当前 streaming assistant 消息的 `toolEvents` 字段
- 工具完成后更新对应卡片的 `state / resultPreview / error / elapsedMs`

### src/ui/chat/ToolCard.tsx（新建）
- 工具调用内联卡片组件
- 显示工具名、参数预览、状态（执行中 / 完成 / 失败）、耗时
- 完成后支持点击展开结果预览

### src/ui/chat/MessageList.tsx
- import `ToolCard`
- 在 `AssistantMessageBody` 末尾（TypewriterCursor 前）渲染 `msg.toolEvents`
- 卡片持久显示，流式结束后不消失，历史消息也可见

## 与规范文档的差异
- `ChatMessage` 和 `ToolEventItem` 定义在 `ChatTab.v2.tsx`（非独立 types 文件），符合现有仓库结构
- `toolLoop.js` 的 `_toolStart` 已存在，只补了 `elapsedMs` 字段
- `activeTools` 右侧工具栏渲染保持不变，两套并行
