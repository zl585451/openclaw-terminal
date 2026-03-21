# 第五层：图片与文件处理

---

## 5.1 图片分析

| 项目 | 内容 |
|------|------|
| 做什么 | 用视觉模型分析用户上传的图片 |
| 文件 | `oct-gateway/image_analyzer.js` |
| 调用链 | 前端上传图片 → index.js 检测图片消息 → imageAnalyzer 调用视觉模型 API |
| 配置 | `config.image_analysis.provider`（默认 aliyun_vl）、`vision_model`（默认 qwen-vl-max） |
| 状态 | ✅ 正常 |

---

## 5.2 文件上传优化

| 项目 | 内容 |
|------|------|
| 做什么 | 大文件只传元数据（路径/名称/大小），不自动填充内容到输入框，AMY 用 `read_file` 按需读取 |
| 文件 | `electron/main.ts`（`open-file-dialog` IPC）、`src/components/ChatTab.tsx`（`sendMessage`、`fileToUploadedFile`） |
| 调用链 | 用户选文件 → main.ts 返回 `{ path, name, size, ext, mimeType, base64? }`（仅图片有 base64）→ ChatTab 显示文件名标签 → 发送时 content 含路径引用 → AMY 用 `read_file` 读取 |
| 数据流 | 图片：base64 直接传（vision 需要）；非图片：只传路径，AMY 按需调用 `read_file` |
| 优化点 | ① 大文件不再加载到内存 ② 对话框不显示冗长内容 ③ AMY 自主决定是否读取 |
| 验证 | 上传一个 1MB 的 .txt 文件，对话框只显示 `📎 文件名.txt`，终端日志看到 AMY 收到路径 |
| 状态 | ✅ 正常 |
