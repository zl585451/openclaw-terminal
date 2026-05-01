# 内容创作 Gateway 执行桥接协议

## 文档状态

- 版本：v0.1
- 状态：Week1 Track B MVP 草案
- 生效范围：内容创作工作台、Script Adapter 前端、Electron IPC、oct-gateway WebSocket
- 目标：先跑通前后端执行状态桥接，再替换为真实 Agent

---

## 1. 协议目标

本协议解决一件事：

`用户确认开工 -> 前端发起执行 -> Gateway 创建运行 -> Gateway 推送 Agent 状态 -> 前端 Store 更新工作台`

MVP 阶段不要求真实大模型产文，Gateway 可以先使用 mock runner。关键是前端不再只能依赖组件内或浏览器内 mock，而是具备接入后台异步任务的路径。

---

## 2. Electron IPC

### 2.0 素材摄入状态机

第一个任务创建页不再使用前端 `runMockTaskIntake` 伪造后台步骤。前端调用：

```ts
window.electronAPI.startScriptAdapterIntake({
  sourceMode: 'library' | 'paste' | 'upload',
  bookId?: string,
  sourceTitle: string,
  rangeLabel: string,
  sourceTypeLabel: string,
  chapterIndices: number[],
  chapters?: Array<{ chapter_index: number, title: string | null, text: string }>,
  pastedText?: string,
})
```

Electron 主进程转发为 Gateway WebSocket 请求：

```json
{
  "type": "req",
  "id": "script_adapter_xxx",
  "method": "scriptAdapter.intake.start",
  "params": {}
}
```

Gateway 返回并持续推送同一个 `intakeRun` 状态机：

```ts
type IntakeStepStatus = 'pending' | 'running' | 'succeeded' | 'failed'
type IntakeExecutionMode = 'system' | 'rule' | 'agent' | 'mock'
```

当前第一个页面只使用 `system/rule`，不得把规则执行显示成 Agent。若未来某一步接入真实模型，必须把该 step 的 `mode` 改为 `agent`，并补充 provider/model/run id 等执行证据。

### 2.0.1 业务分析状态机

第二个任务创建页点击“确认目标和范围”后，前端调用：

```ts
window.electronAPI.startScriptAdapterAnalysis({
  workGoal: string,
  rangeLabel: string,
  customNotes?: string,
  chapters: Array<{ chapter_index: number, title: string | null, text: string }>,
})
```

Electron 主进程转发为 Gateway WebSocket 请求：

```json
{
  "type": "req",
  "id": "script_adapter_xxx",
  "method": "scriptAdapter.analysis.start",
  "params": {}
}
```

Gateway 返回并推送 `analysisRun`：

1. `validate_order`：`system`
2. `prepare_context`：`rule`
3. `business_analysis`：`agent`

`business_analysis` 必须调用真实模型生成 `AnalysisReport`。若模型调用失败，状态机必须进入 `failed`，前端显示失败证据，不允许回退到前端 mock 分析结果。

真实业务分析调用约束：

1. 不得把整章大文本直接完整塞入单次分析 prompt；应按头部、中段、尾段抽样生成开工判断样本。
2. 默认 LLM 超时窗口为 `120000ms`，可通过 `SCRIPT_ADAPTER_ANALYSIS_TIMEOUT_MS` 或 `scriptAdapter.analysisTimeoutMs` 调整。
3. 首次分析失败若属于超时或 JSON 截断类错误，可使用更紧凑正文样本重试一次；重试仍必须调用真实 LLM，不允许降级为 mock。
4. 如果业务分析 Agent 因额度不足、限流、超时或 provider 网络错误失败，Gateway 可以追加 `rule_strategy_fallback` 规则步骤生成保守策略，让用户继续进入开工页。
5. 规则兜底不得伪装成 Agent 成功：`business_analysis` 步骤必须保留 `failed` 和错误原因，兜底步骤必须标记为 `mode = rule`。
6. 内容创作 Agent 的默认模型优先级为：`scriptAdapter` 专用配置、当前聊天 provider、Summarizer 兜底。Summarizer 不得优先于当前聊天 provider，避免用户切换模型后业务分析仍走旧摘要模型。
7. `business_analysis.model` 应包含模型来源和 host 证据，例如 `MiniMax-M2.7 · current_provider · api.minimaxi.com`。

真实制作 Agent 调用约束：

1. 文本改编 Agent 是产物生成步骤，不得沿用短请求超时；默认超时为 `120000ms`。
2. 文本改编超时可通过 `SCRIPT_ADAPTER_TEXT_REWRITER_TIMEOUT_MS` 或 `scriptAdapter.textRewriterTimeoutMs` 调整，允许范围为 `30000ms` 到 `300000ms`。
3. 文本改编默认输出预算为 `6000` tokens，可通过 `SCRIPT_ADAPTER_TEXT_REWRITER_MAX_TOKENS` 或 `scriptAdapter.textRewriterMaxTokens` 调整，允许范围为 `2000` 到 `16000`。
4. 文本改编 JSON 解析应容忍模型在 JSON 前后追加解释或 markdown 围栏；若首次输出为空或 JSON 不完整，应使用更低温度和更紧凑提示重试一次。
5. 切片改编中只要存在失败切片，当前章节应显式失败，不得把包含失败占位文本的半成品标记为成功交付。

协议约束：

1. `scriptAdapter.analysis.start` 只负责创建运行并立即返回初始 `analysisRun`。
2. 不允许在 WebSocket request/response 内同步等待模型完整分析，否则会超过 Electron 的短请求超时窗口。
3. 最终 `AnalysisReport` 必须通过 `analysis.succeeded` 事件携带；失败通过 `analysis.failed` 事件携带。

### 2.0.2 制作交接状态机

第三个任务创建页点击“确认方向，进入工作台”后，前端调用：

```ts
window.electronAPI.startScriptAdapterProductionHandoff({
  bookId: string,
  bookTitle: string,
  chapterIndices: number[],
  rangeLabel: string,
  totalChars: number,
  chapterCount: number,
  workGoal: string,
  strategyTitle: string,
  strategyDesc?: string,
  deliveryOptions: DeliveryOptions,
})
```

Electron 主进程转发为 Gateway WebSocket 请求：

```json
{
  "type": "req",
  "id": "script_adapter_xxx",
  "method": "scriptAdapter.production.handoff",
  "params": {}
}
```

Gateway 返回并推送 `productionRun`：

1. `validate_strategy`：`system`
2. `build_execution_contract`：`rule`
3. `resolve_production_queue`：`rule`
4. `handoff_workbench`：`system`

该状态机只生成制作执行合同和队列预览，不启动制作 Agent。真正的制作 Agent 仍由工作台开工页调用 `scriptAdapter.batch.start` 后启动。

### 2.1 启动执行

前端调用：

```ts
window.electronAPI.startScriptAdapterRun({
  taskId: string,
  taskTitle: string,
  source?: 'content-workbench' | string,
  useMock?: boolean,
  /** 可选；非空且 Gateway 启用 SCRIPT_ADAPTER_REAL_AGENTS 时供文本改编师真实 LLM 使用 */
  sourceText?: string,
})
```

Electron 主进程转发为 Gateway WebSocket 请求：

```json
{
  "type": "req",
  "id": "script_adapter_xxx",
  "method": "scriptAdapter.run.start",
  "params": {
    "taskId": "content-task-demo",
    "taskTitle": "长夜未瞑 · 多人演播样章",
    "source": "content-workbench",
    "useMock": true,
    "sourceText": ""
  }
}
```

### 2.2 接收事件

Electron 主进程收到 Gateway 的：

```json
{
  "type": "event",
  "event": "script-adapter",
  "payload": {}
}
```

并转发给前端：

```ts
window.electronAPI.onScriptAdapterEvent((payload) => {})
```

### 2.3 批次执行 IPC

当前内容工作台批次链路补充了以下桥接能力：

1. `script-adapter-batch-subscribe`
   用于前端在切回批次或主进程重连后，主动补订阅某个运行中批次的推送事件。
2. `script-adapter-batch-approve-gate`
   用于人工批准 `quality_review` Gate，批准后该章会继续进入后续打包阶段。
3. `script-adapter-batch-reject-gate`
   用于人工拒绝 Gate，当前章标记为失败，等待用户后续手动重跑。

---

## 3. Gateway 事件

事件统一使用：

```json
{
  "type": "event",
  "event": "script-adapter",
  "payload": {
    "event": "sheet_created",
    "taskId": "content-task-demo"
  }
}
```

当前 MVP 支持：

1. `sheet_created`
   Gateway 已创建 `TaskExecutionSheet`。
2. `agent_started`
   某个 Agent 开始执行，携带 `AgentRun`。
3. `agent_progress`
   某个 Agent 更新进度，携带 `progressSummary` 和 `progressPercent`。
4. `artifact_created`
   某个 Agent 生成产物，携带 `ArtifactEnvelope` 和最新 `AgentRun`。
5. `gate_reached`
   触发人工或自动确认闸门。
6. `gate_updated`
   闸门状态更新。
7. `all_completed`
   本轮执行完成，携带最终 `TaskExecutionSheet`。
8. `run_failed`
   本轮执行失败，携带错误信息。

批次执行额外支持：

1. `batch_created`
2. `chapter_started`
3. `agent_started`
   某章内的制作 Agent 启动，携带 `chapterIndex`、`runId`、`agentId` 和当前 `AgentRun`。
4. `chapter_progress`
   某章内的制作 Agent 更新进度。除 `progressSummary` / `progressPercent` 外，可携带 `phase`、`detail`、`model`，用于前端展示真实后台阶段和最近活动。
5. `artifact_created`
   某章内的 Agent 生成产物，携带 `ArtifactEnvelope`。
6. `agent_failed`
   某章内的 Agent 失败，携带 `error`。
7. `gate_reached`
   批次章运行在 `quality_review` 后暂停，前端应展示 `awaiting_review` 和人工操作按钮。
8. `gate_updated`
9. `chapter_completed`
10. `chapter_failed`
11. `batch_completed`
12. `batch_cancelled`
13. `batch_failed`

补充约束：

1. Gateway 端使用 `batchId -> Set<connection>` 的订阅表广播批次事件，不再把事件绑定到单一 WebSocket 连接。
2. 新连接认证完成后，会自动补订阅所有运行中的批次；前端也可调用 `scriptAdapter.batch.subscribe` 做显式补订阅。
3. `chapter_runs.status = 'awaiting_review'` 时，批次循环必须暂停，不允许继续跑后续章节。
4. `single_runs` 与 `gate_decisions` 会落盘到 SQLite，Gateway 重启后单次执行中的 `running/pending` 会恢复为 `interrupted`。
5. 真实批次中只要存在 `chapter_runs.status = 'failed'`，批次最终状态必须汇总为 `failed`，不得仅因没有待执行章节而标记为 `completed`。
6. 真实批次失败时应保留当前 `TaskExecutionSheet` 到 `chapter_runs.sheet`，让前端可以展开查看失败 Agent、错误摘要和已生成上游产物。
7. `executionMode = real` 或 `realAgents = all` 的批次不得写入带 `mock` 标记的交付产物；如果真实 Agent 不可用，应以失败状态显式暴露，而不是静默降级成模拟交付。
8. Gateway 启动恢复时，应把历史 `status = completed` 且 `failed_chapters > 0` 的批次修正为 `failed`。
9. 批次工作台应以 Gateway 事件作为真实状态源：用最近事件时间展示心跳，用 `chapter_progress.phase` 展示当前阶段，不使用脱离后台事件的假进度。

---

## 4. 前端落点

前端服务：

`src/modules/script-adapter/services/gatewayExecution.ts`

职责：

1. 封装 `startScriptAdapterRun`。
2. 订阅 `onScriptAdapterEvent`。
3. 将 Gateway payload 收敛为 `ScriptAdapterGatewayEvent`。

工作台：

`src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`

职责：

1. 点击开工时优先请求 Gateway。
2. Gateway 不可用时降级到前端 mock。
3. 收到事件后更新 Zustand `executionSheets`。

---

## 5. 当前边界

MVP 不做：

1. 真实模型调用。
2. 任务取消恢复。
3. 多任务并发调度。
4. 持久化执行记录。
5. 跨设备同步。

这些能力应在状态机稳定后逐步补。
