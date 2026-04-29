# 2026-04-29 业务分析启动改为异步状态机

## 背景

`scriptAdapter.analysis.start` 原先在 WebSocket request/response 内同步等待完整模型分析。Electron 脚本适配请求超时为 10 秒，而业务分析模型调用可能需要 45 秒，导致前端显示 `Gateway 请求超时`。

## 改动

- `startAnalysis` 改为立即返回初始 `analysisRun`。
- 业务分析继续在 Gateway 后台执行，并通过 `analysis.step.*`、`analysis.succeeded`、`analysis.failed` 事件更新前端。
- 前端 `startGatewayAnalysis` 不再要求启动响应里包含最终 `AnalysisReport`。
- 前端在 `analysis.succeeded` 事件中接收最终报告并进入完成态。

## 验证

- `node --check oct-gateway/script_adapter/businessAnalysisOrchestrator.js`
- `node --check oct-gateway/index.js`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
