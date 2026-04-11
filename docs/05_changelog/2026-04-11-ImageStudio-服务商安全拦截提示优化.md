# ImageStudio 服务商安全拦截提示优化

日期：2026-04-11

## 调整内容

- 在 `oct-gateway/image_gen.js` 中识别服务商返回的业务错误，不再一律落成“未返回图片 URL”。

## 当前已兼容

- MiniMax `base_resp.status_code = 1026`
- MiniMax `base_resp.status_msg = input new_sensitive`

## 新行为

- 当提示词被服务商安全策略拦截时，前端会收到更明确的中文错误：
  - `提示词被服务商安全策略拦截，请去掉敏感、暴力、惊悚过强或违规描述后重试。`

## 目的

- 避免把审核拦截误判成协议/字段兼容问题
- 让用户知道该改 prompt，而不是怀疑生图链路坏了
