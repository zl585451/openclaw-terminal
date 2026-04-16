# 2026-04-16 Quick Command 重启 Gateway 修复

## 问题

- 快捷命令菜单「重启Gateway」原本发送文本命令 `"/restart"`。
- Gateway 的 Slash 命令未实现 `/restart`，因此会返回「未知命令」并导致功能失效。

## 修复

- [src/components/QuickCommandMenu.tsx](/e:/windows-window/OpenClaw-Terminal/src/components/QuickCommandMenu.tsx)
  - 将「重启Gateway」从发送文本改为本地动作项（`isAction`）。
  - 新增 `onRestartGateway` 回调，并在点击该菜单项时调用。

- [src/ui/chat/ChatInput.tsx](/e:/windows-window/OpenClaw-Terminal/src/ui/chat/ChatInput.tsx)
  - 为输入区组件新增 `onRestartGateway` 属性并传给 `QuickCommandMenu`。

- [src/ui/chat/ChatTab.v2.tsx](/e:/windows-window/OpenClaw-Terminal/src/ui/chat/ChatTab.v2.tsx)
  - 将 `gateway.restartGateway` 透传给 `ChatInputArea`，让快捷菜单可直接触发 Electron IPC 重启链路。

## 结果

- 快捷菜单「重启Gateway」现在会直接调用已有的网关重启逻辑，不再依赖不存在的 Slash 命令。
