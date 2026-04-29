# 2026-04-29 业务分析状态机接入

## 背景

第二个“确认目标和范围”页面原本点击后调用前端 `runMockInitialAnalysis`，无法证明业务分析 Agent 是否真实执行。

## 改动

- 新增 `scriptAdapter.analysis.start` Gateway 协议。
- 新增 `oct-gateway/script_adapter/businessAnalysisOrchestrator.js`，状态机包含：
  - `validate_order`：system
  - `prepare_context`：rule
  - `business_analysis`：agent
- 前端点击确认目标和范围时会读取真实章节正文，并发送给 Gateway 分析链路。
- 业务分析 Agent 调用真实模型生成 `AnalysisReport`；失败时直接暴露失败状态，不回退到 mock。
- 第二页 UI 精简：右侧只保留系统理解结果、下一步 Agent、折叠状态机证据，不再常驻展示冗长队列卡片。

## 验证

- `node --check oct-gateway/script_adapter/businessAnalysisOrchestrator.js`
- `node --check oct-gateway/index.js`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
