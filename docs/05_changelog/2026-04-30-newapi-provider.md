# 2026-04-30 New API 外部分发网关 Provider

## 背景

OCT 需要支持“用户只填一个平台网关 Token，由外部服务统一分发到阿里百炼、火山、OpenAI、Gemini、DeepSeek 等上游”的商业化路径。New API 已提供独立的渠道管理、令牌、统计、限流和计费能力，因此本次不把 New API 嵌入 OCT，而是把它作为 OpenAI 兼容外部网关接入。

## 改动

- 新增 `newapi` provider：
  - 默认 Base URL：`http://127.0.0.1:3000/v1`
  - 配置键：`NEWAPI_API_KEY`、`NEWAPI_BASE_URL`
  - 默认模型为 `__custom__`，用户填写 New API 后台实际可用的模型 ID。
- 设置页 advanced 模式支持选择“New API 外部分发网关”，保存专用 Key/Base URL，并可测试连接。
- Electron `get-api-keys` / `save-api-keys` / `test-ai-connection` 支持 New API 配置。
- Provider 工具函数可从 `localhost:3000` / `127.0.0.1:3000` / `newapi` 域名推断 `newapi`。

## 边界

- OCT 只负责连接 New API；用户充值、余额扣费、渠道分发、上游 Key 管理由 New API 后台负责。
- 第一版只验证主聊天 `/chat/completions` 闭环。STT/TTS/embedding 后续按 OCT 内部能力路由逐步接入 New API 的 OpenAI 兼容端点。

## 验证

- `npx vitest run src/utils/providerUtils.test.ts`
- `npx tsc --noEmit`
