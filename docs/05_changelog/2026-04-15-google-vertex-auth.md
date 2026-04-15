# fix: Google provider 统一切换到 Vertex AI 端点，修复双凭证 400

> Date: 2026-04-15  
> Type: Bug Fix  
> 影响范围: 使用 Google AQ Key（Vertex AI Express）的用户

## 问题

使用 AQ.xxxx 格式的 Vertex AI Express Key 时，每次请求返回 HTTP 400：
```
"Multiple authentication credentials received. Please pass only one."
```

## 根因

`google` provider 原来默认指向 `generativelanguage.googleapis.com`（AI Studio 端点）：
- 该端点认证用 `Authorization: Bearer`
- AQ key 是 Vertex AI Express 的，需要 `aiplatform.googleapis.com` + `x-goog-api-key` 头
- `sanitizeGoogleOpenAiBaseUrl` 只清理 `generativelanguage.googleapis.com` 的 `?key=`，
  若 URL 里还带了 key 参数（`?key=AQ.xxx`），则 Vertex AI 端点不会被清理，导致双凭证

## 修复

### oct-gateway/providers.js
- `google` provider `baseUrl` 改为 Vertex AI Express 端点（`aiplatform.googleapis.com`）
- 说明占位符格式：`https://aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/endpoints/openapi`
- 更新描述和 keyPlaceholder，明确 AQ key 用途

### oct-gateway/config.js — sanitizeGoogleOpenAiBaseUrl
- 扩展判断范围：同时清理 `aiplatform.googleapis.com` URL 里的 `?key=` 参数
- 防止用户粘贴带 key 的 URL 时出现双凭证冲突

## 认证链路

| 端点 | Key 格式 | 认证方式 |
|---|---|---|
| `aiplatform.googleapis.com` | AQ.xxx | `x-goog-api-key` 头（ai.js 已有逻辑） |
| `generativelanguage.googleapis.com` | AIzaSy... | `Authorization: Bearer`（已不作为默认） |

## 用户配置说明

在设置面板 → Google 服务商 → Base URL 填入：
```
https://aiplatform.googleapis.com/v1beta1/projects/你的PROJECT_ID/locations/us-central1/endpoints/openapi
```
API Key 填 AQ.xxx 格式的 Vertex AI Express Key。
