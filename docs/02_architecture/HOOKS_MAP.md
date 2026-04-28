## Hooks map（useMessages 重构后）

本文件记录 `src/hooks/` 下与聊天消息生命周期相关的 hooks 职责划分、输入输出与依赖关系。

---

## `useMessages`

- **职责**：
  - 作为“编排层”hook：聚合 WebSocket 事件、FSM（`oct.fsm`）与 StreamRouter（`oct.stream`）的生命周期
  - 维护消息列表的写入（`setMessages`）、发送入口（`sendMessage/quickSend`）与回调对外状态（连接状态、streaming 状态、token/ctx、timeline 等）
  - 组织各子 hook 的调用（usage 统计、timeline、stream painting）
- **输入（参数）**：`UseMessagesOptions`
  - `oct`: `{ fsm, stream, ingest }`
  - `messages/setMessages`
  - `permissions`
  - `typewriter`
  - `scroll`（`reconcile/scrollAfterUserSend`）
  - `streamSpeedMs/typingSound/typingSoundVolume`
  - `onStatusChange/onClarifyOpen`（可选回调）
- **输出（return）**：`UseMessagesReturn`
  - 连接状态：`wsConnected/wsReconnecting/wsError/nocturneOnline`
  - 流程状态：`fsmPhase/isStreaming/awaitingResponse/agentPhase/thinkingElapsed`
  - 工具与 timeline：`activeTools/activityTimeline`
  - gateway：`gatewayCapabilities/modelName/thinkMode/pendingPills`
  - token/context：`tokenIn/tokenOut/ctxUsed/ctxMax`
  - refs：`fullTextRef/streamingDomRef`
  - 发送入口：`sendMessage/quickSend`
- **依赖**：
  - `useWebSocket`（事件源）
  - `useTokenUsage`（usage 聚合）
  - `useActivityTimeline`（timeline 与 CoT debounce）
  - `useStreamPainting`（逐字符渲染）
  - `TurnFSM/StreamRouter/BlockIngest`（core）
- **备注（已知技术债/临时实现）**：
  - 当前通过在 `useMessages` 内部给 `oct` 临时挂载 `__streamPainting` 上下文来向 `useStreamPainting` 传递 refs/callback，这是**临时方案**（不影响对外 API，但不够“纯”）。

---

## `useTokenUsage`

- **职责**：
  - 维护 token/ctx/cost 的聚合状态（RAF 合并 flush）
  - 向 `useWebSocket.onUsage` 提供 `onUsage(usage, isSnapshot)` 回调
  - 在发送新消息时提供 `resetUsage()` 做一次性重置
  - 在系统回复解析场景提供 `setFromSystemReply({ tokenIn, ctxUsed, ctxMax })`（封装写入入口）
- **输入**：无（内部 state 管理）
- **输出**：
  - 状态：`tokenIn/tokenOut/ctxUsed/ctxMax/cost`
  - 方法：`onUsage/resetUsage/setFromSystemReply`
  - **仍暴露的内部 setter**：`setTokenOut/setCost`（目前保留；若要完全封装可在下一轮收敛）
- **依赖**：无（仅 React hooks）

---

## `useActivityTimeline`

- **职责**：
  - 管理 `activityTimeline` 状态与 id 生成
  - `onToolEvent`：追加 tool_call/tool_result 条目
  - `onKeepalive`：维护 keepalive hint（同类条目合并更新）
  - `scheduleCotSyncFromFullText`：对 fullText 做 **300ms debounce** 的 CoT/think 同步写入（upsert）
  - `resetTimeline/resetWithThinkingPlaceholder/removeTypes`：由 `useMessages` 在不同阶段驱动
- **输入**：当前实现接收 `_messages`（暂未使用，保留签名以匹配执行包）
- **输出**：
  - `activityTimeline`
  - `onToolEvent/onKeepalive`
  - `resetTimeline/resetWithThinkingPlaceholder/removeTypes/scheduleCotSyncFromFullText`
- **依赖**：`src/types/gateway`（payload 类型）

---

## `useStreamPainting`

- **职责**：
  - RAF 驱动的逐字符“刷字”渲染：从 `fullTextRef` 提取可见正文（`getAssistantVisibleMain`），写入 `streamingDomRef.textContent`
  - 帧预算/节奏控制（budget accumulation、step cap）
  - 在 finalize 阶段完成后触发 `finalizeStreamingAssistantMessage(...)`
  - 控制 `scrollReconcile` 调用频率（120ms 节流）
- **输入（当前实现）**：
  - `oct`（带 `__streamPainting` 上下文：refs/callback/配置）
  - 其余参数 `_setMessages/_scrollReconcile` 目前为占位，不参与逻辑（保持与执行包签名兼容的临时形态）
- **输出**：`startPainting/stopPainting`
- **依赖**：
  - `getAssistantVisibleMain`（正文提取）
  - `playClickSound`（打字音效）
- **备注（已知技术债/临时实现）**：
  - `oct.__streamPainting` 传参属于临时实现（建议后续改为显式参数或 context 对象参数，不通过篡改入参对象传递）。

---

## `useTtsPlayback`

- **输入 / 输出签名摘要**：
  - `useTtsPlayback(settings: { ttsPlayback: boolean; ttsProvider: TtsProvider })`（`TtsProvider` 见 `SettingsContext`）
  - **仅对外返回**：`speakingMessageId`、`ttsError`、`playTTSForMessage`、`stopTts`（无 ref / 内部 setter 泄漏）
- **职责**：
  - 管理回复朗读：`speakingMessageId`、`ttsError`
  - 浏览器 `speechSynthesis` 与 Electron `tts-speak` + `Audio` 播放路径、auto 回退与错误通知
  - `ttsPlayback` 关闭时取消正在进行的播放
- **输入**：`TtsSettings`（`ttsPlayback`、`ttsProvider`，来自 `useSettings`）
- **输出**：
  - `speakingMessageId`、`ttsError`
  - `playTTSForMessage(msg)`：`{ id, content }` 结构即可（与 `ChatMessage` 兼容）
  - `stopTts`：停止当前朗读并清理 ref
- **依赖**：
  - `stripMarkdown`（`src/utils/stripMarkdown.ts`）
  - `extractAssistantCotAndMain`
  - 与 `ChatTab`/其他模块相同的 `ipcRenderer` 存根模式（非 Electron 环境下 no-op）
- **不暴露**：内部 `setState`、audio/utterance ref 不导出。

---

## `useImageStudio`

- **输入 / 输出签名摘要**：
  - `useImageStudio(messages: ChatMessage[])`（需订阅最新消息以在 assistant 成文后注入优化后的生图 prompt）
  - **对外返回**：`imageStudioOpen`、`imageStudioInitialPrompt`、`openImageStudio(prefill?)`、`closeImageStudio`、`toggleImageStudio`、`registerPromptInjector`、`markPendingPromptOptimization`
- **为何需要 `messages` 入参**：用户在工作台触发「让 AMY 优化提示词」等流程时，会先 `quickSend` 请求模型；必须在**本轮最后一条 assistant 消息已非流式落定**（`isStreaming === false` 且内容可用）之后，才能把 `extractOptimizedImagePrompt` 的结果通过 `registerPromptInjector` 写回 `ImageStudio`。hook 若不订阅 `messages`，则无法对齐「哪一条回复、何时可注入」，易过早写入或与历史消息混淆。
- **职责**：生图工作台侧栏开关、初始 prompt；Escape 关闭；与 `ImageStudio` 的 `registerPromptInjector` / 聊天 `quickSend` 回流配合的 pending 注入逻辑。
- **依赖**：`extractOptimizedImagePrompt`（`src/utils/extractOptimizedImagePrompt.ts`）
- **不暴露**：内部 injector / pending / last-id ref 不导出。

