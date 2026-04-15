# 2026-04-15 · P0-1 首屏欢迎组件（独立可渲染）

## 变更

- 新增 `src/ui/onboarding/CapabilityCards.tsx`：四张默认能力卡片、`onCardClick(prompt, capabilityId)`。
- 新增 `src/ui/onboarding/WelcomeHero.tsx`：品牌区、卡片区、「跳过」按钮；卡片点击时 `console.log('[oct] welcome card click', …)` 后转发 `onCardClick`。
- 新增 `src/ui/onboarding/onboarding.css`：`oct-` 前缀样式，含 P0-2 将用到的 `.oct-empty-simple` / `.oct-empty-glyph`。
- **构建修复**：`src/vite-env.d.ts` 中 `musicHistoryLoad` 返回的 `clips` 项与 `electron/main.ts` 的 `music-history-load` 一致（`filename` + `filePath`，移除错误的 `audioBase64`），消除 `SoundTab` 映射历史时的 TS 报错。

## 未做（按 Task 范围）

- 未集成到 `ChatTab.v2.tsx`（P0-2）。

## 验证

- `npx tsc --noEmit`、`npm run build` 通过。
