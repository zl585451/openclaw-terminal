# fix: 生图 400 — 规范化 IMAGE_BASE_URL（避免 /v1/v1）

> Date: 2026-04-17  
> Type: Bug Fix  
> Scope: `oct-gateway/image_gen.js`（Image Studio 文生图旁路）

## 问题

部分用户会把 `IMAGE_BASE_URL` 配成带版本前缀的形式（例如 `.../v1`），
而网关侧在 adapter 内又会拼接 `/v1/...`，导致最终请求路径重复（`/v1/v1/...`），
从而触发供应商返回 `HTTP 400`（或其他 4xx）。

## 修复

- 为 `minimax` / `openai` adapter 增加 base url 规范化：
  - 去掉末尾多余 `/`
  - 若 base url 以 `/v1` 结尾，则在拼接时自动剥离，确保最终路径只包含一次 `/v1`
- 400/JSON 解析失败时的错误消息补充 `@ <url>`，便于快速定位请求实际打到了哪个地址。

## 影响

- 不改变默认配置的行为（默认 base url 仍为 `https://api.minimax.chat` / `https://api.openai.com`）。
- 对“自定义 base url”更鲁棒，降低因配置差异造成的 4xx 失败概率。

