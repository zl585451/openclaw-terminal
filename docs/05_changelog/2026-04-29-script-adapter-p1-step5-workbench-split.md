# 2026-04-29 Script Adapter P1 Step 5 Workbench Split

## 变更

1. `WorkbenchView.tsx` 从 952 行拆分为以状态编排为主的 217 行入口文件。
2. 新增 `BatchSetupPanel.tsx`、`BatchExecutionPanel.tsx`、`StartConfirmDialog.tsx` 承接批次开工确认、运行态和弹窗。
3. 额外抽出 `TaskWorkbenchRail.tsx`、`ExecutionWorkbenchPanel.tsx`、`useWorkbenchBatchState.ts`，把纯展示和批次同步逻辑从主视图剥离。

## 验证

1. `npx tsc --noEmit`
2. `npx vitest run`
3. `node --check oct-gateway/index.js`
4. `rg -n "mock_execution" oct-gateway -S`
5. `rg -n "useMock" src -S`
6. `rg -n "console\\.log.*TODO" src/modules/script-adapter -S`
