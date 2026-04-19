# feat: chat.send 支持音频附件直传给 Gemini（input_audio）

## 背景

此前聊天附件链路只会把图片放入 `attachments`，音频文件仅以文件名/路径文本进入上下文。  
因此模型会回复“无法访问本地文件/没有工具”，实际原因是网关并未收到可供多模态推理的音频数据。

## 变更

### `electron/main.ts`

- `sendChatMessage()` 的附件组装从“仅 image”扩展为“image + audio”。
- 对 `audio/*` 附件：
  - 优先使用前端传入的 `base64`
  - 若无 `base64` 但有 `path`，在主进程按路径读取并转 base64
  - 作为 `{ type: 'audio', mimeType, content }` 放入 `chat.send.params.attachments`

### `oct-gateway/runtime/contextBuilder.js`

- 新增 `audioAttachments` 处理：
  - `google` provider（或 gemini 模型）下，将音频附件转换为 OpenAI 兼容多模态 part：
    - `type: "input_audio"`
    - `input_audio.data: data:<mime>;base64,...`
    - `input_audio.format: mp3/wav 或 mimeType`
  - 不支持音频直传的 provider 保留文本降级提示

## 影响

- 在 Google Gemini 路由下，聊天中上传音频后可直接执行音频理解（音乐/环境音/人声等）。
- “没有工具、无法访问本地文件”这类误导性回复显著减少，因为模型已拿到真正音频内容。
