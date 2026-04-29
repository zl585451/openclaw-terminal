# 2026-04-29 — ChatTab 第二轮拆分 Task 3

## 变更

- 新增 `src/ui/chat/ChatHeaderPortal.tsx`：`createPortal` 到 `#chat-header-portal` 的头部控件（朗读、Canvas、停止 TTS、TTS 错误、设置、WS 状态、工具能力徽标），行为与原先内联 JSX 一致。
- `ChatTab.v2.tsx` 删除 `react-dom` 的 `createPortal` 引用，改为挂载 `<ChatHeaderPortal ... />` 并传入当前 `settings` / `canvasBridge` / TTS / `msgs` 中的必要字段。

## 类型

- `gatewayCapabilities` 使用 `hooks/useMessages` 中已导出的 `GatewayCapabilities`，未使用 `any`。

## 验证

- `npx tsc --noEmit`：通过。
- `npm test`：通过。
