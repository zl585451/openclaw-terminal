# 2026-04-17 欢迎页补充音乐入口卡片

## 变更目标
- 在欢迎页增加“音乐”能力卡，解决用户看不到音乐入口的问题。
- 点击欢迎卡后可直接进入顶部 `音频` 标签，形成可发现的入口路径。

## 关键改动
- 新增能力 `music_gen`，并在能力体系中注册为 MiniMax 提供。
- 欢迎卡新增“音乐”卡片（面板型行为）。
- 点击“音乐”卡后：
  - 始终切到 `音频` 标签；
  - 若缺 `MINIMAX_API_KEY`，在聊天区输出配置指引。
- 状态条与能力抽屉补充音乐能力名称与状态展示。

## 相关文件
- `src/core/capabilities/types.ts`
- `src/core/capabilities/providers.ts`
- `src/hooks/useCapabilities.ts`
- `src/ui/onboarding/CapabilityCards.tsx`
- `src/ui/onboarding/CapabilityStatusBar.tsx`
- `src/ui/onboarding/CapabilitySetupDrawer.tsx`
- `src/ui/chat/ChatTab.v2.tsx`
- `src/App.tsx`
