# 2026-04-18：网关 Base URL 空白规范化

## 变更

- `oct-gateway/config.js`：`getProviderConfig` 在返回前对 `baseUrl` 做规范化（`trim` + 去掉字符串内所有空白字符），避免用户误在域名与路径之间插入空格（例如 `https://ux.uuai.com /v1/`）导致 Node `fetch` 抛出 `Failed to parse URL`，进而误判为「Claude 不可用」等问题。

## 用户侧建议

- 仍建议在设置中填写干净的 Base URL；规范化仅降低误粘贴带来的失败率。
