# Electron IPC 通道清单

> **最后更新时间**：2026-04-21  
> **为谁而写**：AI 协作伙伴  
> **用途**：修改/调试时快速查找前端与主进程的通信通道

---

## 一、通道总览

前端通过 `window.electronAPI.xxx()` 调用，对应 `ipcRenderer.invoke('channel-name', ...)`。主进程在 `electron/main.ts` 中用 `ipcMain.handle('channel-name', handler)` 注册。

---

## 二、窗口与界面

| IPC 通道 | 用途 | 参数 | 返回值 |
|----------|------|------|--------|
| `set-always-on-top` | 置顶 | `value: boolean` | - |
| `get-always-on-top` | 获取置顶状态 | - | `boolean` |
| `minimize-window` | 最小化 | - | - |
| `maximize-window` | 最大化/还原 | - | - |
| `close-window` | 关闭窗口 | - | - |
| `enter-floating-mode` | 进入悬浮模式 | - | - |
| `minimize-for-capture` | 截屏前最小化 | - | - |
| `restore-after-capture` | 截屏后恢复 | - | - |

---

## 三、Gateway 与连接

| IPC 通道 | 用途 | 参数 | 返回值 |
|----------|------|------|--------|
| `start-gateway` | 启动 Gateway | - | - |
| `stop-gateway` | 停止 Gateway | - | - |
| `gateway-restart` | 重启 Gateway | - | - |
| `gateway-clear-port-and-start` | 清端口后启动 | - | - |
| `gateway-status` | 获取 Gateway 状态 | - | `{ running, port?, pid? }` |
| `kill-port-18789` | 强制杀 18789 端口进程 | - | - |
| `get-env` | 获取环境变量 | `key: string` | `string` |

---

## 四、OpenClaw WebSocket（主对话）

| IPC 通道 | 用途 | 参数 | 返回值 |
|----------|------|------|--------|
| `openclaw-connect` | 建立 WebSocket 连接 | - | - |
| `openclaw-send` | 发送消息到 Gateway | `payload: string \| { content, imageDataUrl?, files?, pacingMs?, workbenchContext?, requestId? }` | - |
| `openclaw-status` | 获取连接状态 | - | `{ connected, reconnecting?, error? }` |
| `image-generate` | 发送独立文生图请求到 Gateway | `{ requestId, prompt, negativePrompt?, aspectRatio?, width?, height?, seed?, promptOptimizer?, aigcWatermark?, stylePreset?, quality? }` | `{ success, error? }` |
| `open-external-url` | 用系统浏览器打开 URL | `url: string` | `{ success, error? }` |
| `download-image` | 下载远程图片到本地 | `{ url, suggestedName? }` | `{ success, error?, path? }` |

---

## 五、保险箱与工具

| IPC 通道 | 用途 | 参数 | 返回值 |
|----------|------|------|--------|
| `invoke-gateway-tool` | 调用 Gateway 工具（HTTP 18790） | `toolName: string`, `args: any` | 工具执行结果 |

---

## 六、API Key 与配置

| IPC 通道 | 用途 | 参数 | 返回值 |
|----------|------|------|--------|
| `get-api-keys` | 获取 API Key 配置 | - | 配置对象 |
| `save-api-keys` | 保存 API Key | `keys: Record<string, string \| boolean>` | - |
| `get-provider-list` | 获取 Provider 列表 | - | 服务商列表 |
| `test-ai-connection` | 测试 AI 连接 | `formConfig?: Record<string, string>` | 测试结果 |
| `get-agent-permissions` | 读取 Agent 硬权限配置 | - | `{ success, data: { shellCommands, fileWrite, networkRequests, softwareInstall, systemConfig } }` |
| `save-agent-permissions` | 保存 Agent 硬权限配置 | `{ shellCommands?, fileWrite?, networkRequests?, softwareInstall?, systemConfig? }` | `{ success, data? }` |

生图配置字段说明（`get-api-keys` / `save-api-keys`）：
- 基础字段：`IMAGE_PROVIDER`、`IMAGE_API_KEY`、`IMAGE_BASE_URL`、`IMAGE_MODEL`、`IMAGE_SIZE`
- 强隔离字段：`IMAGE_MINIMAX_*`、`IMAGE_SILICONFLOW_*`、`IMAGE_OPENAI_*`
- 回退开关：`IMAGE_ALLOW_FALLBACK_TO_CHAT_KEY`（布尔，默认 `false`）
- 兼容策略：仍保留 `IMAGE_API_KEY/BASE_URL/MODEL` 作为旧配置兼容与 UI 当前值镜像

---

## 七、Nocturne 记忆

| IPC 通道 | 用途 | 参数 | 返回值 |
|----------|------|------|--------|
| `get-nocturne-status` | Nocturne 状态 | - | `{ backendAlive, ... }` |
| `open-nocturne-management` | 打开管理页 | - | - |
| `restart-nocturne-backend` | 重启 Nocturne | - | - |
| `nocturne-read` | 读记忆 | `{ uri }` | 记忆内容 |
| `nocturne-create` | 创建记忆 | `{ uri, content }` | - |
| `nocturne-update` | 更新记忆 | `{ uri, content }` | - |
| `nocturne-delete` | 删除记忆 | `{ uri }` | - |
| `nocturne-alias` | 别名 | `{ uri, alias }` | - |
| `nocturne-search` | 搜索记忆 | `{ query, domain? }` | 搜索结果 |
| `nocturne-health` | 健康检查 | - | - |
| `nocturne-batch-import` | 批量导入 | `{ items }` | - |
| `nocturne-get-tasks` | 获取任务 | - | 任务列表 |
| `nocturne-update-task` | 更新任务 | `{ taskId, done }` | - |
| `nocturne-add-task` | 添加任务 | `{ content, priority?, source? }` | - |
| `nocturne-clear-completed-tasks` | 清除已完成 | - | - |
| `nocturne-set-intention` | 设置意图 | `{ intention }` | - |
| `seed-nocturne-memories` | 种子记忆 | - | - |
| `setup-nocturne-memory` | 初始化记忆 | - | - |
| `start-nocturne-dashboard` | 启动 Nocturne Dashboard | - | - |
| `stop-nocturne-dashboard` | 停止 Dashboard | - | - |
| `nocturne-dashboard-status` | Dashboard 状态 | - | - |

---

## 八、任务系统（本地 JSON）

| IPC 通道 | 用途 | 参数 | 返回值 |
|----------|------|------|--------|
| `tasks-read` | 读取任务 | - | `{ tasks, parking?, intention? }` |
| `tasks-write` | 写入任务 | `{ tasks, parking?, intention? }` | - |
| `tasks-add` | 添加任务 | `{ content, priority?, source? }` | - |
| `tasks-update` | 更新任务 | `{ taskId, updates }` | - |
| `tasks-delete` | 删除任务 | `{ taskId }` | - |
| `tasks-clear-completed` | 清除已完成 | - | - |
| `tasks-set-intention` | 设置意图 | `{ intention }` | - |
| `tasks-parking-add` | 添加到停车场 | `{ content }` | - |
| `tasks-parking-remove` | 从停车场移除 | `{ itemId }` | - |
| `tasks-migrate-from-nocturne` | 从 Nocturne 迁移 | - | - |

---

## 九、AI.library 插件

| IPC 通道 | 用途 | 参数 | 返回值 |
|----------|------|------|--------|
| `get-ai-library-plugin` | 获取 AI.library 配置 | - | `{ enabled, path?, port?, ... }` |
| `save-ai-library-plugin` | 保存 AI.library 配置 | `{ enabled, path?, port?, autoStart?, installMode? }` | `{ success, error? }` |

---

## 十、脚本 / Persona / MCP / 音乐

| IPC 通道 | 用途 | 参数 | 返回值 |
|----------|------|------|--------|
| `save-script-draft-cache` | 保存剧本草稿缓存 | `{ scriptName, content, updatedAt? }` | `{ success, error? }` |
| `parse-script-file` | 解析剧本文件 | - | `{ success, data?, error? }` |
| `save-persona-settings` | 保存人格配置 | `{ aiName?, userName?, stylePreset? }` | `{ success, error? }` |
| `music-generate` | 生成音乐 | `{ prompt, style?, title?, instrumental?, provider? }` | `{ success, data?, error? }` |
| `lyrics-generate` | 生成歌词 | `{ prompt, style?, theme?, provider? }` | `{ success, data?, error? }` |
| `mcp-get-status` | 获取 MCP 服务状态 | - | `{ success, servers?, error? }` |
| `mcp-add-server` | 添加 MCP 服务 | `name: string`, `cfg: any` | `{ success, error? }` |
| `mcp-remove-server` | 删除 MCP 服务 | `name: string` | `{ success, error? }` |

---

## 十一、本地视觉兼容占位通道

| IPC 通道 | 用途 | 参数 | 返回值 |
|----------|------|------|--------|
| `get-local-vision-status` | 读取本地视觉状态占位 | - | `{ success, status, enabled, downloaded, message }` |
| `save-local-vision-settings` | 保存本地视觉设置占位 | `{ enabled?, mirrorHost? }` | `{ success }` |
| `download-local-vision-model` | 下载本地视觉模型占位 | - | `{ success, status, downloaded, message, error? }` |

说明：
- 这些通道仍由 `electron/main.ts` 注册并由 `preload.ts` 暴露
- 当前返回的是“本地视觉功能已移除，请使用图片理解 API”的兼容占位结果，不代表本地视觉功能仍然可用

---

## 十二、其他

| IPC 通道 | 用途 | 参数 | 返回值 |
|----------|------|------|--------|
| `open-file-dialog` | 打开文件选择 | `options?: { allowMultiple?, filters? }` | 文件路径 |
| `open-image-dialog` | 打开图片选择 | - | 图片路径 |
| `open-code-window` | 打开代码窗口 | `{ language?, code? }` | - |
| `open-terminal-window` | 打开终端窗口 | - | - |
| `read-log-file` | 读日志文件 | `logPath: string` | 内容 |
| `start-log-watch` | 监听日志 | `logPath: string` | - |
| `stop-log-watch` | 停止监听 | - | - |
| `chat-history-load` | 加载对话历史 | - | 历史项 |
| `chat-history-save` | 保存对话历史 | `items: Array<...>` | - |
| `show-notification` | 显示通知 | `{ title, body }` | - |
| `tts-speak` | TTS 朗读 | `{ text }` | - |
| `get-screenshot-shortcut` | 获取截屏快捷键 | - | 快捷键 |
| `set-screenshot-shortcut` | 设置截屏快捷键 | `shortcut: string` | - |
| `test-log-write` | 测试日志写入 | - | - |

---

## 十三、前端 → 主进程 事件

主进程通过 `mainWindow.webContents.send('event-name', payload)` 推送给前端：

| 事件名 | 用途 |
|--------|------|
| `openclaw-message` | Gateway 流式回复、事件 |
| `image-result` | 独立生图结果回推 |
| `openclaw-log-lines` | 连接日志 |
| `nocturne-status` | Nocturne 状态更新 |

---

*新增 IPC 时，需在 `electron/main.ts` 注册 handler，在 `electron/preload.ts` 暴露给渲染进程。*
