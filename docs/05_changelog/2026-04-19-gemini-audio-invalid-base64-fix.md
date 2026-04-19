# fix: Gemini 音频 input_audio 格式修复（Invalid base64）+ 禁止多模态回退到 DeepSeek

## 现象

音频附件发送后，Google Vertex OpenAI 返回：

- `Invalid base64-encoded blob data found in an 'input_audio' 'data' field.`

随后网关自动回退到 DeepSeek，又因 DeepSeek 不支持 `input_audio` 导致二次 400：

- `unknown variant input_audio, expected text`

## 根因

1. `input_audio.data` 被构造成 `data:audio/...;base64,...`，而当前 Vertex OpenAI 路径下该字段应传纯 base64（或可解析 URI），导致 INVALID_ARGUMENT。  
2. 多模态请求（含 `input_audio`）失败后仍进入 DeepSeek fallback，产生不兼容请求体。

## 变更

### `oct-gateway/runtime/contextBuilder.js`

- `input_audio.data` 改为纯 base64：
  - 若输入是 data URL，自动提取逗号后的 base64 体
  - 若输入已是 base64，直接使用
- `input_audio.format` 规范化为：
  - `audio/mp3`
  - `audio/wav`
  - 或原始 mimeType

### `oct-gateway/ai.js`

- 新增多模态检测：当请求消息中存在非 text 的 content part（如 `input_audio` / `image_url`）时，**跳过 DeepSeek fallback**，直接返回原始错误。

## 影响

- Google 音频请求不再因为 data URL 形式触发 Invalid base64。
- 多模态失败时不会再出现“Google 报错后 DeepSeek 再报错”的连环噪音，错误定位更直接。
