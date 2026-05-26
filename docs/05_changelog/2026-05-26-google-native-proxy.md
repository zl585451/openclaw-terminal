# 2026-05-26 Google Native Proxy 修复

## 变更

- 修复 Google Vertex/native SDK 链路没有继承 `GOOGLE_HTTPS_PROXY` 的问题。
- `oct-gateway/services/googleNative.js` 在创建 `@google/genai` client 前配置 undici 全局代理，使 SDK 内部 `fetch` 也走 Google 专用代理。
- `oct-gateway/ai.js` 将解析后的 `GOOGLE_HTTPS_PROXY` 传入 Google native chat raw config。
- 继续清理 `NODE_USE_ENV_PROXY`，避免与显式 ProxyAgent 叠加后出现重复鉴权问题。

## 验证

- `node oct-gateway/test/googleNative.test.js`
- `npm test`
- `npm run build`

