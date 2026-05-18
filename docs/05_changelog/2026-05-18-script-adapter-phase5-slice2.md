# 2026-05-18 Script Adapter Phase 5 Slice 2

## What Changed

- 继续拆 `src/modules/script-adapter/ScriptAdapterApp.tsx`
- 新增 `src/modules/script-adapter/hooks/useTaskCreateWizardSource.ts`
- 迁出的 source 相关职责包括：
- 项目素材库加载
- 章节列表加载
- 章节预览加载
- 本地文件选择与上传入库
- 章节范围派生、字数汇总、来源摘要等 source 视图计算

## Outcome

- `TaskCreateWizard` 不再直接承接 3 段 library/source `useEffect`
- source 侧本地状态和派生计算开始集中到单独 hook
- 向导主组件继续向“容器 + 专项 hook/policy”收口

## Verification

- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`

## Notes

- 当前 `Phase 5` 仍在进行中
- 下一步可继续抽 decision/contract 计算层，或把第 1/2/3 步视图继续拆成子组件
