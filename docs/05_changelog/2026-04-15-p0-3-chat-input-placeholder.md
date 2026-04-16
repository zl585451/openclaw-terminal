# 2026-04-15 · P0-3 输入框占位符中文化

## 目标

Phase P0 Task P0-3：将聊天输入框默认英文占位符改为对新用户友好的中文，并在空会话与已有消息两种状态下切换文案。

## 改动

- **`src/ui/chat/ChatInput.tsx`**
  - `ChatInputAreaProps` 新增可选 `isEmptyConversation?: boolean`。
  - 使用 `useMemo` 计算占位符：
    - 空会话：`今天想让OCT帮你做什么？`（2026-04-16 起缩短，避免折行重叠；此前为带能力列举的长文案）
    - 非空：`继续聊,或按 / 唤出命令`
  - 保留 `hasPendingPills` 时的 `或者自己输入...` 优先级。
- **`src/ui/chat/ChatTab.v2.tsx`**
  - 向 `ChatInputArea` 传入 `isEmptyConversation={messages.length === 0}`（若本地工作区已改但未随本 commit 提交，请与首屏/P0-2 等改动同批提交，否则占位符会退回默认「继续聊…」）。

## 验收

- 空会话时输入框显示中文引导占位符。
- 发过至少一条用户/助手消息后，占位符切换为「继续聊…」。
- `/` 快捷命令、录音、附件等输入区行为无变更。

## 参考

- 重构任务说明：`refactor/02_P0_首屏改造.md` Task P0-3
