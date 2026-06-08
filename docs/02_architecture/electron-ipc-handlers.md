# Electron IPC Handler 模块边界

日期：2026-05-26

## 背景

`electron/main.ts` 原先同时承担窗口生命周期、Gateway 管理、AI 配置、日志、媒体、书库、交付、图像、任务和内容创作 IPC 处理，导致主进程入口持续膨胀。当前重构将 IPC 注册移动到 `electron/ipc/`，由 `registerAllIpcHandlers()` 统一注册。

## 注册入口

- `electron/ipc/index.ts` 是唯一聚合入口。
- `electron/main.ts` 在 `app.whenReady()` 内构造 `IpcDeps` 并调用 `registerAllIpcHandlers(ipcDeps)`。
- 动态主进程状态通过 getter/setter 传递，避免注册时快照失效：
  - `mainWindow`
  - `openclawWs`
  - `floatWindow`
  - `codeWindow`
  - `terminalWindow`
  - `terminalPty`
  - `pendingCodeWindowData`

## 模块职责

- `window.ts`：主窗口、悬浮窗、截图快捷键相关 IPC。
- `code-window.ts`：代码窗口打开、ready、关闭 IPC。
- `terminal.ts`：终端窗口和 `node-pty` 输入输出 IPC。
- `chat.ts`：聊天历史、OpenClaw 连接/发送/状态、系统通知 IPC。
- `ai-library.ts`：AI.library 插件配置读取和保存 IPC。
- `gateway.ts`：Gateway 启停、重启、端口清理、状态和工具调用 IPC。
- `ai-config.ts`：API key、persona、provider、连接测试 IPC。
- `memory.ts`：记忆摘要和向量召回配置 IPC。
- `mcp.ts`：MCP server 管理 IPC。
- `media.ts`：TTS、音乐、歌词 IPC。
- `file-dialog.ts`：文件/图片选择和脚本草稿解析 IPC。
- `logs.ts`：日志读取和 watch IPC。
- `library.ts`：项目书库 IPC。
- `delivery.ts`：Markdown / Docx 交付导出 IPC。
- `image.ts`：图像生成、外链打开和下载 IPC。
- `tasks.ts`：任务面板 IPC。
- `script-adapter/index.ts`：内容创作脚本适配器运行和批处理 IPC。

## 等价验证

已对比 `HEAD:electron/main.ts` 与当前 `electron/main.ts + electron/ipc/**/*` 的 `ipcMain.handle/on` 注册清单：

- 原始注册：101 个
- 当前注册：101 个
- 缺失：0
- 重复：0

## 风险说明

当前仍保留少量 `globalThis` 兼容桥，主要服务于 Gateway 管理和旧主进程函数共享。IPC 模块不应直接写 `openclawWs` 这类闭包状态；需要变更时应通过 `IpcDeps` getter/setter。后续如果继续收敛，应优先把 Gateway 进程状态、重连状态和配置重启流程抽成显式 controller，再删除兼容桥。
