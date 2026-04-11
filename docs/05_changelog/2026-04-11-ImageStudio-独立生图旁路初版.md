# ImageStudio 独立生图旁路初版

日期：2026-04-11

## 本次改动

- 在 `oct-gateway` 新增 `image_gen.js`，提供 `image.generate` 独立处理器，支持：
  - MiniMax `image-01`
  - OpenAI / OpenAI 兼容 `/v1/images/generations`
- 在 `oct-gateway/index.js` 增加 `image.generate` 路由分支，明确不进入 `chat.send` 会话链路。
- 在 `electron/main.ts` 新增：
  - `image-generate` IPC
  - `image-result` 前端事件转发
  - 生图配置项读写与 Gateway 自动重启收口
- 在 `electron/preload.ts` 与 `src/vite-env.d.ts` 暴露 `imageGenerate` / `onImageResult`。
- 在设置面板 `ConnectionTabView` 新增“3. 生图配置”区，支持独立配置生图服务商、Key、Base URL、模型和尺寸。
- 新增 `src/ui/image/ImageStudio.tsx`，提供文生图 / 图生图面板、AMY 提示词优化入口、结果预览与最近生成历史。
- 在 `ChatTab.v2.tsx` 集成 Image Studio 抽屉和聊天流图片消息注入。

## 设计取舍

- 没有直接照搬旧方案里“在 `oct-gateway/index.js` 的 `chat.send` 分支前硬插 if”的写法，而是按当前仓库已有的 transport/router 结构在入口层拦截。
- AMY 优化提示词采用轻量版自动注入：
  - 用户从 Image Studio 发起优化请求
  - 等下一条 assistant 最终消息落地后，把整条文本回填到 Image Studio prompt
- 当前图生图只接受参考图 URL，未做本地图片上传转生图输入。

## 验证

- 运行 `npx tsc --noEmit` 通过。

## 后续可选增强

- 为 Image Studio 增加本地参考图上传与拖拽
- 在聊天消息中为图片生成增加专用卡片样式，而不是 Markdown 注入
- 为 AMY 提示词优化增加更严格的输出清洗，避免把解释性文本一并写回 prompt
