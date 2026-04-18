# 2026-04-19 — Gateway 代理优先级修正（设置面板覆盖环境变量）

## 背景

当用户在设置面板保存 `HTTPS_PROXY` 后，`oct-gateway/config.js` 之前仅在环境变量为空时才注入代理：

- 若 `.env` 或系统环境里残留旧代理（如 `HTTPS_PROXY=http://127.0.0.1:10808`）
- 即使设置面板已改为新端口（如 `10809`）
- 网关仍会继续使用旧值，导致 `fetch failed`

## 变更

- 文件：`oct-gateway/config.js`
- 调整 `applyProxyFromRuntimeConfig()` 逻辑：
  - 只要用户配置里存在 `HTTPS_PROXY` / `HTTP_PROXY`，就强制覆盖 `process.env`
  - 同步写入大写与小写变量（如 `HTTPS_PROXY` 与 `https_proxy`），避免下游读取差异
  - 当用户配置为空时，保留现有环境变量并统一大小写

## 结果

- 设置面板的代理成为单一可信来源
- 旧 `.env` / 系统变量不再悄悄覆盖用户最新配置
- 更符合“设置里填代理即可生效”的预期体验

