# 2026-04-17 生图卡片严格 Key 闸门与引导文案优化

## 背景
- 欢迎页「生图」卡片在未配置专用生图 Key 时，可能因为聊天 Key 兜底而被判定为可用。
- 用户点击后进入生图面板再报错，体验上会产生“前面能点、后面失败”的困惑。

## 本次改动
- 将生图能力判定改为严格模式：仅当 `IMAGE_API_KEY` 存在时，`image_gen` 才视为 `available`。
- 欢迎页点击生图卡片时，若缺少生图 Key，不打开生图面板，改为在聊天区输出可执行配置指引。
- 指引文案明确用户入口：右上角 `SETTINGS` 与 `SEND` 旁边的生图按钮。

## 影响
- 消除“假可用”状态，避免用户进入报错面板。
- 首次配置路径更清晰，减少因欢迎卡片自动收起带来的迷失感。

## 变更文件
- `src/hooks/useCapabilities.ts`
- `src/ui/chat/ChatTab.v2.tsx`
- `src/ui/onboarding/CapabilityCards.tsx`
- `src/ui/onboarding/WelcomeHero.tsx`
- `src/ui/image/ImageStudio.tsx`
