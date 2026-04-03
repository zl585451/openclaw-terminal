# 2026-04-03 ChatTab 拆出 useFileAttachment / useTimers / useContextMenu

## 概述

按 ChatTab_v2.tsx 架构分层拆分计划，执行 Step 3 和 Step 6，从主文件抽出约 190 行代码到 3 个独立 hooks。

## 变更文件

| 文件 | 变化 |
|------|------|
| `src/hooks/useFileAttachment.ts` | 新增 (~180 行)，含截图/文件上传/拖拽/粘贴逻辑 |
| `src/hooks/useTimers.ts` | 新增 (~50 行)，含时钟更新 + window focus 监听 |
| `src/hooks/useContextMenu.ts` | 新增 (~45 行)，含右键菜单状态 + 操作 |
| `src/components/ContextMenu.tsx` | 新增 (~60 行)，右键菜单渲染组件 |
| `src/ui/chat/ChatTab.v2.tsx` | -221 行 / +33 行，净减少 ~188 行 |

## 详细变更

### useFileAttachment (Step 3)

- `handleScreenshot`: Electron desktopCapturer 截图，含 Ctrl+Shift+S 快捷键和 IPC 监听
- `handleFileAttach`: 文件选择框 + Electron `open-file-dialog` IPC
- `handlePaste`: 剪贴板图片粘贴
- 拖拽进入/离开/放置状态
- 截图闪屏动画状态
- `UploadedFile[]` 状态 + `imagePreview` 状态

### useTimers (Step 6)

- 每秒更新 `localTime` / `localDate`（带中文 weekday）
- window focus / blur / visibilitychange 监听

### useContextMenu (Step 6)

- 右键菜单状态 (`ContextMenuState`)
- `onContextMenu`: 打开菜单（阻止默认行为）
- `onCopy`: 复制消息到剪贴板
- `onResend`: 关闭菜单（重发逻辑由 parent 通过 `setInjectInputText` 处理）
- `onDelete`: 删除消息后关闭菜单

### ChatTab.v2.tsx 净减少 188 行

- 删除了 4 个 `useState` 声明（imagePreview, uploadedFiles, screenshotFlash, isDragging）
- 删除了 2 个 `useState` 声明（localTime, localDate）
- 删除了 1 个 `useState` 声明（windowFocused）
- 删除了 1 个 `useState` 声明（contextMenu）
- 删除了 `fileToUploadedFile` / `readFileAsBase64` 工具函数
- 删除了 `handleScreenshot` / `handleFileAttach` / `handlePaste` 回调
- 删除了 2 个截图快捷键 effect / 1 个截图 IPC 监听 effect
- 删除了 1 个时钟 tick effect / 1 个 window focus effect
- 删除了 50+ 行内联右键菜单 JSX
- 新增 3 个 hook 调用 + 若干属性访问替换

## 验证

- `npx tsc --noEmit` 通过
- 文件行数：3036 → 2848 行（-188 行）

## 待续

- Step 1: `useMessages` hook（最高风险）
- Step 2: `useScrollManager` hook
- Step 4: `MessageList` 子组件
- Step 5: `ChatInput` 子组件
