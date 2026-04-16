# 2026-04-15 — WorkbenchBus：requestSendMessage / subscribeSendRequest（P1-B-1）

## 摘要

为 Workbench 增加与聊天发送链路的桥接通道：面板内可通过 `workbenchBus.requestSendMessage({ text, intent })` 投递请求；`ChatTab.v2` 订阅后调用 `msgs.sendMessage(..., workbenchBus.getContext(intent))`，无可见 UI 变化，供 P1-B-2 文档追加栏使用。

## 改动

- `src/workbench/WorkbenchBus.ts`：新增 `WorkbenchSendRequest`、`sendListeners`、`requestSendMessage`、`subscribeSendRequest`；原有 `dispatch` / `subscribe` / `setContextGetter` / `getContext` 行为保持不变。
- `src/ui/chat/ChatTab.v2.tsx`：import `workbenchBus`；在 `useMessages` 之后用 `useEffect` 订阅 `subscribeSendRequest`（依赖 `[msgs]`）。
