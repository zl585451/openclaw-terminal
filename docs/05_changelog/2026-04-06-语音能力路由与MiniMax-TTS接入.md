# 2026-04-06 语音能力路由与 MiniMax TTS 接入

## 背景

OCT 需要具备基础语音助手能力，但不能做成“某家模型商的私有定制逻辑”。

本轮目标是：

- 接入可用的云端语音输出链
- 保留本地朗读兜底
- 让语音能力按当前 Provider 的 capability 启用
- 避免因为机器里残留其他 API Key 而误触发错误链路

## 主要改动

### 1. MiniMax 云端 TTS

- Electron 主进程新增 MiniMax WebSocket TTS
- 模型使用 `speech-2.8-hd`
- 中国区默认节点使用 `api.minimaxi.com`
- 正式打通回复朗读与试听链路

### 2. 语音输入

- ChatInput 启用录音按钮
- Renderer 录音后通过 `asr-transcribe` IPC 送往云端 ASR
- 转写结果回填输入框

### 3. 本地语音兜底

- 保留浏览器 `speechSynthesis` 本地朗读
- 云端能力不可用时，`auto` 可静默回退

### 4. Capability Routing

- `auto` 朗读不再是“谁配置了 Key 就优先试谁”
- 新规则：
  - 当前 Provider 是 `minimax` → `auto` 才尝试 MiniMax 云端朗读
  - 当前 Provider 是 `bailian / bailian-coding` → `auto` 才尝试 DashScope 云端朗读
  - 当前 Provider 无云端 TTS 能力 → 直接回退本地朗读

### 5. 设置与日志

- 设置页新增 MiniMax 云端音色选择
- 音色设置只有在检测到可用 MiniMax 能力时才显示
- `LogPanel` 新增 `TTS` 分类
- TTS 日志只保留：
  - 用量（字符数）
  - 成功
  - 失败 / 警报
- 去掉逐分片 WebSocket 噪声

## 设计结论

这套实现不是“为了 MiniMax 写一条特例”，而是为 OCT 建立了可复用的多模态能力路由模式：

- 有能力才展示入口
- 无能力时静默降级
- 不让无关 Key 影响当前主链
- 后续接 image / video / music 时可以沿用同一原则
