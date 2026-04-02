# 2026-04-02 MCP Gateway 修复与设置面板 MCP Tab 优化

## 摘要

修复 Gateway 因 `config.js` 与 `tool_loader.js` 问题无法启动、MCP HTTP 添加服务器参数解析错误导致 `config` 为 `undefined` 等问题；优化设置面板「⑤ MCP 工具」Tab（预设模板、分类、环境变量校验等）。

## Gateway

- **config.js**：在 `const config = { ... }` 定义之后再挂载 `__fileConfig` / `_configPath`；用独立变量 `_configPath` 解析配置文件路径，避免 TDZ 引用 `config`。
- **tool_loader.js**：移除未实现的 `getExecutors` 导出，避免启动即崩溃。
- **mcp/manager.js**：`addServer` / `removeServer` 同步维护内存中的 `_fileConfig.mcpServers`。
- **index.js**：`POST /mcp/server` 解析 `{ name, command, args, env }` 并组装为 `config` 传给 `mcpManager.addServer`。

## 前端

- **McpTabView.tsx**：预设 MCP 模板（含 MiniMax 等）、分类展示、环境变量基础校验、表单与状态展示优化（不改变全局设置面板样式体系，仍使用既有 `settings-*` 类名）。

## 验证

- `npx tsc --noEmit` 通过。
- 本地验证：`POST /mcp/server` 添加 MiniMax MCP 后可 `GET /mcp/status` 看到 `connected` 及工具列表（如 `web_search`、`understand_image`）。

## Git

- 提交：`fix(mcp): 修复 Gateway 连接问题并改进 MCP 面板 UI`
- 标签：`MCP客户端修复与面板优化`
