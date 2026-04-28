# 2026-04-29 — ChatTab Task1：`useTtsPlayback`

## 变更摘要

- 从 `ChatTab.v2.tsx` 抽出 TTS 播放状态与逻辑至 `src/hooks/useTtsPlayback.ts`。
- 将原组件内联的 `stripMarkdown` 提取为 `src/utils/stripMarkdown.ts`，供 TTS hook 与后续复用（生图 prompt 提取仍不依赖该工具函数）。

## 对外行为

- `speakingMessageId`、`ttsError`、自动流结束后的 `playTTSForMessage`、头部「停止朗读」按钮行为与原先一致。
- `ChatTab` 的 props 与子组件 props 未变。

## 相关文档

- `docs/02_architecture/HOOKS_MAP.md` — 新增 `useTtsPlayback` 条目。
