# 2026-04-29 — ChatTab 第二轮拆分 Task 1

## 变更

- 新增 `src/ui/chat/chatTypes.ts`：`ToolEventItem`、`UploadedFile`、`ChatMessage`、`ChatTabProps` 的单一导出源。
- `ChatTab.v2.tsx` 删除上述类型定义，改为从 `./chatTypes` 引入 `ChatTabProps` / `ChatMessage`。
- 所有原先从 `ChatTab.v2` 引用聊天相关类型的模块改为从 `chatTypes.ts` 引用（含 `App.tsx`、`MessageList`、`useMessages`、`useFileAttachment`、`useImageStudio`、`ChatInput`、`ToolCard`、`types/gateway.ts`）。

## 验证

- `npx tsc --noEmit`：通过。
