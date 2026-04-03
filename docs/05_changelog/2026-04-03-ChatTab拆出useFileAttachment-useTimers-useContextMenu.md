# 2026-04-03 ChatTab.v2.tsx 完整拆分重构

## 概述

按 ChatTab_v2.tsx 架构分层拆分计划，执行全部 6 步，从主文件抽出 ~2300 行代码到 9 个独立文件。

## 拆分成果

| 文件 | 行数 | 职责 |
|------|------|------|
| `src/hooks/useMessages.ts` | ~676 | 消息状态 + WebSocket 通信 + FSM 状态机 |
| `src/hooks/useScrollManager.ts` | ~207 | 滚动管理 + ScrollAnchor |
| `src/hooks/useFileAttachment.ts` | ~187 | 文件上传/截图/拖拽/粘贴 |
| `src/hooks/useTimers.ts` | ~50 | 时钟更新 + window focus 监听 |
| `src/hooks/useContextMenu.ts` | ~46 | 右键菜单状态 + 操作 |
| `src/components/ContextMenu.tsx` | ~86 | 右键菜单渲染组件 |
| `src/ui/chat/MessageList.tsx` | ~993 | 消息列表渲染 + 工具调用卡片 |
| `src/ui/chat/ChatInput.tsx` | ~293 | 输入框组件 |
| `src/ui/chat/ChatTab.v2.tsx` | **~729行** | 组装协调（原来 ~3000 行） |

## 各步骤详细变更

### Step 1: useMessages (最高风险)

- 消息状态管理 (`messages`, `pendingUserMsg`, `pendingAssistantMsg`)
- WebSocket 连接状态 (`wsConnected`)
- 入站消息分发 (`handleIncomingMessage`)
- FSM 状态机 (`TurnFSM`)
- 工具调用状态 (`activeTools`)
- 发送消息逻辑 (`sendMessages`)
- 使用 `scrollBridgeRef` 解决循环依赖

### Step 2: useScrollManager

- ScrollAnchor 组件管理
- 用户滚动检测 (`userScrolledRef`, `isUserScrolling`)
- 自动滚动逻辑 (`scrollToBottom`, `scrollToBottomIfAllowed`)
- 滚动同步

### Step 3: useFileAttachment

- `handleScreenshot`: Electron desktopCapturer 截图
- `handleFileAttach`: 文件选择框
- `handlePaste`: 剪贴板图片粘贴
- 拖拽状态管理 (isDragging)
- `UploadedFile[]` 和 `imagePreview` 状态

### Step 4: MessageList

- `ChatMessageList` 组件
- 分页逻辑 (`pageByMsgId`)
- 消息解析 (CoT 提取、markdown、option box)
- 流式渲染状态
- `ToolCallCard` 工具调用卡片
- `PendingPillsTray` 待处理药片按钮

### Step 5: ChatInput

- `ChatInputArea` 组件
- 文本输入框
- 发送按钮
- 文件/截图按钮
- 快捷命令菜单

### Step 6: useTimers + useContextMenu

**useTimers:**
- 每秒更新 `localTime` / `localDate`
- window focus / blur / visibilitychange 监听

**useContextMenu:**
- 右键菜单状态
- `onContextMenu`: 打开菜单
- `onCopy`: 复制消息
- `onResend`: 重新发送
- `onDelete`: 删除消息

## 验证

- `npx tsc --noEmit` 通过
- 构建正常 (387 modules)
- 合并到 main 分支

## 后续工作

- `MessageList.tsx` (~993行) 超过 500 行警戒线，可进一步拆分
- `useMessages.ts` (~676行) 超过 500 行警戒线，可考虑拆分消息解析逻辑
