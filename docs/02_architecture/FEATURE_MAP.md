# 功能地图（用户可见能力 → 代码位置）

> 目标：看到某个功能时快速知道涉及哪些文件、通常从哪改起。  
> Last Updated: 2026-04-29

---

## 发送消息 / 流式显示

**用户看到的**：在输入区发送后，助手回复在气泡中逐段出现（流式），列表随内容增长滚动。

**涉及文件**：

- `src/ui/chat/ChatInput.tsx` — 发送按钮与输入内容提交  
- `src/hooks/useMessages.ts` — 发起到网关、TurnFSM/StreamRouter/BlockIngest 编排、流式全文与收尾  
- `src/hooks/useWebSocket.ts` — IPC 发送与 chat 增量/结束事件解析  
- `src/core/turnFSM/`、`src/core/streamRouter/`、`src/core/blockIngest.ts` — 状态与缓冲、块桥接  
- `src/hooks/useStreamPainting.ts` — RAF 将可视正文写入流式 DOM  
- `src/hooks/useScrollManager.ts` — 列表滚动与锚点  
- `src/ui/chat/MessageList.tsx` — 消息列表与流式气泡挂载  

**改动入口**：改链路行为优先 `useMessages.ts`；只改输入交互从 `ChatInput.tsx`；只改「字冒出来」的节奏从 `useStreamPainting.ts` 与 `streamRouter`。

---

## TTS 语音朗读

**用户看到的**：开启朗读后，新到助手回复会触发朗读；状态区可停止；消息可处于「正在朗读」高亮（具体入口以当前 UI 为准）。

**涉及文件**：

- `src/hooks/useTtsPlayback.ts` — 浏览器 `speechSynthesis` / IPC `tts-speak`、strip 正文与错误态  
- `src/ui/chat/ChatTab.v2.tsx` — 挂 hook、工具栏朗读开关与停止、向列表传入 `speakingMessageId`  
- `src/contexts/SettingsContext.tsx` — `ttsPlayback` / `ttsProvider` 等设置项  
- `src/ui/chat/MessageList.tsx` — 根据 `speakingMessageId` 打样式类  

**改动入口**：逻辑与音色链路从 `useTtsPlayback.ts`；开关展示从 `ChatTab.v2.tsx` 与 `SettingsPanel`。

---

## 图片生成工作台（ImageStudio）

**用户看到的**：侧栏打开生图工作台，可从能力卡带入 prompt；模型「优化 prompt」成文后自动写入工作台。

**涉及文件**：

- `src/hooks/useImageStudio.ts` — 侧栏开关、初始 prompt、`markPendingPromptOptimization` 与成文后注入  
- `src/ui/image/ImageStudio.tsx` — 工作台 UI 与注册注入器  
- `src/ui/chat/ChatTab.v2.tsx` — 组合 hook、切换按钮、与能力卡回调联动  
- `src/utils/extractOptimizedImagePrompt.ts` — 从助手回复抽取优化后 prompt（若需调整解析规则）  

**改动入口**：流程与状态从 `useImageStudio.ts`；侧栏 UI 从 `ImageStudio.tsx`。

---

## 工具调用（tool call）显示

**用户看到的**：助手调用工具时，活动区域出现调用名、参数摘要、结果或错误。

**涉及文件**：

- `src/hooks/useActivityTimeline.ts` — 将网关工具事件编成 `tool_call` / `tool_result` 条目  
- `src/hooks/useMessages.ts` — 把 WebSocket 工具负载接到时间线、与会话轮次重置  
- `src/components/ActivityPanel.tsx` — 活动面板展示条目  
- `src/ui/chat/MessageList.tsx` — 在最后一条助手消息旁挂载 `ActivityPanel` 与时间线 props  

**改动入口**：事件字段或展示结构从 `useActivityTimeline.ts` + `ActivityPanel.tsx`；是否出现在某轮从 `MessageList.tsx` 分支。

---

## 思考过程（CoT）显示

**用户看到的**：推理内容以可展开块或时间线中的「思考」类条目呈现，与正文分离。

**涉及文件**：

- `src/utils/cotExtract.ts` — 从原始文本拆 CoT 与可见正文  
- `src/hooks/useActivityTimeline.ts` — `cot` / `thinking_placeholder` / keepalive 与时间线同步  
- `src/hooks/useMessages.ts` — 流式全文同步到 `scheduleCotSyncFromFullText`  
- `src/components/CoTBlock.tsx` — CoT 块 UI  
- `src/ui/chat/MessageList.tsx` — `cotContent` / `cotStarted` 等与 CoT 渲染、活动区协同  

**改动入口**：标记格式与提取从 `cotExtract.ts`；时间线侧从 `useActivityTimeline.ts`；气泡内展示从 `MessageList.tsx` + `CoTBlock.tsx`。

---

## 设置面板

**用户看到的**：打开设置窗口，切换连接、模型、TTS、按键等选项并持久化。

**涉及文件**：

- `src/components/SettingsPanel.tsx` — 设置 UI 与标签页  
- `src/contexts/SettingsContext.tsx` — 全局设置状态与读写  
- `src/ui/chat/ChatTab.v2.tsx` / `src/App.tsx` — 在何处挂载 `SettingsPanel`、开关显示  
- `src/ui/settings/` — 设置子模块类型或拆分 UI（若存在）  

**改动入口**：新选项优先 `SettingsContext.tsx` + `SettingsPanel.tsx`。

---

## 能力栏（CapabilityBar）

**用户看到的**：输入区上方能力图标行，点击进入各能力或打开补配置抽屉。

**涉及文件**：

- `src/components/capabilityBar/CapabilityBar.tsx` — 图标行与点击  
- `src/hooks/useCapabilities.ts` — 能力解析、本地 Key、生图/音乐就绪态  
- `src/ui/chat/ChatTab.v2.tsx` — `handleCapabilityBarClick` / `handleCapabilityBarSetup`  
- `src/ui/onboarding/CapabilitySetupDrawer.tsx` — 补全配置抽屉  
- `src/core/capabilities/` — 能力 id、解析与类型  

**改动入口**：交互从 `ChatTab.v2.tsx`；展示与可用性从 `CapabilityBar.tsx` + `useCapabilities.ts`。

---

## 首次引导（Onboarding）

**用户看到的**：首次进入空会话时出现欢迎/能力卡片，可跳过；关闭后记在本地。

**涉及文件**：

- `src/hooks/useOnboarding.ts` — `localStorage` .dismiss 状态与 dev 重置  
- `src/ui/onboarding/WelcomeHero.tsx` — 欢迎区 UI 与卡片动作  
- `src/ui/chat/ChatTab.v2.tsx` — `emptyConversationPlaceholder` 中挂载欢迎区、与 `dismissOnboarding` 等  
- `src/ui/onboarding/CapabilityCards.tsx` — 卡片定义与数据（若改卡片内容）  

**改动入口**：流程与持久化从 `useOnboarding.ts` + `ChatTab.v2.tsx`；视觉与文案从 `WelcomeHero.tsx` / `CapabilityCards.tsx`。
