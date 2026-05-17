# Hooks 职责地图（`src/hooks/`）

> 目的：业务 Hook 的职责、入参、返回值与依赖关系基准，供改聊天链路或 UI 状态时查阅。  
> Last Updated: 2026-04-29

## useMessages

**职责**：编排单轮对话生命周期（TurnFSM / StreamRouter / BlockIngest）、汇总网关 WebSocket 事件、维护消息列表与发送入口。

**输入参数**（`UseMessagesOptions` 摘要）：

- `oct`: `{ fsm, stream, ingest }` — 核心运行时实例  
- `typewriter`: 打字机 Hook 返回值 — 非流式或收尾展示  
- `scroll`: `reconcile`、`scrollAfterUserSend` — 与滚动管理协同  
- `getNextMessageId` / `messages` / `setMessages` — 消息列表  
- `permissions` — 发送前权限校验  
- `streamSpeedMs` / `typingSound` / `typingSoundVolume` — 流式绘制与音效  
- `onStatusChange` / `onClarifyOpen` — 状态栏与澄清卡回调  

**返回值**（摘要）：连接与 FSM 相位、流式与 `sendMessage` / `quickSend`、token/活动时间线/工具与网关能力、流式 DOM ref 等。

**内部依赖**：`useWebSocket`、`useTokenUsage`、`useActivityTimeline`、`useStreamPainting`；`useProject`。

**被谁使用**：`ChatTab.v2.tsx`。

## useTokenUsage

**职责**：聚合网关 `usage` 事件中的输入/输出 token、上下文占用与费用，支持快照与增量累加；同一帧多事件用 RAF 合并。

**输入参数**：无（独立 Hook）。

**返回值**：`tokenIn`、`tokenOut`、`ctxUsed`、`ctxMax`、`cost`、`onUsage`、`resetUsage`、`setFromSystemReply` 等。

**内部依赖**：无其他业务 Hook。

**被谁使用**：`useMessages`（注入 `onUsage` / 重置）。

## useActivityTimeline

**职责**：维护侧边/面板用的「活动时间线」（思考占位、CoT 片段、工具调用与结果、keepalive  Hint）。

**输入参数**：`messages`（签名对齐；驱动主要来自网关事件）。

**返回值**：`activityTimeline`、`onToolEvent`、`onKeepalive`、`resetTimeline`、`scheduleCotSyncFromFullText` 等。

**内部依赖**：无其他业务 Hook。

**被谁使用**：`useMessages`；`ActivityEntry` 经其再导出至 `MessageList`、`ActivityPanel`。

## useStreamPainting

**职责**：流式回复在 DOM（`pre`）上的逐字/逐段「绘制」：RAF 循环按可视正文长度与速度预算更新 `textContent`，并与滚动 reconcile、打字音效、`finalizeStreamingAssistantMessage` 对齐。

**输入参数**：`oct`（须含 `__streamPainting`，由上层注入）、兼容签名的 `setMessages` 与滚动回调。

**返回值**：`startPainting`、`stopPainting`。

**内部依赖**：无 Hook。

**被谁使用**：仅 `useMessages`。

## useWebSocket

**职责**：`openclaw-send` IPC、解析网关推送并回调 chat/工具/usage/workbench 等；维护连接态与 Memory v2 健康。

**输入参数**：`UseWebSocketOptions`（全套 `onXxx` 回调）。

**返回值**：`wsConnected`、`wsReconnecting`、`wsError`、`memoryOnline`、`send`。

**内部依赖**：无 Hook（纯 Web 下 ipc 为桩）。

**被谁使用**：仅 `useMessages`。

## useTypewriter

**职责**：RAF 打字机展示（CoT/正文、选项框、音效、`onFinished`）。

**输入参数**：`baseDelayMs`、`typingSound`、`onFinished`、`enabled`。

**返回值**：`feed`、`finish`、`reset`、`displayedText`、`isTyping`。

**内部依赖**：无 Hook。

**被谁使用**：`ChatTab.v2.tsx`；`useMessages` 消费其返回值。

## useScrollManager

**职责**：列表滚动、`ScrollAnchor`、`visibleCount`、流式/用户上滑时的追底与历史展开补偿。

**输入参数**：`fsm`、`isStreaming`、`awaitingResponse`、`messagesLength`。

**返回值**：容器与底部 ref、`scrollToBottom`、`scheduleScrollAfterLayout`、`reconcile`、`scrollAfterUserSend`、`handleChatScroll`、`visibleCount` 等。

**内部依赖**：无 Hook。

**被谁使用**：`ChatTab.v2.tsx`；`useMessages` 使用传入的 `scroll` 对象。

## useTtsPlayback

**职责**：按设置对单条助手消息做 TTS（浏览器 `speechSynthesis` 或 IPC `tts-speak` / 云端音频），含 Strip Markdown、时长截断与错误态。

**输入参数**：`settings`：`ttsPlayback`、`ttsProvider`。

**返回值**：`playTTSForMessage`、`stopTts`、`ttsError`、`speakingMessageId` 等。

**内部依赖**：无 Hook。

**被谁使用**：`ChatTab.v2.tsx`（消息列表朗读按钮等）。

## useImageStudio

**职责**：图片工作台侧栏开关、初始 prompt、注册注入器；在助手非流式成文后把「优化后的生图 prompt」回流进工作台。

**输入参数**：`messages`（监听最后一条 assistant）。

**返回值**：`imageStudioOpen`、`imageStudioInitialPrompt`、`openImageStudio`、`closeImageStudio`、`toggleImageStudio`、`registerPromptInjector`、`markPendingPromptOptimization`。

**内部依赖**：无 Hook。

**被谁使用**：`ChatTab.v2.tsx` 与 `ImageStudio` 组件。

## useOnboarding

**职责**：首次引导是否已关闭（`localStorage`）、关闭与开发态重置。

**输入参数**：无。

**返回值**：`onboardingDismissed`、`dismissOnboarding`、`resetOnboardingForDev`。

**内部依赖**：无。

**被谁使用**：`ChatTab.v2.tsx`（欢迎页 / `WelcomeHero` 等）；与 `useCapabilityActions` 组合（仅注入 `dismissOnboarding`）。

## useCapabilityActions

**职责**：首屏欢迎卡与能力栏（CapabilityBar）的点击/跳过/抽屉入口：发消息、注入输入、`openImageStudio`、`quickSend` 优化生图 prompt、`onSwitchTab`、在未配置 Key 时插入生图/音乐引导助手消息。

**输入参数**（`UseCapabilityActionsOptions`）：`setMessages`、`getNextMessageId`、`sendMessage`、`quickSend`、`openImageStudio`、`markPendingPromptOptimization`、`dismissOnboarding`、`onSwitchTab`、`setInjectInputText`、`setCapBarSetupTarget`。

**返回值**：`handleWelcomeAction`、`handleSkipOnboarding`、`handleCapabilityBarClick`、`handleCapabilityBarSetup`、`insertImageToChat`。内部辅助（不导出）：`buildPromptOptimizeRequest`、`appendImageCapabilityGuideMessage`、`appendMusicCapabilityGuideMessage`。

**内部依赖**：无其他业务 Hook（纯回调组合）。

**被谁使用**：`ChatTab.v2.tsx`。

## useInlineInquiry

**职责**：解析消息中的澄清卡（ClarifyCard）、多页表单向导、草稿与提交/跳过/关闭；提交文案通过回调交给上层发送。

**输入参数**：`onReply: (text: string) => void`。

**返回值**：`activeSpec`、`hasActive`、`currentPage`/`currentField`/`currentDraft`、`maybeTrigger`、`openSpec`、`completeAndSubmit`、`dismiss`、`reset` 等。

**内部依赖**：无 Hook（`parseClarifyCard`、`formatClarifyReply` 等 core）。

**被谁使用**：`ChatTab.v2.tsx`；`InlineInquiry` 组件消费类型与 UI。

## useFileAttachment

**职责**：输入区附件列表、拖放/粘贴、截图捕获（Electron + desktopCapturer）、图片预览与文件转 `UploadedFile`。

**输入参数**：无。

**返回值**：`uploadedFiles`、`handleFileAttach`、`handlePaste`、`handleScreenshot`、`removeFile`、`clearFiles`、`isDragging`、`imagePreview` 等。

**内部依赖**：无 Hook。

**被谁使用**：`ChatTab.v2.tsx`；`sendMessage` 可接收 `files` 参数。

## useCapabilities

**职责**：能力栏用到的能力解析（`resolveCapabilities`）、用户在本机存的 Provider Key、生图/音乐是否已配置（读 `electronAPI.getApiKeys`）、`addUserKey`/`removeUserKey` 与自定义事件同步。

**输入参数**：无。

**返回值**：`capabilities`、`getCapability`、`userKeys`、`addUserKey`、`removeUserKey`、`getSecretKey` 等。

**内部依赖**：无 Hook。

**被谁使用**：`CapabilityBar`、`CapabilityCards`、`CapabilityStatusBar`、`CapabilitySetupDrawer` 等。

## useCanvasBridge

**职责**：画布/工作台与聊天往返：把网关 workbench/canvas 事件转成 `workbenchBus` 命令；构造 `getRoundtripContext` 供发送消息时带上文档快照；打开/关闭侧板。

**输入参数**：无（内部 `useWorkbench`）。

**返回值**：`handleCanvasEvent`、`getRoundtripContext`、`openPanel`、`closePanel`、`openCanvas`、`isOpen`。

**内部依赖**：`useWorkbench`（`WorkbenchContext`）、`workbenchBus`。

**被谁使用**：`ChatTab.v2.tsx`。  
**说明**：源码文件为 `useWorkbenchBridge.ts`，`useCanvasBridge` 为其再导出别名。
