# oct-file-ops MCP 接入

> Date: 2026-04-19  
> Type: feature

## 变更内容

接入一组来自外部的文件操作 MCP 工具（file list/move/rename/delete），并配置为 `oct-gateway` 启动时自动连接。
同时新增“高权限开关”配置：默认白名单模式，可按需切换到全盘访问模式。

## 新增文件

| 文件 | 说明 |
|---|---|
| `oct-gateway/mcp-servers/oct-file-ops/src/index.js` | MCP Server 入口 |
| `oct-gateway/mcp-servers/oct-file-ops/package.json` | MCP Server 依赖与脚本 |
| `oct-gateway/mcp-servers/oct-file-ops/README.md` | 使用说明与安全约束 |

## 修改文件

| 文件 | 变更 |
|---|---|
| `oct-gateway/config.json` | 新增 `mcpServers.file_ops`，通过 `node mcp-servers/oct-file-ops/src/index.js` 启动 |
| `docs/02_architecture/09-tools.md` | 新增 MCP 外部工具 `file_ops` 架构说明 |
| `oct-gateway/mcp-servers/oct-file-ops/src/index.js` | 新增权限开关与扩展白名单环境变量解析（`OCT_FILE_OPS_UNSAFE_ALLOW_ALL`、`OCT_FILE_OPS_ALLOWED_ROOTS`） |
| `oct-gateway/mcp-servers/oct-file-ops/README.md` | 补充权限开关使用说明 |
| `src/ui/settings/tabs/McpTabView.tsx` | 为 `file_ops` 增加“全盘访问（高风险）”可视化开关 |
| `src/components/SettingsPanel.tsx` | 增加 MCP Server 更新回调，切换开关后即时写回并刷新状态 |

## 验证

- 已在 `oct-gateway/mcp-servers/oct-file-ops` 执行 `npm install` 安装依赖。
- 已执行 `node --check src/index.js` 语法校验通过。

## 注意事项

- 该 MCP 工具有白名单目录限制，仅允许操作用户常见目录（Desktop/Documents/Downloads/Pictures/Videos/Music）。
- `file_delete` 默认移动到 `~/.oct-trash`，非永久删除。
- 若设置 `OCT_FILE_OPS_UNSAFE_ALLOW_ALL=1`，将允许操作任意目录，建议仅在必要时临时开启。
