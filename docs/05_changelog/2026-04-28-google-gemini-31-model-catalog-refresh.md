# 2026-04-28 Google Gemini 3.1 型号清单修正

## 背景

排查 Google Gemini 接入时发现，网关内部仍保留一条过时兼容映射：

- `google/gemini-3.1-pro-preview` 被错误降级成 `google/gemini-2.5-pro`

这会让用户在前端选择 Gemini 3.1 Pro 后，实际请求落到 2.5 Pro，表现成“3.1 Pro 自己退级到 2.5 Pro”。

## 本次修正

- 删除 `gemini-3.1-pro-preview -> gemini-2.5-pro` 的错误映射
- 删除 `gemini-3.1-flash-lite-preview -> gemini-2.5-flash-lite` 的错误映射
- 将已停用的 `gemini-3-pro-preview` 历史别名自动迁移到 `gemini-3.1-pro-preview`
- 更新 Google Provider 的模型列表，新增 `google/gemini-3.1-flash-lite-preview`
- 从前端推荐模型列表移除已停用的 `google/gemini-3-pro-preview`
- 同步前端 `recommendedModels`，把 `google/gemini-3.1-flash-lite-preview` 放入 Google 推荐序列，避免不同设置窗口展示不一致

## 依据

截至 `2026-04-23` 的 Google Cloud / Gemini 官方文档：

- `gemini-3.1-pro-preview` 仍为可用的 Public Preview 型号
- `gemini-3.1-flash-lite-preview` 仍为可用的 Public Preview 型号
- `gemini-3-pro-preview` 已于 `2026-03-09` 停用，官方建议迁移到 `gemini-3.1-pro-preview`

## 备注

这次修正只解决“模型名被本地错误降级”的问题。

Google Vertex 原生 SDK 的多轮 function calling / tool response 续轮兼容问题需要单独修复，不属于这次型号清单同步的范围。
