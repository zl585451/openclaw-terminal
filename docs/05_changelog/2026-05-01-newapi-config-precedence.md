# 2026-05-01 New API 配置优先级修正

## 背景

Electron 主进程启动较早时，可能在 `process.env` 中保留旧的 `NEWAPI_API_KEY` / `DEEPSEEK_API_KEY`。用户在设置页保存新 New API 令牌后，重启 Gateway 仍会继承父进程旧环境变量，导致 `config.json` 中的新令牌被覆盖，并出现 `Invalid token` 或 fallback 后的旧 DeepSeek `401`。

## 变更

- Gateway provider key 解析改为优先使用设置页写入的用户 `config.json`。
- 环境变量仍作为 fallback，可用于无 UI 的部署场景。
- `NEWAPI_BASE_URL` / provider base URL 统一走 `getEnvOrConfig()`，保持用户配置优先。

## 影响

用户在 OCT 设置页保存 New API 地址和令牌后，无需重新编译；重启 Gateway 即可让最新配置生效。
