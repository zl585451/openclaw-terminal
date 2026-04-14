# 2026-04-14 — Google Gemini：仅用 `x-goog-api-key` 避免 400 重复鉴权

## 背景
部分环境下请求 `generativelanguage.googleapis.com` 的 OpenAI 兼容端点仍返回：

`Multiple authentication credentials provided. Please only use one of: API Key, OAuth 2.0 Access Token, or Firebase App Check Token.`

社区与 [hermes-agent#7893](https://github.com/NousResearch/hermes-agent/issues/7893) 表明：**`x-goog-api-key` 与 `Authorization: Bearer` 同时存在**时会触发该错误；即使用户代码只写其一，运行时或代理链也可能再注入另一路。

## 改动
- `oct-gateway/ai.js`：对 `provider.id === 'google'` 的 `chat/completions` 请求 **仅** 设置 `x-goog-api-key`，**不再**发送 `Authorization: Bearer`。
- `electron/main.ts`：`test-ai-connection` 在 `google` 服务商下与网关一致。

## 仍须注意
- `GOOGLE_AI_BASE_URL` 勿带 `?key=`（`config.js` 仍会净化 generativelanguage 主机上的 query）。
- 启用 `HTTPS_PROXY` 时勿再叠用 `NODE_USE_ENV_PROXY`（见 `oct-gateway/index.js`）。
