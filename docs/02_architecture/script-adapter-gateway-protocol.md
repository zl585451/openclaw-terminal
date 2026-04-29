# Script Adapter Gateway Protocol

更新时间：2026-04-29（补充文本改编 JSON 截断重试与真实模式失败约束）

本文记录内容制作工作台 Week 2 Track C 起的 Gateway 状态机骨架。当前为「前两步可选真实 LLM + 后三步 mock」的混合 pipeline；transport、registry、cancel/list 入口已按后续真实 agent runner 的形状拆开。

## 模块边界

- `oct-gateway/script_adapter/mock_execution.js`
  - 对外暴露 `startMockScriptAdapterRun`、`cancelMockScriptAdapterRun`、`listMockScriptAdapterRuns`。
  - 负责创建 execution sheet，并把 runner、emitter、registry 串起来。
- `oct-gateway/script_adapter/runRegistry.js`
  - 记录运行中的 task。
  - 顶层 run status 支持 `running`、`completed`、`failed`、`cancelled`。
  - 对前端 sheet 仍保持现有 `pending/running/completed/failed/awaiting_review` 状态集合，避免扩大 UI 类型面。
- `oct-gateway/script_adapter/agentRunner.js`
  - 顺序执行 mock agents；每步将当前 `sheet.artifacts` 传入工厂，供下游 mock 读取已产出的 `adapted_script`。
  - 接收 `AbortSignal`，取消时抛出 `AbortError`。
- `oct-gateway/script_adapter/eventEmitter.js`
  - 将 runner 事件包装为 Gateway transport event：`{ type: 'event', event: 'script-adapter', payload }`。
- `oct-gateway/script_adapter/mockArtifactFactory.js`
  - 默认生成 mock artifact；在 `SCRIPT_ADAPTER_REAL_AGENTS`（见 `isRealAgentEnabled`）启用时：`adapter.audiobook_text_rewriter@1.0` 在开工传入非空 `sourceText` 时走 `agents/textRewriterAgent.js` 真实 LLM；`classifier.voice_role_marker@1.0` 走 `agents/voiceClassifierAgent.js` 消费上游 `adapted_script.segments`。真实模式下任一真实 Agent 失败都应显式抛错，不再静默回退 mock/占位产物。
  - 若 `artifacts` 内已有 `adapted_script`，后续三个 Agent 的 mock 产物从该 payload 推导 speaker、`segmentId`、段数与 manifest 命名，避免与真实头部穿帮。
  - 真实 Agent 开关读取顺序：`config.scriptAdapter.realAgents`（`config.json` 嵌套 `scriptAdapter` 与 env 已在 `config.js` 合并）→ 顶层 `SCRIPT_ADAPTER_REAL_AGENTS` env/配置键。
- `oct-gateway/script_adapter/agents/textRewriterAgent.js`
  - 文本改编师真实调用（JSON 台本结构）。默认切片约 2200 字，输出预算 6000 tokens；若模型返回带前后缀、围栏或不完整 JSON，会先提取 JSON 对象，解析失败时用紧凑提示自动重试一次。
- `oct-gateway/script_adapter/agents/voiceClassifierAgent.js`
  - 角色音统筹真实调用：本地聚合出场统计 + LLM 输出类别与声线建议。
- `oct-gateway/services/llmClient.js`
  - 与 `summarizer` 共用的非流式 chat completion 客户端；`resolveProviderFor('script_adapter')` 在 `SCRIPT_ADAPTER` 三元组上优先读 `config.scriptAdapter.baseUrl|apiKey|model`，再回退 `SCRIPT_ADAPTER_*`，其次 `SUMMARIZER_*`（含 memory），再降级当前 Gateway provider。

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
    "useMock": true,
    "sourceText": ""
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

### 书库（Week 4 Track 1，不经 Gateway）

- IPC：`library:list`（`{ limit?, offset? }`）、`library:get`（`{ bookId }`）、`library:chapters`（`{ bookId }`）、`library:chapter`（`{ bookId, chapterIndex }`）。main 使用 `fetch` 访问 `resolvedAiLibraryUrlForGateway`（缺省 `http://127.0.0.1:8001`）下的 `/api/library/*`。
- Preload：`window.electronAPI.library.list|get|chapters|chapter`。
- 工作台封装：`src/modules/script-adapter/services/aiLibraryClient.ts`。

## Frontend Service

`src/modules/script-adapter/services/gatewayExecution.ts` exposes:

- `startGatewayExecution(payload)`
- `cancelGatewayExecution(taskId)`
- `listGatewayExecutions()`
- `subscribeGatewayExecutionEvents(callback)`

The UI does not yet show a cancel button or run history panel; this commit only opens the stable bridge for those controls.
