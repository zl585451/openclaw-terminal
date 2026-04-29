# 2026-04-28 — Google Vertex 改为原生 SDK 主通道

## 背景

此前 `google` provider 主要走 Google 的 OpenAI 兼容端点。它能工作，但在以下场景里经常需要网关自己补兼容：

- thinking + function calling 多轮续写
- provider 私有状态回传
- Gemini 图像模型与 Imagen 的分流
- 长期维护 `x-goog-api-key`、Base URL、OpenAI 兼容参数之间的细节差异

对于希望正式使用 Google Cloud 赠金额度 / Vertex AI 项目的用户，这条链路不够稳。

## 本次改动

- `oct-gateway/package.json`
  - 新增官方依赖：`@google/genai`
- `oct-gateway/services/googleNative.js`
  - 新增 Google 原生服务层
  - 负责：
    - Vertex 客户端初始化
    - `GOOGLE_AI_BASE_URL` 解析 `project/location`
    - OpenAI 风格消息转 Gemini `contents`
    - OpenAI 工具定义转 Google `functionDeclarations`
    - Gemini 原生函数调用结果归一化
    - Gemini 图像模型 / Imagen 生图统一封装
- `oct-gateway/ai.js`
  - `google` provider 默认走原生 SDK
  - 非图像 Gemini 模型通过原生 `generateContentStream` 处理文本与函数调用
- `oct-gateway/runtime/toolLoop.js`
  - 保留 `google_native_content`
  - 工具结果补写 Google 原生 `functionResponse` 结构，便于续轮
  - 续轮时不再把 OpenAI 风格的 `tool_call id` 透传到 Google `contents`
- `oct-gateway/image_gen.js`
  - 新增 Google 生图分支
  - 支持：
    - Gemini 图像模型：`gemini-2.5-flash-image`、`gemini-3-pro-image-preview`
    - Imagen：`imagen-*`
- `oct-gateway/config.js`
  - Google scoped config 新增：
    - `GOOGLE_API_MODE`
    - `GOOGLE_CLOUD_PROJECT`
    - `GOOGLE_CLOUD_LOCATION`
    - `GOOGLE_GENAI_API_VERSION`

## 默认行为

- 默认：`GOOGLE_API_MODE=native`
- 若需要临时回退旧链路，可显式设置：`GOOGLE_API_MODE=openai_compat`

## 影响

- `google` provider 不再只是“OpenAI 兼容层的一个 Base URL 特例”，而是有自己的原生服务实现。
- 更适合 Google Cloud / Vertex AI 正式使用场景。
- 为后续接入 Google Search、Code Execution、URL Context、Live / 文件能力留出了原生扩展位。
- 修复了 Google 原生函数调用续轮在 Vertex 上触发 `Unknown name "id"` 并导致会话中断的问题。

## 已验证

```powershell
node oct-gateway/test/googleNative.test.js
node oct-gateway/test/toolLoopReasoningContent.test.js
node -e "require('./oct-gateway/services/googleNative'); console.log('googleNative ok')"
node -e "require('./oct-gateway/image_gen'); console.log('image_gen ok')"
node -e "require('./oct-gateway/ai'); console.log('ai ok')"
```
