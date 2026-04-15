# 2026-04-15 · P0-2 首屏欢迎接入聊天空状态

## 变更

- `src/ui/chat/ChatTab.v2.tsx`：`oct.onboarding.dismissed` 持久化；空会话时通过 `emptyConversationPlaceholder` 展示 `WelcomeHero` 或简化 `oct-empty-*`；卡片点击调用 `msgs.sendMessage(prompt, null)`（与 `useMessages.sendMessage` 签名一致），并标记引导已关闭。
- `src/ui/chat/MessageList.tsx`：新增可选 prop `emptyConversationPlaceholder`；空会话时优先渲染该节点，否则保留原「输入消息开始对..」占位。

## 未动区域（按约束）

- `useTypewriter` / `StreamRouter` / `TurnFSM` /消息行与流式渲染逻辑未改。

## 验证

- `npx tsc --noEmit`、`npm test`、`npm run build` 通过。
