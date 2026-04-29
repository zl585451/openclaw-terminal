# 2026-04-29 — ChatTab.v2 第二轮拆分（Round 2）收尾

本轮目标（见 `docs/_archive/refactor-chattab-round2-2026-04/EXECUTION_PLAN.md`）：将 `ChatTab.v2.tsx` 瘦身，不改动聊天主链路（`useMessages` / 流式 / TurnFSM / StreamRouter）。

## 新增文件（汇总）

| 文件 | 职责 |
|------|------|
| `src/ui/chat/chatTypes.ts` | `ToolEventItem`、`UploadedFile`、`ChatMessage`、`ChatTabProps` 单一类型源（Task 1） |
| `src/hooks/useCapabilityActions.ts` | 欢迎卡 / 能力栏 / 生图回写聊天等操作逻辑（Task 2） |
| `src/ui/chat/ChatHeaderPortal.tsx` | `#chat-header-portal` 头部控件 Portal（Task 3） |
| `src/ui/chat/ScrollToBottomButton.tsx` | 三段 chevron「回到底部」按钮（Task 4） |

## Task 4（本轮最后一步）

- 从 `ChatTab.v2.tsx` 抽出滚动追底按钮为 `ScrollToBottomButton`，props：`visible`、`onClick`；样式与动画参数与抽离前一致。

## 分 Task 记录（细 changelog）

- `docs/05_changelog/2026-04-29-chattab-round2-task1-chattypes.md`
- `docs/05_changelog/2026-04-29-chattab-round2-task2-useCapabilityActions.md`
- `docs/05_changelog/2026-04-29-chattab-round2-task3-ChatHeaderPortal.md`

## 验证（收尾时）

- `npx tsc --noEmit` — 通过（0 errors）
- `npm test` — 9 files / 109 tests 通过
