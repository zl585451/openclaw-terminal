# 2026-04-29 Script Adapter P1 Step 3 Actions Placeholders

## 变更

1. `scriptAdapterActions.rejectArtifact` 从纯日志占位改为实际回写 `executionSheets` 中关联 Gate 的 `rejected` 状态。
2. `openArtifact`、`viewArtifactHistory`、`rerunScene`、`pauseStage` 统一改为 Phase 2 明确日志，不再保留 `console.log TODO` 占位。
3. `StageDetail.tsx` 同步更新 `rejectArtifact` 的参数顺序，传入 `projectId`。

## 验证

1. `npx tsc --noEmit`
2. `node --check oct-gateway/index.js`
3. `rg -n "console\\.log.*TODO" src/modules/script-adapter -S`
