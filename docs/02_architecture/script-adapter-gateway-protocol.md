# Script Adapter Gateway Protocol

更新时间：2026-04-26

本文记录内容制作工作台 Week 2 Track C 的 Gateway 状态机骨架。当前实现仍是 mock agent pipeline，但 transport、registry、cancel/list 入口已经按后续真实 agent runner 的形状拆开。

## 模块边界

- `oct-gateway/script_adapter/mock_execution.js`
  - 对外暴露 `startMockScriptAdapterRun`、`cancelMockScriptAdapterRun`、`listMockScriptAdapterRuns`。
  - 负责创建 execution sheet，并把 runner、emitter、registry 串起来。
- `oct-gateway/script_adapter/runRegistry.js`
  - 记录运行中的 task。
  - 顶层 run status 支持 `running`、`completed`、`failed`、`cancelled`。
  - 对前端 sheet 仍保持现有 `pending/running/completed/failed/awaiting_review` 状态集合，避免扩大 UI 类型面。
- `oct-gateway/script_adapter/agentRunner.js`
  - 顺序执行 mock agents。
  - 接收 `AbortSignal`，取消时抛出 `AbortError`。
- `oct-gateway/script_adapter/eventEmitter.js`
  - 将 runner 事件包装为 Gateway transport event：`{ type: 'event', event: 'script-adapter', payload }`。
- `oct-gateway/script_adapter/mockArtifactFactory.js`
  - 只负责 mock artifact envelope 生成。

## Transport Methods

### `scriptAdapter.run.start`

请求：

```json
{
  "type": "req",
  "id": "script_adapter_...",
  "method": "scriptAdapter.run.start",
  "params": {
    "taskId": "task-id",
    "taskTitle": "多人演播有声书样章",
    "source": "content-workbench",
    "useMock": true
  }
}
```

响应：

```json
{
  "type": "res",
  "ok": true,
  "method": "scriptAdapter.run.start",
  "payload": {
    "type": "script-adapter-run-started",
    "taskId": "task-id",
    "planId": "plan-task-id"
  }
}
```

### `scriptAdapter.run.cancel`

请求参数：`taskId`、可选 `reason`。

成功时 registry 顶层状态变为 `cancelled`，runner 通过 `AbortController` 停止；推送给 UI 的 sheet 使用 `overallStatus: "failed"`，当前 running agent 标记为 `failed` 并带 `error: "cancelled_by_user"`。

### `scriptAdapter.run.list`

返回 registry 中的轻量 run 列表：

```json
{
  "type": "script-adapter-run-list",
  "runs": [
    {
      "taskId": "task-id",
      "planId": "plan-task-id",
      "taskTitle": "多人演播有声书样章",
      "status": "running",
      "createdAt": "2026-04-26T...",
      "updatedAt": "2026-04-26T..."
    }
  ]
}
```

## Electron Bridge

- IPC handlers:
  - `script-adapter-run-start`
  - `script-adapter-run-cancel`
  - `script-adapter-run-list`
- Preload APIs:
  - `window.electronAPI.startScriptAdapterRun(payload)`
  - `window.electronAPI.cancelScriptAdapterRun({ taskId, reason })`
  - `window.electronAPI.listScriptAdapterRuns()`
  - `window.electronAPI.onScriptAdapterEvent(callback)`

Electron main process now tracks pending script adapter request ids, so start/cancel/list can receive Gateway `res` payloads instead of being fire-and-forget.

## Frontend Service

`src/modules/script-adapter/services/gatewayExecution.ts` exposes:

- `startGatewayExecution(payload)`
- `cancelGatewayExecution(taskId)`
- `listGatewayExecutions()`
- `subscribeGatewayExecutionEvents(callback)`

The UI does not yet show a cancel button or run history panel; this commit only opens the stable bridge for those controls.
