# 2026-04-20 · ClarifyCard Phase B (v1.1) — 聊天流集成

## 新增

- `src/hooks/useClarifyCard.ts` - 卡片状态控制 Hook（`maybeTrigger` / `handleSubmit` / `handleSkip` / `reset`）
- DEV 测试按钮“测试澄清卡”（位于输入区）

## 修改

- `src/utils/optionBoxParser.ts`
  - `_parseOptionBox` 入口新增代码块保护的 `[clarify_card]` 剥离
  - 孤立标签清理 regex 追加 `clarify_card`
  - `parseTaggedContent` 里的 `TAG_STRIP_RX` 追加 `clarify_card`
- `src/utils/optionBoxParser.test.ts`
  - 新增 `[clarify_card]` 标签剥离测试组（标签剥离、代码块保留、孤立标签清理）
- `src/ui/chat/ChatInput.tsx`
  - `ChatInputAreaProps` 新增 `disabled?: boolean` 和 `disabledPlaceholder?: string`
  - `handleSend` / `handleQuickCommand` / `handlePickFiles` / `toggleRecording` 增加 `disabled` 拦截
  - textarea、发送按钮、附件按钮、快捷命令按钮、麦克风按钮受 `disabled` 控制
  - disabled 时 placeholder 切换为“请先完成上方的澄清 ↑”
- `src/ui/chat/ChatTab.v2.tsx`
  - 接入 `useClarifyCard` Hook
  - 新增消息变化 effect：仅在非流式 assistant 末消息检测 `clarify_card`
  - `ChatInputArea` 传入 `disabled={clarifyCard.hasActive}`
  - JSX 末尾挂载 `<ClarifyCardOverlay />`
  - 清空对话或消息置空时调用 `clarifyCard.reset()`

## 未做（留给 Phase C）

- AMY 系统提示词尚未更新，当前不会稳定主动输出 `clarify_card`
- DEV 测试按钮待产品化前移除
