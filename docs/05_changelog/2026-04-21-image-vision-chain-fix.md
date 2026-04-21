## 图片理解链路修复

- 内部图片分析调用 MCP 看图工具时跳过 Agent 工具权限拦截，避免用户上传图片后的系统链路被未知 MCP 严格策略误拒。
- MCP 子进程现在会保留 server 配置里显式传入的代理环境变量，便于 MiniMax 官方 MCP 访问远端接口。
- 调用 MCP 图片理解工具时按工具 schema 兼容 `image_source`、`image_url`、`image_path`、`file_path`、`url` 等常见参数名。
