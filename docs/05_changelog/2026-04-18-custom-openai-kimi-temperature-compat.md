# 2026-04-18 · Custom OpenAI 兼容端点 Kimi `invalid temperature` 兼容修复

## 背景
- 用户通过 `custom` 服务商接入 OpenAI 兼容端点（如 `https://api-gpt-ge.apifox.cn/`）并调用 `kimi-k2.5`。
- Gateway 日志出现 `HTTP 400 {"error":{"message":"invalid temperature"}}`，导致主 provider 失败并触发 fallback。

## 根因
- `oct-gateway/ai.js` 在主聊天请求中对非 `minimax` provider 固定发送 `temperature: 0.7`。
- 部分 OpenAI 兼容聚合端点 / 特定模型（含 Kimi 路由）不接受该字段或参数校验更严格，返回 400。
- 工具能力探测请求也固定发送 `temperature: 0`，同样有兼容风险。

## 本次改动
- 新增 `resolveTemperatureForRequest({ provider, model })`：
  - `minimax`：沿用 `MINIMAX_TEMPERATURE`。
  - `custom`：优先读取 `CUSTOM_TEMPERATURE`（0~2 合法）；未配置时：
    - `kimi` 家族模型默认不发送 `temperature`；
    - 其他模型保持默认 `0.7`。
- 主聊天请求改为“按策略可选注入 `temperature`”，不再无条件下发。
- 工具能力探测请求（`ai.js` / `gateway/slash.js`）去掉固定 `temperature: 0`，降低兼容端点 400 概率。

## 影响
- `custom + kimi` 在兼容端点上默认更稳，不再因为温度字段直接报 400。
- 若业务确实需要温度控制，可通过 `CUSTOM_TEMPERATURE` 显式配置。
- 其它 provider 行为保持不变（除探测请求不再固定发送 temperature）。
