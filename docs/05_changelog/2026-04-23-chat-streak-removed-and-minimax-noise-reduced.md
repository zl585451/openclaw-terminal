# 2026-04-23 右侧栏 STREAK 移除与 MiniMax MCP 启动降噪

## 变更

### 1. 移除右侧栏 `STREAK`

- 删除右侧信息栏中的 `🔥 STREAK N` 展示
- 停止聊天发送时更新本地 `oct_streak` 计数
- 保留 `useMessages` 返回结构里的 `streak` 字段为固定 `0`，避免影响现有调用链

涉及文件：

- [src/hooks/useMessages.ts](/E:/windows-window/OpenClaw-Terminal/src/hooks/useMessages.ts:1)
- [src/ui/chat/ChatTabRightPanel.tsx](/E:/windows-window/OpenClaw-Terminal/src/ui/chat/ChatTabRightPanel.tsx:1)
- [src/ui/chat/ChatTab.v2.tsx](/E:/windows-window/OpenClaw-Terminal/src/ui/chat/ChatTab.v2.tsx:1)

### 2. 压低 MiniMax MCP 启动噪音

对 `minimax` 这个可选 MCP 服务做了“启动期失败降噪”，不影响其它 MCP：

- 启动日志从 `info` 降到更低级别
- `stderr` 启动噪音不再反复刷屏
- 对 `spawn EPERM` / 启动超时 / 意外退出这类 MiniMax 启动期常见失败，改为 `info` 级别“已跳过”
- `mcp:manager` 对 `minimax` 启动失败不再记为高噪声 `error`

涉及文件：

- [oct-gateway/mcp/client.js](/E:/windows-window/OpenClaw-Terminal/oct-gateway/mcp/client.js:1)
- [oct-gateway/mcp/manager.js](/E:/windows-window/OpenClaw-Terminal/oct-gateway/mcp/manager.js:1)

## 验证

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
