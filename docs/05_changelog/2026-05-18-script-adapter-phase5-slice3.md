# 2026-05-18 Script Adapter Phase 5 Slice 3

## What Changed

- 继续拆 `src/modules/script-adapter/ScriptAdapterApp.tsx`
- 新增 `src/modules/script-adapter/ui/TaskCreateWizardSidebar.tsx`
- 新增 `src/modules/script-adapter/ui/TaskCreateWizardFooter.tsx`
- 把创建向导的 sidebar / footer 壳层从容器组件迁出

## Outcome

- `TaskCreateWizard` 不再直接渲染完整的 rail 与 footer 结构
- 创建向导开始形成容器 + hook/policy + view shell 的分层形态
- Phase 5 的 UI 层拆分补上了此前只有逻辑抽离、缺少 view 分层的缺口

## Verification

- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`

## Notes

- 本切片之后，`Phase 5` 已达到收口条件
