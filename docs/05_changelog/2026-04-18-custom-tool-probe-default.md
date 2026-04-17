# 2026-04-18 · Custom OpenAI 模型工具能力改为“默认自动探测”

## 背景
- 在 `custom` 服务商下，`CUSTOM_MODEL_SUPPORTS_TOOLS` 未配置时，历史逻辑会默认按 `false` 处理。
- 这会把自定义模型直接标记为“工具关闭”，导致网关不下发 tools，也不会进入运行时探测。
- 对于 OpenAI 兼容聚合平台（同一 baseUrl 下不同模型工具能力不一致）会出现“以前能调工具、后来不行”的表象。

## 本次调整
- 新增 `readOptionalBoolConfig()`：支持三态读取（`true` / `false` / `null`）。
- `CUSTOM_MODEL_SUPPORTS_TOOLS` 改为三态策略：
  - `true`：强制开启工具（`tools=true`，`toolReliability=loose`）
  - `false`：强制关闭工具（`tools=false`，`toolReliability=none`）
  - 未配置 / `auto` / `default`：不预设 tools，交给运行时探测（`toolsSupport=unknown` -> probe）
- 更新 custom 模型标签文案，显示当前模式（开启/关闭/自动探测）。

## 影响
- 自定义 OpenAI 兼容模型默认不再被“误判成不支持工具”。
- 保留手工覆盖开关，便于在已知不稳定模型上强制关闭。
