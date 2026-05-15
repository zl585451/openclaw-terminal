# 2026-05-11 内容创作工作台：切视图续跑与批次重跑体验修复

## 背景

内容创作工作台存在两类误导性行为：

1. 用户从 `工作台` 切到 `团队流程` / `Agent 池` 再切回时，`WorkbenchView` 卸载清理会误触发 `abortPipeline()`，导致后台任务被当成页面生命周期的一部分。
2. 批次里某一章失败后，重跑会不断追加新的 attempt 行；前端把这些 attempt 全部并列展示，用户会看到同一章重复失败多次，误以为系统卡死或越重跑越坏。

## 本次调整

### 1. 切视图不再中断后台任务

- `WorkbenchView` 卸载时只退订事件，不再无条件 `abortPipeline()`。
- 单次执行页的 `取消执行` 改为优先调用 Gateway cancel；仅在 Gateway 不可用时才回退到前端 mock abort。

### 2. 工作台恢复当前批次

- `scriptAdapterStore` 新增项目级 `activeBatchIds`。
- `useWorkbenchBatchState` 支持读取并回写当前批次 ID。
- 用户切回工作台时，优先恢复当前项目上次选中的批次；若该批次已不存在，再回退到最新 running / paused 批次。

### 3. 批次失败语义改为“待重跑”

- 批次执行完毕后，如果仍有失败章节，不再把整批标成终态 `failed`，改为 `paused`。
- 新增 `batch_paused` 事件，用于表达“当前批次停在失败章，等待修复后重跑”。

### 4. 章节列表默认只看最新 attempt

- 批次状态接口改为返回每章最新一次 attempt。
- 批次完成/失败计数也改为严格基于最新 attempt 统计，避免旧失败 attempt 污染当前状态。
- 工作台失败卡文案改成“等待重跑”，减少“整批已废”的误导。

## 涉及文件

- `src/modules/script-adapter/store/scriptAdapterStore.ts`
- `src/modules/script-adapter/store/actions.ts`
- `src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`
- `src/modules/script-adapter/ui/Workbench/ExecutionView.tsx`
- `src/modules/script-adapter/ui/Workbench/ExecutionWorkbenchPanel.tsx`
- `src/modules/script-adapter/ui/Workbench/useWorkbenchBatchState.ts`
- `src/modules/script-adapter/ui/Workbench/BatchProgressView.tsx`
- `src/modules/script-adapter/services/gatewayBatch.ts`
- `oct-gateway/script_adapter/batchOrchestrator.js`
- `oct-gateway/script_adapter/persistence.js`
- `docs/00_ai_entry/content-creation-entry.md`
- `docs/03_specs/内容创作工作台/内容制作工作台UI结构规范.md`

## 验证

- `node --check oct-gateway/script_adapter/batchOrchestrator.js`
- `node --check oct-gateway/script_adapter/persistence.js`
- `npx tsc --noEmit`
