# 2026-04-19 — 修复 Google Key 被 google.profile 空值覆盖

## 问题

即使用户在设置面板保存了 `GOOGLE_AI_API_KEY`，网关仍提示“API Key 未配置”。

根因：`oct-gateway/config.js` 会加载 `google.profile.json` 并覆盖主配置；当其中存在
`"GOOGLE_AI_API_KEY": ""` 这类占位空值时，会把 `userData/config.json` 的真实 Key 覆盖为空。

## 修复

- `oct-gateway/config.js`
  - `loadGoogleScopedConfig()` 仅在值“有意义”时才写入覆盖项。
  - 对字符串：`trim()` 后为空则跳过（不覆盖主配置）。
  - 非字符串：仅当非 `null/undefined` 时覆盖。

## 结果

- `google.profile.json` 可继续用于 Google 专项调试参数；
- 但其空占位字段不会再破坏设置面板保存的 Key。
