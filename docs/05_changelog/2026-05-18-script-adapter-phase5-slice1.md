# 2026-05-18 Script Adapter Phase 5 Slice 1

## What Changed

- Phase 5 开始拆 `src/modules/script-adapter/ScriptAdapterApp.tsx`
- 新增 `src/modules/script-adapter/wizardFooterPolicy.ts`
- 新增 `src/modules/script-adapter/hooks/useTaskCreateWizardGatewayEvents.ts`
- 迁出的职责包括：
- 向导 footer CTA 标题 / 描述 / 按钮文案 / disabled / action 策略
- intake / analysis / production 三类 gateway 事件订阅与状态同步

## Outcome

- `TaskCreateWizard` 少了三段事件订阅 `useEffect`
- footer 区不再依赖四个内联 getter 和一段分支型 action router
- 创建向导的状态编排开始从“单文件堆叠”转向组合 hook + policy

## Verification

- `npx vitest run src/modules/script-adapter/__tests__/wizardFooterPolicy.test.ts`
- `npx vitest run`
- `npx tsc --noEmit`

## Notes

- 当前 `Phase 5` 仍在进行中
- 下一步可继续抽 library loading 或 decision/contract 计算层
