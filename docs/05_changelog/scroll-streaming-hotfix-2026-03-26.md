# Scroll & Streaming Hotfix Report - 2026-03-26

> 本文档记录 2026-03-26 对 Chat UI 滚动与流式体验的连续热修复结果。

---

## 目标

- 发送消息后，用户消息可靠锚定到视口顶部。
- 流式短回复不反向拉回历史消息。
- 流式长回复超出视口后自动恢复跟底。
- 避免底部永久大空白，流式完成后收回 spacer。
- 将 VOICE/SETTINGS/CONNECTED 迁移到 TabBar 右侧，减少聊天区头部抖动。

---

## 最终方案（已落地）

### 1) 顶部锚定与滚动时机

- `scrollAfterUserSend` 不再直接猜测 DOM 时机执行滚动，而是只设置标记：
  - `needsScrollToUserRef.current = true`
  - `scrollGraceUntilRef.current = Date.now() + 600`
- 在 `useEffect([messages.length])` 中执行实际锚定滚动，保证 React 完成渲染后再定位。

### 2) 跟底策略改为“只向下追”

- `scrollToBottom` 仅在内容末尾 `bottomRef` 超出可视区域时触发。
- 若 `bottomRef` 仍在可视区内（常见于短回复起始阶段），不滚动，保持用户消息在顶部。

### 3) 内容末尾锚点与 spacer 解耦

- `bottomRef` 调整到 spacer 之前，定义为“真实内容末尾”。
- 跟底时优先对齐 `bottomRef`，避免滚入 spacer 深处导致正文离开视口。

### 4) spacer 动态收放

- 底部 spacer 高度由固定值改为动态：
  - `isStreaming || awaitingResponse`：`75vh`
  - 其他状态：`30px`
- 增加 `min-height` 过渡，收起过程更平滑。

### 5) 标题栏 portal 化

- 聊天区内旧 `section-header` 移除。
- `VOICE / SETTINGS / CONNECTED` 通过 portal 渲染到 TabBar 右侧插槽（`#chat-header-portal`）。

---

## 涉及文件

- `src/components/ChatTab.tsx`
- `src/styles/ChatTab.css`
- `src/App.tsx`
- `src/styles/TabBar.css`

---

## 当前预期行为

- 发送后：用户消息贴近视口顶部，旧对话不被拉回。
- 短回复：AI 在用户消息下方生长，视口不抖动、不反向回拉。
- 长回复：当内容超过可视范围后自动跟底，最新内容保持可见。
- 结束后：底部空白回收，不再出现可持续下滚的大空白区域。
