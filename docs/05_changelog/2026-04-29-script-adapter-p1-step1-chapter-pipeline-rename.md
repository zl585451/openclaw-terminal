# 2026-04-29 Script Adapter P1 Step 1 Chapter Pipeline Rename

## 变更

1. `oct-gateway/script_adapter/mock_execution.js` 重命名为 `chapterPipeline.js`。
2. 单次执行入口改名为 `startChapterPipelineRun`、`cancelChapterPipelineRun`、`listChapterPipelineRuns`。
3. `agentRunner.js` 中 `runMockAgentPipeline` 改名为 `runChapterAgentPipeline`，并同步更新 Gateway 与批次编排引用。

## 验证

1. `node --check oct-gateway/index.js`
2. `node --check oct-gateway/script_adapter/chapterPipeline.js`
3. `node --check oct-gateway/script_adapter/batchOrchestrator.js`
4. `npx tsc --noEmit`
