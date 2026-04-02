# 2026-04-02 MCP 配置持久化与 Electron 添加格式修复

## 问题

1. **Electron `mcp-add-server`** 向 Gateway 发送 `{ name, config }`，而 `POST /mcp/server` 只解析顶层的 `command/args/env`，导致 `command` 为 `undefined`，连接行为不稳定或与 curl 测试结果不一致。
2. **`mcp/manager.js` `_saveConfig`** 仅用当前已连接的 `_clients` 重写 `mcpServers`，在连接失败或 Gateway 重启尚未连上时，会把磁盘上已保存的 MCP 条目清空，设置面板看起来像「没保存」。
3. **设置面板** 仅在挂载时拉取 MCP 状态，Gateway 重启后若未切换 Tab，列表可能一直为空；切换到 MCP Tab 时应重新拉取。

## 修复

- **electron/main.ts**：`mcp-add-server` 请求体改为 `{ name, command, args, env }`。
- **oct-gateway/index.js**：`POST /mcp/server` 同时兼容扁平字段与 `{ name, config }`。
- **oct-gateway/mcp/manager.js**：`addServer` 仅在连接成功后再写入 `_fileConfig.mcpServers` 并保存；替换同名 Server 时先 `disconnect` 并 `delete`；`_saveConfig` 合并 `_fileConfig.mcpServers` 与已连接 `client.config`，避免误清空。
- **SettingsPanel.tsx**：`activeTab === 'mcp'` 时调用 `loadMcpStatus()`。

## 关于「已连接但 AI 不读图」

MCP 工具在模型侧注册名为 **`mcp_<服务器名>_understand_image`**（例如 `mcp_minimax_understand_image`）。模型需通过 **tool_calls** 主动调用，并传入图片 URL 或可访问的本地路径。聊天里粘贴/上传的图片若未以模型可消费的 URL 或路径形式交给该工具，则不会出现自动识图；可在对话中说明图片路径或 URL，并引导模型调用上述工具。
