# 2026-05-10 NewAPI Base URL `/v1` 自动补全

## 背景

`New API 外部分发网关` 在设置中如果误填成根地址（例如 `http://host:3000/`），网关会把请求发到：

- `http://host:3000/chat/completions`

部分 NewAPI 部署会在根路径返回 Web 控制台 HTML，HTTP 状态仍然是 `200`。这会让流式解析拿不到任何文本，前端最终显示：

- `本轮未产出可用内容（可能是模型状态异常）`

## 变更

- 在 `oct-gateway/config.js` 中新增 `normalizeProviderBaseUrl(baseUrl, providerId)`。
- 对 `newapi` provider，当用户只填写到站点根路径时，自动补全为 `/v1`。
- 例如：
  - `http://8.138.84.112:3000/` → `http://8.138.84.112:3000/v1`
  - `http://8.138.84.112:3000` → `http://8.138.84.112:3000/v1`
- 已经显式填写了 `/v1` 或其他自定义路径的地址保持不变。

## 效果

- 避免把 NewAPI 的 Web 首页误当作 OpenAI 兼容接口。
- 减少 `response 200 + outputLen 0 + empty assistant reply coerced to fallback text` 这类假成功空回复。

## 说明

- 本次同时修正了当前本机用户配置中的 `NEWAPI_BASE_URL`，将其改为 `http://8.138.84.112:3000/v1`。
