# 第五层：图片与文件处理

> Status: CURRENT  
> Last Updated: 2026-04-08  
> AI note: 详细排错顺序请先看 `docs/00_ai_entry/image-flow-entry.md`

---

## 5.1 图片分析

| 项目 | 内容 |
|------|------|
| 做什么 | 处理图片附件，并根据当前模型能力决定走视觉直传或图片描述降级 |
| 文件 | `electron/main.ts`、`oct-gateway/index.js`、`oct-gateway/image_analyzer.js` |
| 调用链 | 前端上传图片 → Electron 转成 `attachments` → Gateway 检测 `imageAttachments` → 视觉模型走 `inline_vision`，非视觉模型先 `imageAnalyzer` 再转文本 |
| 配置 | `config.image_analysis.provider`（默认 aliyun_vl）、`vision_model`（默认 qwen-vl-max） |
| 关键日志 | `image request routing`、`image attachments normalized to text context`、`ImageAnalyzer` |
| 状态 | ✅ 正常 |

---

## 5.2 文件上传优化

| 项目 | 内容 |
|------|------|
| 做什么 | 大文件只传元数据（路径/名称/大小），不自动填充内容到输入框，AMY 用 `read_file` 按需读取 |
| 文件 | `electron/main.ts`（`open-file-dialog` IPC）、`src/components/ChatTab.tsx`（`sendMessage`、`fileToUploadedFile`） |
| 调用链 | 用户选文件 → main.ts 返回 `{ path, name, size, ext, mimeType, base64? }`（图片含 base64）→ ChatTab 显示文件名标签 → 发送时图片/音频进入 `attachments`（音频在发送阶段按路径转 base64）→ Gateway 对图片走 `image_url`、对音频走 Gemini `input_audio`；其余文件继续保留路径引用 |
| 数据流 | 图片：base64 直接传（vision）；音频：发送时转 base64 直传（Gemini audio understanding）；其他文件：只传路径，AMY 按需调用 `read_file` |
| 优化点 | ① 大文件不再加载到内存 ② 对话框不显示冗长内容 ③ AMY 自主决定是否读取 |
| 验证 | 上传一个 1MB 的 .txt 文件，对话框只显示 `📎 文件名.txt`，终端日志看到 AMY 收到路径 |
| 状态 | ✅ 正常 |
