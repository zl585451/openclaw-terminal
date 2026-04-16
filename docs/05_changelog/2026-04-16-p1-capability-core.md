# 2026-04-16 · P1 能力系统核心

## 摘要

首屏 onboarding 接入能力注册表：根据本地记录的 Key 元数据解析各能力 `available` / `missing_key`，卡片与状态条展示「需先开通」；未开通时打开 Setup Drawer 粘贴 Key 并做 provider 猜测与落盘（`oct.capabilities.*`）。不涉及 `oct-gateway/` 与流式/打字机管线。

## 新增

- `src/core/capabilities/types.ts` — 能力 ID、状态、Provider 定义、用户 Key 记录
- `src/core/capabilities/providers.ts` — 静态 PROVIDERS、优先级、组合能力
- `src/core/capabilities/resolver.ts` — `resolveCapabilities` / `guessProviders` / `maskKey`
- `src/hooks/useCapabilities.ts` — localStorage 读写与 `oct:capabilities-updated` 同步
- `src/ui/onboarding/CapabilitySetupDrawer.tsx` — Key 粘贴与识别
- `src/ui/onboarding/CapabilityStatusBar.tsx` — 已就绪 / 未配置摘要

## 修改

- `src/ui/onboarding/CapabilityCards.tsx` — 三态点击：可用则 `onSend`，缺 Key 则 `onRequestSetup`
- `src/ui/onboarding/WelcomeHero.tsx` — 集成状态条、抽屉与卡片
- `src/ui/onboarding/onboarding.css` — 卡片提示、抽屉、状态条样式
- `src/ui/chat/ChatTab.v2.tsx` — `handleWelcomeSend` + `WelcomeHero onSend`（最小改动）

## 修复（2026-04-16 晚）

- **开通抽屉内无法点击输入 Key**：抽屉原挂在 `MessageList` 滚动容器内，`z-index: 100` 易被聊天区层叠上下文盖住。现改为 `createPortal(..., document.body)`，并将 `.oct-drawer-backdrop` 提升至 `z-index: 13000`，抽屉与 `textarea` 显式 `pointer-events: auto`。

## 已知限制（与 refactor 文档一致）

- 真实 Key 暂存 `localStorage`，P2 可迁 Vault；网关侧未消费前端 `oct.capabilities.secrets`。
