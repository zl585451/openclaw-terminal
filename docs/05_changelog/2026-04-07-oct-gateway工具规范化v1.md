# 2026-04-07 oct-gateway 工具规范化 v1

## 摘要

- `tool_loader.js`：支持工具可选元数据 `category`、`riskLevel`、`displayName`，缺省使用 `misc` / `safe` / `tool.name`；加载日志格式为 `已加载工具: <name> (<category>/<riskLevel>)`。
- `read_file`、`write_file`、`web_search`、`web_fetch`：补充元数据；返回体增加统一的 `success` / `data` / `error` / `hint`，并保留原顶层字段以兼容旧消费方。
- 新增开发文档：`docs/04_dev_guides/OCT-工具规范化方案-v1.md`。
- **返修（同 v1 轮次、人工验收）**：`web_search` 修复 `enrichResults` 的结果错位（按原始索引增强）；`write_file` 与 `read_file` 对齐项目根目录边界；`web_fetch` 限制为仅允许 `http`/`https` URL。

## 影响范围

- 仅 `oct-gateway` 工具层与文档；前端无改动。
