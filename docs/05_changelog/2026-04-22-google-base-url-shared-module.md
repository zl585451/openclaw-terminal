# 2026-04-22：Google OpenAI 兼容 Base URL 清洗共享模块

## 摘要

新增 `oct-gateway/shared/googleBaseUrl.js`，导出 `sanitizeGoogleOpenAiBaseUrl`；`oct-gateway/config.js` 改为 `require` 该模块；`electron/main.ts` 删除本地 `sanitizeGoogleOpenAiBaseUrlForMain`，改为 `require` 同一实现。网关行为不变；Electron 内「测试连接」对 `aiplatform.googleapis.com` 的 URL 现与网关一致（会去掉 `?key=` / hash），与原先注释「与 config 一致」对齐。

## 涉及文件

- `oct-gateway/shared/googleBaseUrl.js`（新增）
- `oct-gateway/config.js`
- `electron/main.ts`
