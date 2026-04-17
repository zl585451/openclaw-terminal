# 2026-04-16 ActivityPanel Step 1（Keepalive + 数据层）

## 变更目标

- 落地 ActivityPanel 方案的 Step 1：仅增加 Gateway keepalive 事件与前端 timeline 数据层。
- 本阶段不改 UI 呈现，不替换 CoTBlock，不删除工具卡片。

## 代码变更

- [oct-gateway/index.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/index.js)
  - 在 `handleChatRequest` 中新增 `keepalive` 定时心跳（2s）：
    - 初始阶段：`waiting_first_token`
    - 首 token 后：`streaming`
    - 工具调用中：`tool_running`
    - 工具返回后：`waiting_continuation`
  - `onDone` / `onError` 中统一停止 keepalive 定时器。
  - 保持 `ai.js` 零宽空格心跳机制不变。

- [src/hooks/useWebSocket.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useWebSocket.ts)
  - 新增 `onKeepalive` 可选回调签名。
  - 在消息分发中新增 `keepalive` 事件分支并透传 payload。

- [src/hooks/useMessages.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useMessages.ts)
  - 新增 `ActivityEntry` / `ActivityEntryType` 类型与 `activityTimeline` 状态。
  - 新增发送阶段 timeline 初始化（`thinking_placeholder`）。
  - 新增 `onKeepalive` 回调，更新人格化等待提示（不重复堆叠最后一条 hint）。
  - 新增工具事件写入 timeline（`tool_call` / `tool_result`）。
  - 新增 CoT 同步节流（300ms），支持 `[cot]` / `<think>` / `<redacted_thinking>`。
  - `onChatDone` 清理临时条目（`keepalive_hint` / `thinking_placeholder`）。
  - 在 `useMessages` 返回值中暴露 `activityTimeline`（供 Step 2 UI 接入）。

## 验证

- `npx tsc --noEmit` 通过
- `npx tsc -p tsconfig.electron.json --noEmit` 通过
