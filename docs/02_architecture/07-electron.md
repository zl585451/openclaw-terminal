# 第七层：Electron 桌面应用

---

## 7.1 Nocturne 后端管理

| 项目 | 内容 |
|------|------|
| 做什么 | 启动/监控/重启 Nocturne Python 后端 |
| 文件 | `electron/main.ts` → `startNocturneBackend()` |
| 状态 | ⚠️ 修复过一次（2026-03-16），需持续观察 |

---

## 7.2 本地任务系统

| 项目 | 内容 |
|------|------|
| 做什么 | 本地 JSON 文件存储任务和停车场，支持从 Nocturne 迁移 |
| 文件 | `electron/main.ts` → tasks-read/tasks-write IPC |
| 写到哪 | `userData/tasks.json` |
| 状态 | ✅ 正常 |

---

## 7.3 授权验证

| 项目 | 内容 |
|------|------|
| 做什么 | License 激活码验证 |
| 文件 | `electron/main.ts` → `verifyLicenseCode()` |
| 状态 | ✅ 正常 |

---

## 7.4 会话状态持久化

| 项目 | 内容 |
|------|------|
| 做什么 | 保存/恢复会话状态到本地文件 |
| 文件 | `electron/main.ts` → `saveSessionState()`/`loadSessionState()` |
| 状态 | ✅ 正常 |

---

## 7.5 Gateway 日志面板

| 项目 | 内容 |
|------|------|
| 做什么 | 右侧面板展示 Gateway 日志，支持展开/收回、格式化、缩放、过滤 |
| 文件 | `src/components/LogPanel.tsx`、`src/styles/LogPanel.css` |
| 调用链 | main 进程 `openclaw-log-lines` IPC → ChatTab 接收 → LogPanel 展示 |
| 能力 | ① 展开 overlay 全屏查看 ② 解析 [TAG][TIME][LEVEL] 格式 + JSON 关键字段提取 ③ 模块颜色标签（Memory/Feedback/Gateway 等）④ A+/A- 字体缩放 ⑤ 过滤 pills（全部/错误/记忆/评估/Gateway）⑥ ESC 收回 |
| 验证 | 点击「↗ 展开」全屏查看、日志有色签、点 A+/A- 缩放、按 ESC 收回 |
| 状态 | ✅ 正常 |

---

## 7.6 语音输出（TTS）

| 项目 | 内容 |
|------|------|
| 做什么 | 为桌面版提供回复朗读能力，支持云端/本地双链路回退 |
| 文件 | `electron/main.ts`、`electron/preload.ts`、`src/ui/chat/ChatTab.v2.tsx`、`src/components/SettingsPanel.tsx`、`src/ui/settings/tabs/InterfaceTabView.tsx` |
| 输出侧 | `tts-speak` IPC → 当前 Provider 对应云端 TTS；无能力或失败时可回退到浏览器本地朗读 |
| MiniMax | 使用 `speech-2.8-hd` WebSocket TTS，默认中国区 `api.minimaxi.com` |
| 日志 | `LogPanel` 新增 `TTS` 分类，仅保留用量、成功、失败、警报，不展示逐分片 WS 噪声 |
| 关键规则 | `auto` 朗读跟随当前 `OCT_PROVIDER` 的能力，不因机器里残留别家 Key 而偷偷触发 |
| 状态 | ✅ 可用 |

### 当前行为

- 如果当前 Provider 是 `minimax`
  - `auto` 会尝试 MiniMax 云端朗读
  - 设置页会显示 MiniMax 云端音色选择
- 如果当前 Provider 是 `bailian` / `bailian-coding`
  - `auto` 会尝试 DashScope 云端朗读
- 如果当前 Provider 没有云端 TTS 能力
  - `auto` 直接降级为本地朗读链

### 设计原则

- 语音能力属于产品级 capability routing，不是某家模型的定制分支
- 没有能力时应静默降级，不应增加后台探测和额外系统负担
- 音色设置只在存在对应云端能力时展示
- 语音输入（ASR）链路已移除，不再提供录音转文字入口

---

## 7.7 Image Studio 旁路生图

| 项目 | 内容 |
|------|------|
| 做什么 | 提供独立于聊天上下文的文生图 / 图生图工作台 |
| 文件 | `electron/main.ts`、`electron/preload.ts`、`src/ui/image/ImageStudio.tsx`、`src/ui/chat/ChatTab.v2.tsx` |
| 调用链 | Renderer `image-generate` IPC → Electron WebSocket → Gateway `image.generate` → Electron `image-result` 事件 → ChatTab 注入图片消息 |
| 关键原则 | 不复用 `openclaw-send` / `chat.send`，避免污染聊天上下文与历史 |
| 配置 | 通过设置页新增 `IMAGE_PROVIDER`、`IMAGE_API_KEY`、`IMAGE_BASE_URL`、`IMAGE_MODEL`、`IMAGE_SIZE` |
| 交互 | 工作台主面板只暴露通用语义：画幅、风格倾向、质量、seed、自动优化、水印；并提供下载、打开原图、复制链接 |
| 状态 | ✅ 初版已接入 |
