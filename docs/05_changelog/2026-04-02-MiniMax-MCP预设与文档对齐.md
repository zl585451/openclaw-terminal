# 2026-04-02 MiniMax MCP 预设与文档对齐

## 变更

- **McpTabView**：MiniMax 预设与[官方 Token Plan MCP 指南](https://platform.minimaxi.com/docs/token-plan/mcp-guide)对齐：参数增加 `-y`；环境变量模板增加 `MINIMAX_MCP_BASE_PATH`（占位路径，需用户改为本机可写目录）；安装提示改为指向 uv 官方仓库。
- **MCP-Client实现方案.md**：新增「附录：在 OCT 中配置 MiniMax MCP」步骤说明。

## 说明

`MINIMAX_MCP_BASE_PATH` 中的 Windows 路径在预设里为示例，用户须在设置面板中替换为自己的目录（须事先创建）。
