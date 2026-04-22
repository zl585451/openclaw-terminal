# Kimi 官方平台对齐

- 将 `moonshot` provider 的控制台链接从旧的 `platform.moonshot.cn` 更新为官方文档与控制台所在的 `https://platform.kimi.com/`。
- 保持官方 API 端点为 `https://api.moonshot.cn/v1`，认证继续使用 `Authorization: Bearer $MOONSHOT_API_KEY`。
- 将 `moonshot` provider 默认模型从旧的 `moonshot-v1-8k` 切换为官方当前主推模型 `kimi-k2.6`，并补齐 `kimi-k2.5`、`kimi-k2-turbo-preview`、`kimi-k2-thinking`、`kimi-k2-thinking-turbo`。
- 保留 `moonshot-v1-*` 作为兼容模型，避免老配置或旧项目直接失效。
- 同步更新设置页推荐模型、Electron fallback provider，以及 Kimi 上下文窗口展示值，避免 UI 仍显示旧 128k。
- 修复配置链错配：`moonshot` 不再回退复用 `DASHSCOPE_API_KEY`，设置页 / Electron / Gateway 改为单独读写 `MOONSHOT_API_KEY` 与 `MOONSHOT_BASE_URL`，并在误填 `sk-sp-` 时直接给出人话错误。
- 修复请求体兼容问题：`moonshot` 直连 Kimi 官方接口时不再注入通用默认 `temperature=0.7`，避免 `kimi-k2.5 / kimi-k2.6` 返回 `invalid temperature` 的 400。

官方依据：
- Kimi API 快速开始：`https://platform.kimi.com/docs/api/quickstart`
- Kimi 模型列表：`https://platform.kimi.com/docs/models`
