# DEAD_CODE_REPORT.md — 当前状态

生成日期：2026-05-26

说明：基于当前代码库真实扫描结果，只列出仍存在的真实死代码或冗余。

## 已清理

- `src/styles/themes.ts` — 文件已不存在
- `src/utils/optionBoxParser.fix.ts` — 文件已不存在
- `src/utils/pattern-utils/templateImportCleaner.ts` — 文件已不存在
- `docs/for_claude/` — 目录已不存在
- `src/styles/dialog.css` — 已删除（零导入）

## 误报（保留，非死代码）

- `src/styles/context-menu.css` — 仍被引用，不是死代码

## 待确认（需人工判断）

- `src/themes/ThemeProvider.tsx` 中的 `legacy-*` 兼容样式 — 被 `memory.module.css` 引用，不可直接删
