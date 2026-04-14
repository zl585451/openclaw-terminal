# 2026-04-14 — Google Gemini 400「Multiple authentication credentials」加固

## 现象
日志出现 `HTTP 400`：`Multiple authentication credentials received`，随后 `primary provider failed, fallback to deepseek`。

## 原因（常见）
1. 已启用 **undici `ProxyAgent`**（`HTTPS_PROXY`）时，进程环境仍带 **`NODE_USE_ENV_PROXY`**，部分 Node 行为与代理叠用，导致发往 `generativelanguage.googleapis.com` 的请求被判定为携带多组鉴权。
2. **`GOOGLE_AI_BASE_URL` 误带查询参数**（如文档里复制的 `?key=...`），与代码中的 **`Authorization: Bearer`** 并存。

## 改动
- `oct-gateway/index.js`：在启用 undici 代理时 `delete process.env.NODE_USE_ENV_PROXY`（及小写别名）。
- `oct-gateway/config.js`：`sanitizeGoogleOpenAiBaseUrl`，对 Generative Language 主机去掉 URL 的 `search` / `hash`。
- `electron/main.ts`：`test-ai-connection` 对 Google 使用同一套 Base URL 净化，避免设置里误带 `?key=` 时测试与网关行为不一致。

## 用户侧自查
- 设置里 **Google Base URL** 应为路径形态，例如 `https://generativelanguage.googleapis.com/v1beta/openai`，**不要**在末尾拼 `?key=...`。
- 若手动在系统环境变量里设过 `NODE_USE_ENV_PROXY=1`，可去掉；网关已用 config / `HTTPS_PROXY` + undici 即可。
