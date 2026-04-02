# 2026-04-02 MCP Client P0–P2 完整实现

## 变更

### P0 — Gateway 后端基础
- `oct-gateway/tool_loader.js`：新增 `registerProvider()`，动态 provider 在 `getDefinitions()` / `executeTool()` 中优先于静态工具被查询
- `oct-gateway/mcp/client.js`（新建）：`McpClient` 类，JSON-RPC 2.0 over stdio，管理单 MCP Server 连接（`initialize` / `tools/list` / `tools/call`）
- `oct-gateway/mcp/manager.js`（新建）：`McpManager` 单例，注册为 tool_loader Provider，管理多 Server，提供 `getStatus()` / `addServer()` / `removeServer()`
- `oct-gateway/config.js`：新增 `MCP_SERVERS` 配置节；导出 `__fileConfig` / `_configPath` 供 manager 写入
- `oct-gateway/index.js`：启动时调用 `mcpManager.init()`；HTTP Server 新增 `/mcp/status` · `/mcp/server` · `/mcp/server/:name` 路由

### P1 — IPC 桥接
- `electron/main.ts`：新增 3 个 IPC handler — `mcp-get-status` · `mcp-add-server` · `mcp-remove-server`（通过 Gateway HTTP 端口 `GATEWAY_PORT + 1` 透传）
- `electron/preload.ts`：暴露 `mcpGetStatus` · `mcpAddServer` · `mcpRemoveServer` 到 renderer

### P2 — MCP 面板 UI
- `src/ui/settings/types.ts`：`TabId` 新增 `'mcp'`
- `src/ui/settings/tabs/McpTabView.tsx`（新建）：展示 Server 列表（含状态/工具/错误），添加/删除 Server 表单，刷新按钮
- `src/components/SettingsPanel.tsx`：新增 Tab 按钮「⑤ MCP 工具」，渲染 `McpTabView`；新增 MCP state 与加载逻辑

## 工具名称格式

MCP 工具在 Gateway 中注册为 `mcp_<server>_<tool>`（如 `mcp_minimax_web_search`），与模型 tool_calls 兼容，ai.js 无需改动。

## 验证

- `npx tsc --noEmit` ✅
- `npx tsc -p tsconfig.electron.json --noEmit` ✅
- `npm test`（59 tests）✅
- `node --check oct-gateway/*.js` ✅
