# ImageStudio MiniMax image_urls 兼容修复

日期：2026-04-11

## 修复内容

- 修复 `oct-gateway/image_gen.js` 对 MiniMax 生图响应结构识别不全的问题。
- 新增兼容：
  - `data.image_urls[0]`
  - `data.images[0].url`
- 保留原先兼容分支：
  - `data[0].url`
  - `image_url`
  - `data.image_url`
  - `output.image_url`

## 现象

- MiniMax 已经成功返回图片 URL，但前端仍提示“MiniMax 未返回图片 URL”。
- 原因是接口返回主路径为 `payload.data.image_urls`，第一版未覆盖。

## 额外调整

- 错误文案在回传前做长度裁剪，避免超长 OSS URL 把 Image Studio 侧栏撑满。
