# New API 模型候选列表更新

日期：2026-05-01

## 背景

云端 New API 已配置阿里百炼与火山方舟渠道。为了让 OCT 设置面板能直接选择这些渠道中已开放的模型，本次同步更新 `newapi` provider 的候选模型列表。

## 变更

- 更新前端设置面板 `newapi` 候选模型，加入百炼文本模型与火山豆包模型。
- 更新 `recommendedModels` 中的 `newapi` 推荐序列。
- 同步 gateway 与 Electron 侧 provider 元数据，避免不同入口展示不一致。

## 当前候选

- 百炼：`qwen-plus`、`qwen-turbo`、`qwen-max`、`qwen3.5-plus`、`qwen3.6-flash-2026-04-16`、`qwen3.6-plus-2026-04-02`、`qwen3-coder-plus-2025-09-23`、`deepseek-v4-flash`、`deepseek-v4-pro`
- 火山：`doubao-seed-2-0-lite-260215`、`doubao-seed-2-0-pro-260215`、`doubao-1-5-lite-32k-250115`、`doubao-1-5-pro-32k-250115`

## 使用说明

OCT 使用 New API 时，`Base URL` 指向云端 New API `/v1` 地址，`API Key` 使用 New API 令牌。模型 ID 必须是 New API 渠道中已配置并测试通过的模型名；如果后台新增了其它模型，也可以继续使用“自定义模型 ID”手动填写。
