# 2026-04-16 ActivityPanel Step 2（UI 合并）

## 变更目标

- 将助手消息中的 CoT 与工具调用状态统一为单一活动面板。
- 替代原有「`CoTBlock` + `tool-calls-container`」分离渲染。
- 保持执行链路不变，仅改 UI 呈现层。

## 代码变更

- [src/components/ActivityPanel.tsx](/e:/windows-window/OpenClaw-Terminal/src/components/ActivityPanel.tsx)
  - 新增统一活动面板组件：
    - 折叠/展开
    - 流式状态文案（基于 keepalive）
    - CoT 时间线
    - 工具调用/结果条目
  - 流式期间自动滚到底部。

- [src/styles/ActivityPanel.css](/e:/windows-window/OpenClaw-Terminal/src/styles/ActivityPanel.css)
  - 新增 ActivityPanel 样式（标题行、spinner、折叠动画、时间线条目、工具状态）。

- [src/ui/chat/MessageList.tsx](/e:/windows-window/OpenClaw-Terminal/src/ui/chat/MessageList.tsx)
  - `ChatMessageListProps` 新增 `activityTimeline`。
  - `ChatMessageItemProps` 新增 `activityTimeline` / `getToolDisplayName`。
  - 新增 `buildFinalizedTimeline()`：从已完成消息（CoT + `toolEvents`）构建最终时间线。
  - 头部区域改为：
    - 始终渲染 `MessageHeader`
    - 最后一条 assistant 消息渲染 `ActivityPanel`
  - 删除旧的 streaming 工具卡片块（`.tool-calls-container` 对应 JSX）。
  - 删除 assistant 正文内的 `ToolCard` 持久渲染，避免与 ActivityPanel 重复。

- [src/ui/chat/ChatTab.v2.tsx](/e:/windows-window/OpenClaw-Terminal/src/ui/chat/ChatTab.v2.tsx)
  - 向 `ChatMessageList` 透传 `activityTimeline={msgs.activityTimeline}`。

- [src/styles/ChatTab.css](/e:/windows-window/OpenClaw-Terminal/src/styles/ChatTab.css)
  - 移除 `.tool-calls-container` / `.tool-call-card*` 旧样式块及移动端对应样式。

## 验证

- `npx tsc --noEmit` 通过
- `npx tsc -p tsconfig.electron.json --noEmit` 通过
