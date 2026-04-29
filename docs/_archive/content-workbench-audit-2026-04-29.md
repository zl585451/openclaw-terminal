# 内容制作工作台 — 架构接手审计报告

> 审计日期：2026-04-29  
> 审计人：Claude（架构接手，Cowork 模式）  
> 状态：CURRENT — 可直接交给 Cursor 执行

---

## 第一部分：现状盘点

### 1.1 系统边界

内容制作工作台（Content Production Workbench）是 OCT 里独立的功能模块，代号 `script-adapter`。  
它的目标是：把一本小说按章节拆解，经过 5 个专职 Agent 串行处理，最终输出多人演播有声书台本。

**涉及代码范围：**

```
前端
  src/modules/script-adapter/          ← 功能主体
    types/         执行、批次、项目、产物类型定义
    store/         Zustand store + actions
    services/      IPC 桥接、mock、导出、书库客户端
    ui/            所有页面组件
    mockData/      开发期假数据

网关
  oct-gateway/script_adapter/          ← 执行引擎
    agentRunner.js         mock pipeline 执行器（非 agents/agent_runner.js）
    batchOrchestrator.js   批次调度 + 持久化循环
    persistence.js         SQLite（batch_jobs + chapter_runs）
    mock_execution.js      单次执行入口（也支持真实 agent）
    mockArtifactFactory.js agent 决策路由（mock vs real）
    agents/                5 个真实 Agent 实现
    eventEmitter.js        事件推送工具
    runRegistry.js         单次运行注册表（内存 Map）

Electron
  electron/main.ts         IPC 注册（script-adapter-batch-* / script-adapter-run-*）
  electron/preload.ts      前端 window.electronAPI 暴露
```

---

### 1.2 数据流

#### 批次执行（主路径）

```
WorkbenchView.tsx
  └─ startBatchExecution()
       └─ startGatewayBatch()        [gatewayBatch.ts]
            └─ electronAPI.scriptAdapterBatch.start()
                 └─ IPC: script-adapter-batch-start [main.ts]
                      └─ WebSocket → scriptAdapter.batch.start [index.js]
                           └─ batchOrchestrator.startBatch()
                                └─ SQLite createBatch()
                                └─ runBatchLoop()
                                     └─ executeChapter() × N
                                          └─ runSingleScriptAdapterChapter()
                                               └─ runMockAgentPipeline()
                                                    └─ createArtifactForAgent() × 5
                                                         ├─ [real] runTextRewriterAgent()  等
                                                         └─ [mock] 静态模板返回
                                          └─ SQLite updateChapterRun()
                                └─ emit('chapter_*') → WebSocket → IPC → 前端
```

#### 单次执行（WorkbenchView 的另一路径）

```
WorkbenchView.tsx
  └─ startExecution()
       └─ startGatewayExecution()    [gatewayExecution.ts]
            └─ electronAPI.startScriptAdapterRun({ useMock: true, ... })
                 └─ IPC: script-adapter-run-start [main.ts]
                      └─ WebSocket → scriptAdapter.run.start [index.js]
                           └─ startMockScriptAdapterRun()
                                └─ runRegistry.registerRun()  ← 内存
                                └─ runMockAgentPipeline()     ← 同上
```

#### 事件回流（批次 + 单次均适用）

```
Gateway → WebSocket push → main.ts: 'script-adapter-event' → preload: onScriptAdapterEvent → 
  subscribeGatewayBatchEvents / subscribeGatewayExecutionEvents → 
  scriptAdapterActions.*() → Zustand store → React 重渲染
```

---

### 1.3 Agent 流水线（5 段）

| 顺序 | Agent ID | 输入产物 | 输出产物 | 真实实现 |
|------|----------|----------|----------|----------|
| 1 | adapter.audiobook_text_rewriter@1.0 | source_document | adapted_script | ✅ textRewriterAgent.js（含分块处理） |
| 2 | classifier.voice_role_marker@1.0 | adapted_script | voice_registry | ✅ voiceClassifierAgent.js |
| 3 | designer.performance_audio@1.0 | adapted_script, voice_registry | performance_design | ✅ performanceDesignerAgent.js |
| 4 | reviewer.production_quality@1.0 | 全部上游 | review_report | ✅ qualityReviewerAgent.js |
| 5 | packager.content_delivery@1.0 | 全部上游 | final_package | ✅ deliveryPackagerAgent.js |

**真实 Agent 开关机制：**  
`mockArtifactFactory.js` 中 `isRealAgentEnabled(agentId, ctx)` 读取：  
- `ctx.realAgentsOverride`（来自 batch config 或单次参数）  
- 或 `SCRIPT_ADAPTER_REAL_AGENTS` 环境变量 / config.json

---

### 1.4 持久化结构

```
SQLite（批次，重启可恢复）
  batch_jobs          批次元数据、状态、费用
  chapter_runs        每章执行记录，sheet 以 JSON 存储

内存（单次，重启丢失）
  runRegistry.js      runs: Map<taskId, Record>

Zustand（前端，页面刷新丢失）
  executionSheets     单次 TaskExecutionSheet
  currentBatch        当前批次 BatchJob + ChapterRunRecord[]
```

---

### 1.5 哪些部分具备长期价值

- **类型系统完备**：`TaskExecutionSheet / BatchJob / AgentRun / ArtifactEnvelope / ReviewGate` 设计干净，可直接复用
- **BatchOrchestrator 骨架健全**：有 SQLite 持久化、AbortController 取消、crash recovery（`recoverInterruptedBatches`）、章级重试（`rerunChapter`）、跨章 voiceRegistry 累积
- **5 个真实 Agent 实现完整**：有分块处理、JSON 解析容错、provider 路由
- **事件系统设计合理**：类型化事件从 Gateway → IPC → 前端，边界清晰
- **Zustand actions 模式**：`scriptAdapterStore + actions.ts` 分离做得好，易于维护
- **batchBudget.ts 费用预估**：有参数化接口，未来可替换为真实 token 计价

---

## 第二部分：结构问题审计

### 2.1 Agent 是否只是 prompt 包装？

**不是**。5 个 Agent 有独立 LLM 调用、JSON Schema 输出约束、错误降级（真实失败时返回占位 artifact）、分块处理（textRewriterAgent）。  
结论：Agent 层本身具备任务单元语义，不是空壳包装。

### 2.2 是否有统一 Task / Job / Pipeline 数据模型？

**部分有**。  
- `TaskExecutionSheet`（前端+网关共用）是合理的 Pipeline 数据模型  
- `BatchJob + ChapterRunRecord`（网关 SQLite）是合理的 Job 数据模型  
- **问题**：两套模型没有显式父子关系——`ChapterRunRecord.sheet` 内嵌了 `TaskExecutionSheet`，但 Zustand 前端不知道这个嵌套关系，导致状态同步靠事件推送。

### 2.3 是否支持长任务断点续跑？

**批次支持，单次不支持**。  
- 批次：SQLite 记录章状态，`recoverInterruptedBatches()` 在启动时将 running 章改为 paused，可 rerun
- 单次：`runRegistry.js` 是纯内存 Map，Gateway 重启后单次运行全部丢失，无法续跑

### 2.4 是否有队列、状态机、失败重试？

- **队列**：batchOrchestrator 的 `runBatchLoop` 是串行 while 循环，实现了隐式队列
- **状态机**：无显式状态机；状态转换散落在 `batchOrchestrator + agentRunner + persistence` 三个文件
- **失败重试**：章级 `rerunChapter` 支持手动重跑，但无自动重试策略（max_attempts、backoff）
- **取消 / 暂停 / 恢复**：批次取消（`cancelBatch`）有效，暂停（`paused`）是状态标记但不能在运行中动态暂停

### 2.5 是否有任务产物管理？

**批次有，单次没有**。  
- 批次：`chapter_runs.sheet` JSON 存在 SQLite，重启可读
- 单次：`executionSheets` 在 Zustand 内存，页面刷新即丢失
- **缺失**：无产物版本管理；无产物拒绝→修改→再接受闭环（actions.ts 中 `rejectArtifact` 是 `console.log` 占位）

### 2.6 是否有清晰的人工审核节点？

**有结构，无实现**。  
`ReviewGate` 数据结构存在，有 `gate_reached` 事件，但 `agentRunner.js` 在发送 `gate_reached` 事件后等待 500ms 就自动 approve，不会真正阻塞。UI 上"需要你复核"标签是展示性的，不影响执行。

### 2.7 是否有日志和可观测性？

- 网关用 pino-based logger，有基本的 `info/warn/error` 打点
- 无结构化的任务生命周期日志（无完整的 span/trace）
- 前端无 agent 执行耗时、token 用量的持久化记录（只在 `ArtifactEnvelope.metrics` 里有，但不聚合展示）

### 2.8 前端 UI 是否真实反映后端任务状态？

**批次基本可以，单次不完整**。  
- 批次：30 秒轮询 + 事件订阅，状态基本同步；网络断开后等轮询恢复
- 单次：完全依赖 WebSocket 事件，无持久化；页面刷新后无法恢复已完成的 run

### 2.9 是否存在"模型说完成了，系统没有真实执行"的假执行问题？

**存在，但比预期的轻**。  
- 真正的假执行源头是 `agentRunner.js` 里 `createArtifactForAgent` 默认走 mock 路径
- `gatewayExecution.ts` 里 `useMock: true` 是前端发给网关的参数，但网关目前忽略它，实际由 `SCRIPT_ADAPTER_REAL_AGENTS` 环境变量控制
- **本质问题**：UI 上的"模拟演示 / 真实 Agent 试产"选项只影响 `config.executionMode`，但批次启动时这个值通过 `config.realAgents` 传到 `batchOrchestrator`，再通过 `ctx.realAgentsOverride` 传到 `mockArtifactFactory`。链路是通的，但命名混乱（"mock"函数实际上会调用真实 agent）

---

## 第三部分：风险分级

### P0 — 不修会导致系统不可用或未来无法扩展

---

**P0-1：批次执行期间 WebSocket 连接对象永久持有（连接过期事件丢失）**

- **问题描述**：`batchOrchestrator.startBatch(params, connection, logger)` 在批次创建时捕获 `connection` 对象引用。`createBatchScriptAdapterEmitter(connection, batchId)` 将这个引用嵌入闭包中用于整个批次生命周期的事件推送。如果用户网络闪断或 Electron 窗口重置，`connection` 对象变成过期引用，之后所有 `emit(...)` 调用会静默失败（或 crash），前端收不到任何进度。
- **证据**：`batchOrchestrator.js:8` — `const activeBatches = new Map()`；`batchOrchestrator.js:78` — `const emit = createBatchScriptAdapterEmitter(connection, batchId)`；connection 在整个 `runBatchLoop` 中不再刷新
- **风险后果**：用户开始一个 10 章批次，中途断网，重连后 UI 无进度，以为任务死了；只能靠 30 秒轮询恢复状态，但中间所有 `chapter_progress` 事件永久丢失
- **最小修补方案**：Gateway 维护一个 `batchId → Set<connection>` 的订阅表，每次新连接到来时检查是否有运行中的批次并自动订阅；`emit` 函数广播给当前所有活跃订阅者而非持有单个 connection
- **验收标准**：启动批次 → 断开 WebSocket → 重连 → 前端能接收后续 chapter_completed 事件

---

**P0-2：单次执行无持久化，Gateway 重启后运行状态全部丢失**

- **问题描述**：`runRegistry.js` 是纯内存 `Map`，无磁盘持久化。Gateway 崩溃或重启（用户更新配置时常见）导致所有进行中的单次执行元数据消失，前端无法知晓执行状态，只能永久等待或手动刷新
- **证据**：`runRegistry.js:1` — `const runs = new Map()`；无任何 fs.writeFile / SQLite 调用
- **风险后果**：面向"百万字小说"的长任务场景，单次运行可能持续数小时。任何 Gateway 中断都导致状态不可恢复
- **最小修补方案**：将 `runRegistry` 改为写入 SQLite（可复用 `persistence.js` 的 db 连接）；`startMockScriptAdapterRun` 启动时写入，结束时更新；Gateway 重启时将 in-flight 记录标记为 interrupted，支持前端查询
- **验收标准**：Gateway 重启后 `listScriptAdapterRuns` 能返回历史记录；已完成的 run 状态可查询

---

**P0-3：人工审核节点（ReviewGate）是结构性的假阻塞**

- **问题描述**：代码路径中 `agentRunner.js:72` 检测到 gate 后等待 500ms 然后直接 `status: 'approved'`，无任何真实等待机制。前端 UI 显示"需要你复核"但实际执行不会停下来等用户操作。系统设计文档里有 ReviewGate 概念，但当前实现与目标背道而驰
- **证据**：`agentRunner.js:69-80` — `await wait(500, signal); const approvedGate = { ...gate, status: 'approved' }`；无任何等待用户响应的机制
- **风险后果**：百万字小说场景里质检不通过的章节会被直接放行进入交付，不可能实现真正的人工复核工作流；未来接入真实 Agent 后这个问题会产生错误的制作产物
- **最小修补方案**：在 batchOrchestrator 层引入 `pendingGate` 状态：agent 完成后如果有 gate，设置 `chapterRun.status = 'awaiting_review'`，通知前端，暂停继续执行直到前端发来 approve/reject 指令
- **验收标准**：质检 agent 完成后，批次执行暂停；前端 UI 显示复核按钮；点击批准后执行继续

---

### P1 — 会造成维护困难或功能堆叠混乱

---

**P1-1：WorkbenchView.tsx 体量约 950 行，严重违反架构规则**

- **问题描述**：单个组件承担了：书库加载、批次管理、单次执行触发、成本估算 UI、确认对话框、进度展示、批次历史、团队角色展示等全部职责
- **证据**：`WorkbenchView.tsx` 共约 950 行；架构约定（`CLAUDE.md` + `AI_PROJECT_OVERVIEW.md`）单文件超 500 行需先拆再扩展
- **风险后果**：任何新功能都会在这个文件上继续堆叠；多个并行 AI 协作时冲突风险极高；测试无法隔离
- **最小修补方案**：按职责拆成：`BatchSetupPanel`（书库选择+预算）、`BatchExecutionPanel`（进度+历史）、`StartConfirmDialog`（确认弹窗），WorkbenchView 保留组合逻辑，每个子组件不超过 200 行
- **验收标准**：拆分后 `npx tsc --noEmit` 通过；功能行为不变；WorkbenchView 本体 < 150 行

---

**P1-2：actions.ts 中 4 个产物操作是 console.log 占位**

- **问题描述**：`rejectArtifact`、`openArtifact`、`viewArtifactHistory`、`pauseStage` 全部只有 `console.log`，但 UI 上已经有对应的展示位（`ArtifactPreview`、`DeliveryPreview`）
- **证据**：`actions.ts:184-202` — 四个函数体内只有 `console.log`
- **风险后果**：用户点击"拒绝产物"时静默失败，体验断裂；未来实现时需要重新设计数据流
- **最小修补方案**：Phase 1 至少实现 `rejectArtifact`（更新 gate 状态为 rejected + 前端提示）；其余标注 TODO
- **验收标准**：`rejectArtifact` 调用后 ReviewGate 状态变为 rejected，前端展示拒绝原因

---

**P1-3：命名混乱导致真实 Agent 执行路径不可辨认**

- **问题描述**：`startMockScriptAdapterRun`、`mock_execution.js`、`runMockAgentPipeline`、`mockArtifactFactory.js` 这些文件/函数命名全部包含 "mock"，但实际上它们都支持调用真实 LLM（通过 `isRealAgentEnabled`）。`gatewayExecution.ts` 发送 `useMock: true` 的字段名进一步误导，实际上该字段被忽略
- **证据**：`mockArtifactFactory.js:34-50` — `isRealAgentEnabled(agentId, ctx)` 为真时调用 `runTextRewriterAgent`；`gatewayExecution.ts:33` — `useMock: true` 永远发送；`index.js:471` — 网关忽略该字段
- **风险后果**：新接手 AI 看到 "mock" 前缀默认认为不会调用真实模型，可能错误地修改或跳过这些文件
- **最小修补方案**：重命名：`mock_execution.js → chapterPipeline.js`；`runMockAgentPipeline → runAgentPipeline`；移除 `useMock` 字段；用 `realAgents` 字段统一控制
- **验收标准**：重命名后 `npx tsc --noEmit` + `npx vitest run` 全部通过

---

**P1-4：批次的跨章 VoiceRegistry 累积不对前端可见**

- **问题描述**：`batchOrchestrator.updateSharedContext` 在每章完成后累积 voiceRegistry，存入 `batch_jobs.config.sharedContext`，但前端的 `BatchProgressView` 不展示这个共享上下文，用户无法看到也无法纠正跨章的角色音分配
- **风险后果**：百万字小说场景里角色音分配错误会在每章都传播，无法中途修正
- **最小修补方案**：在 `BatchProgressView` 中增加一个"共享角色音表"折叠区，展示 `batch.config.sharedContext.voiceRegistry`；Phase 2 再支持编辑

---

**P1-5：两套不相关的任务队列系统**

- **问题描述**：`oct-gateway/task_queue.js`（AMY 的后台工具任务，JSON 文件存储）和 `oct-gateway/script_adapter/`（内容生产批次，SQLite）是完全独立的两套系统，概念上重叠但无法互通
- **风险后果**：Phase 3 若要统一 "百万字小说 → 广播剧" 的生产级工作流，两套队列会产生严重的架构分裂
- **最小修补方案**：Phase 2 时为两套系统定义共同的抽象接口（Job / Queue），Phase 3 逐步迁移

---

### P2 — 体验或效率问题

**P2-1**：`TASK_STEPS` 在 WorkbenchView 中硬编码，不由 pipeline stages 驱动  
**P2-2**：`batchBudget.ts` 使用固定系数估算费用，不连接真实 token 计费  
**P2-3**：Library 服务（`http://127.0.0.1:8001`）离线时无友好降级，直接抛错  
**P2-4**：单次执行产物在页面刷新后丢失（Zustand 无持久化），用户需重新执行  
**P2-5**：30 秒轮询间隔过长，批次进度更新延迟显著

---

## 第四部分：接手改造路线

### Phase 1：稳定当前系统，不改变大结构（2-3 天）

**目标**：消除 P0/P1 中不做就无法推进的问题；让现有功能真正可用  
**原则**：所有改动可单独回滚；不引入新框架；不破坏 mock 路径

#### 1-A：修复批次事件订阅（P0-1）

**涉及文件**：
- `oct-gateway/script_adapter/eventEmitter.js`（修改）
- `oct-gateway/script_adapter/batchOrchestrator.js`（修改）
- `oct-gateway/index.js`（修改：连接管理部分）

**新增模块**：  
`oct-gateway/script_adapter/connectionRegistry.js`

```javascript
// connectionRegistry.js
const batchSubscribers = new Map(); // batchId → Set<connection>

function subscribe(batchId, connection) {
  if (!batchSubscribers.has(batchId)) batchSubscribers.set(batchId, new Set());
  batchSubscribers.get(batchId).add(connection);
}

function unsubscribe(batchId, connection) {
  batchSubscribers.get(batchId)?.delete(connection);
}

function broadcast(batchId, event) {
  const subs = batchSubscribers.get(batchId);
  if (!subs) return;
  for (const conn of subs) {
    try { conn.send(JSON.stringify(event)); } catch {}
  }
}

function onConnectionClose(connection) {
  for (const [batchId, subs] of batchSubscribers) {
    subs.delete(connection);
    if (subs.size === 0) batchSubscribers.delete(batchId);
  }
}

module.exports = { subscribe, unsubscribe, broadcast, onConnectionClose };
```

**修改 batchOrchestrator.js**：  
`createBatchScriptAdapterEmitter(connection, batchId)` 改为 `createBatchScriptAdapterEmitter(batchId)`，内部使用 `connectionRegistry.broadcast`

**修改 index.js**：  
- 新连接发来 `scriptAdapter.batch.subscribe` 时调用 `connectionRegistry.subscribe`  
- 连接断开时调用 `connectionRegistry.onConnectionClose`  
- `listBatches` 响应时，对 running 状态批次自动发送 `auto_subscribe` 通知

**状态流转**：  
`connection open → subscribe(runningBatchId, conn) → 后续 broadcast 自动推送`

**Cursor 任务**：
```
TASK-1A: 新建 oct-gateway/script_adapter/connectionRegistry.js（内容见上）
TASK-1B: 修改 eventEmitter.js: createBatchScriptAdapterEmitter(batchId) 改为广播模式
TASK-1C: 修改 batchOrchestrator.js: 移除 connection 参数，使用 broadcast
TASK-1D: 修改 index.js: 连接管理增加 subscribe / unsubscribe / onClose 钩子
```

**测试验收**：  
启动批次 → WebSocket 断开 → 等待 2 秒重连 → 确认收到后续 chapter_completed 事件

---

#### 1-B：单次执行持久化（P0-2）

**涉及文件**：
- `oct-gateway/script_adapter/runRegistry.js`（重写）
- `oct-gateway/script_adapter/persistence.js`（增加 run 表）

**数据结构**（新增 SQLite 表）：
```sql
CREATE TABLE IF NOT EXISTS single_runs (
  task_id TEXT PRIMARY KEY,
  plan_id TEXT,
  task_title TEXT,
  status TEXT NOT NULL,  -- pending/running/completed/failed/cancelled/interrupted
  sheet TEXT,            -- JSON: TaskExecutionSheet
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT
);
```

**修改 runRegistry.js**：  
保留内存 Map 作为热缓存；写入时同步写 SQLite；启动时从 SQLite 读取并将 running 状态改为 interrupted

**Cursor 任务**：
```
TASK-1E: persistence.js 增加 createRun / updateRun / getRun / listRuns / 启动时 recoverInterruptedRuns
TASK-1F: runRegistry.js 改为写透模式（内存 + SQLite 双写）
TASK-1G: mock_execution.js 在 runMockAgentPipeline 完成每个 agent 时调用 runRegistry.updateRun(sheet)
```

**测试验收**：  
执行单次 run → 强制重启 gateway → `listScriptAdapterRuns` 返回该 run 记录，状态为 interrupted

---

#### 1-C：拆分 WorkbenchView.tsx（P1-1）

**拆分方案**：

```
WorkbenchView.tsx       ← 组合层，< 150 行，只做条件路由
  ├── BatchSetupPanel.tsx      ← 书库选择 + 预算计算 + 开工确认
  ├── BatchExecutionPanel.tsx  ← 进度、历史、重跑、导出
  ├── StartConfirmDialog.tsx   ← 确认弹窗（modal）
  └── ExecutionView.tsx        ← 已存在，单次执行展示（不改）
```

**Cursor 任务**：
```
TASK-1H: 从 WorkbenchView.tsx 抽取 BatchSetupPanel（书库选择、预算卡、交付选项）
TASK-1I: 从 WorkbenchView.tsx 抽取 BatchExecutionPanel（BatchProgressView wrapper + 历史 + 导出）
TASK-1J: 从 WorkbenchView.tsx 抽取 StartConfirmDialog（独立 modal 组件）
TASK-1K: WorkbenchView.tsx 保留 useEffect 副作用和条件路由，< 150 行
```

**测试验收**：  
`npx tsc --noEmit` 通过；批次启动、进度查看、导出功能行为不变

---

#### 1-D：修复命名混乱（P1-3）

**重命名清单**（网关端）：
```
mock_execution.js       → chapterPipeline.js
runMockAgentPipeline    → runAgentPipeline
mockArtifactFactory.js  保持文件名，函数不改（内部命名可逐步改）
startMockScriptAdapterRun → startScriptAdapterRun（index.js 中的调用入口）
```

**前端端**：
- `gatewayExecution.ts` 中删除 `useMock: true` 字段；改用 `realAgents: config?.realAgents` 传递

**Cursor 任务**：
```
TASK-1L: 网关端重命名上述文件/函数（更新所有 require 引用）
TASK-1M: 前端 gatewayExecution.ts 移除 useMock，透传 realAgents 字段
TASK-1N: node --check oct-gateway/index.js 验证语法无误
```

---

### Phase 2：抽象 Agent Queue / Task / Pipeline（1-2 周）

**目标**：构建真正的任务执行基础设施，支持长任务、人工审核、断点续跑

#### 2-A：ReviewGate 真实阻塞（P0-3）

**数据结构变化**：

```javascript
// chapter_runs 新增字段
ALTER TABLE chapter_runs ADD COLUMN pending_gate_id TEXT;
ALTER TABLE chapter_runs ADD COLUMN pending_gate_type TEXT;

// 新增 gate_decisions 表
CREATE TABLE IF NOT EXISTS gate_decisions (
  gate_id TEXT PRIMARY KEY,
  batch_id TEXT,
  chapter_run_id TEXT,
  gate_type TEXT,
  status TEXT,           -- pending / approved / rejected
  reviewer_note TEXT,
  decided_at TEXT
);
```

**流程变化**：
```
agent 完成 → gate 存在 → 
  updateChapterRun({ status: 'awaiting_review', pendingGateId }) →
  emit('gate_reached') → 
  runBatchLoop 跳过该章（findNextPendingChapter 只返回 pending 章）

用户点击批准 → 
  scriptAdapter.batch.approveGate(batchId, gateId) →
  updateGateDecision({ status: 'approved' }) →
  updateChapterRun({ status: 'pending', pendingGateId: null }) →
  batchOrchestrator 恢复处理（如已暂停则重新触发 runBatchLoop）
```

**Cursor 任务**：
```
TASK-2A: persistence.js 增加 gate_decisions 表 + updateGateDecision / getGateDecision 方法
TASK-2B: batchOrchestrator.executeChapter: gate 到达时设置 awaiting_review，不继续
TASK-2C: index.js: 新增 scriptAdapter.batch.approveGate / rejectGate 消息处理
TASK-2D: 前端 gatewayBatch.ts: 新增 approveGate / rejectGate 函数
TASK-2E: 前端 BatchProgressView: 显示 awaiting_review 章节的复核按钮
```

---

#### 2-B：统一执行状态机

将当前散落在 `batchOrchestrator / agentRunner / persistence` 的状态转换提炼为显式状态图：

```
ChapterRun 状态机：
  pending → running → completed
                    → failed → (rerun) → pending
                    → awaiting_review → (approve) → running（继续）
                                      → (reject) → failed

BatchJob 状态机：
  pending → running → completed
                    → failed
                    → paused → (resume) → running
                    → cancelled
```

**Cursor 任务**：
```
TASK-2F: 新建 oct-gateway/script_adapter/stateMachine.js
         导出 validChapterTransitions / validBatchTransitions
         persistence.updateChapterRun 调用前验证合法转换
TASK-2G: 在所有状态更新点使用 stateMachine.validateTransition，非法转换抛错
```

---

#### 2-C：产物持久化（P1 修复）

**目标**：单次执行产物持久化；前端刷新后可恢复；批次产物可按章查看

**方案**：
- 单次：`runRegistry.updateRun(sheet)` 每个 agent 完成后写入 `single_runs.sheet`
- 前端：`ScriptAdapterApp` mount 时从 `listScriptAdapterRuns` 恢复最近一次已完成 run 的 sheet

**Cursor 任务**：
```
TASK-2H: chapterPipeline.js: 每个 agent 完成后调用 runRegistry.updateRun 更新 sheet
TASK-2I: 前端 ScriptAdapterApp.tsx: mount 时 fetch listGatewayExecutions，将最近 run 的 sheet 写入 store
TASK-2J: actions.rejectArtifact: 实现更新 gate status + 前端通知
```

---

### Phase 3：面向"百万字小说 → 广播剧"的生产级工作流（3-4 周）

**目标**：支持百万字级别批量处理；章节间上下文传递；人工复核闭环；多种输出格式

#### 3-A：批次并发处理（当前串行 → 可配置并发）

**数据结构变化**：

```javascript
// BatchConfig 增加
{
  concurrency: 1,  // 默认串行；生产环境可设为 3
  chunkSizeChars: 4000,  // 每个 LLM 调用的文本块大小
}
```

**实现**：`runBatchLoop` 改为 Promise pool 模式，允许最多 N 章并发；每章内部 Agent 仍串行

---

#### 3-B：章间上下文系统

**当前**：voiceRegistry 跨章传递（已实现）  
**扩展**：增加 plotLock（人物关系/剧情锁定）、styleLock（风格画像）跨章传递

```javascript
// BatchConfig.sharedContext 扩展
{
  voiceRegistry: [],
  plotLock: {          // 由质检 agent 更新
    characterRelations: [],
    keyEvents: [],
    suspensePoints: [],
  },
  styleLock: {         // 由第一章建立，后续章节引用
    tone: '',
    narratorStyle: '',
  },
  lastUpdatedAtChapter: null,
}
```

---

#### 3-C：生产级人工复核工作台

**功能**：
- 按章逐一查看 `adapted_script` → 允许人工标注修改意见
- 批准 / 拒绝 → 触发该章重跑（仅失败 agent 开始，保留前序 artifacts）
- 导出前必须所有章 gate 通过

**UI 组件**：
- `ChapterReviewPanel.tsx`：显示 `adapted_script` 分段 + inline 批注
- `VoiceRegistryEditor.tsx`：跨章角色音表统一编辑

---

#### 3-D：生产级产物导出

**扩展** `exportClient.ts`：
- 全书 DOCX（合并所有章）
- 角色音表（Excel 格式）
- 演播设计稿（Markdown / PDF）
- 质检汇总报告

---

#### Phase 3 Cursor 任务列表

```
TASK-3A: batchOrchestrator.js: Promise pool 并发执行（concurrency 参数）
TASK-3B: chapterPipeline.js: 接收 plotLock / styleLock 并注入 agent systemPrompt
TASK-3C: 各 agent 完成后更新 sharedContext.plotLock（由 qualityReviewerAgent 提取）
TASK-3D: 新建 ChapterReviewPanel.tsx（inline 批注 + 批准/拒绝）
TASK-3E: 新建 VoiceRegistryEditor.tsx（跨章角色音编辑）
TASK-3F: exportClient.ts 增加全书合并 DOCX 导出
TASK-3G: 补写 Phase 3 单测（章间上下文传递、并发 batch、review 闭环）
```

---

## 第五部分：保守原则

### 每个 Phase 的回滚保障

**Phase 1**：
- 1-A（连接注册）：`connectionRegistry.js` 是新增文件，失败时删除即恢复
- 1-B（单次持久化）：SQLite 新增表，不改现有表；失败时 runRegistry 回退到纯内存
- 1-C（拆分组件）：每个子组件独立 PR；失败时删除新文件，WorkbenchView.tsx 回退
- 1-D（重命名）：通过 git rename + require 更新；`node --check` 验证后合入

**Phase 2**：
- 每个 TASK 独立可回滚
- stateMachine 只是验证层，不改核心逻辑；关闭验证时退化为原来行为
- ReviewGate 阻塞：旧的 auto-approve 逻辑以 flag 控制保留（`gateAutoApprove: true` 兜底）

**Phase 3**：
- 并发处理：concurrency=1 时与当前行为完全一致
- 章间上下文：sharedContext 字段可选，旧批次不受影响

### 不引入新框架原则

- 不引入 BullMQ、Agenda、Temporal 等队列框架（自己的 while-loop + SQLite 足够）
- 不引入 XState（自制 stateMachine.js 约 50 行足够）
- 不引入 tRPC / GraphQL（现有 WebSocket 协议满足需求）

### 测试节点

每个 Phase 完成后运行：
```bash
npx tsc --noEmit
npx vitest run
node --check oct-gateway/index.js
node --check oct-gateway/script_adapter/chapterPipeline.js
```

---

## 附：文件修改影响矩阵

| 文件 | Phase 1 | Phase 2 | Phase 3 | 高风险 |
|------|---------|---------|---------|--------|
| batchOrchestrator.js | 修改（1-A） | 修改（2-A, 2-B） | 修改（3-A） | ⚠️ |
| mock_execution.js → chapterPipeline.js | 重命名（1-D） | 修改（2-H） | 修改（3-B） | |
| runRegistry.js | 重写（1-B） | — | — | |
| WorkbenchView.tsx | 拆分（1-C） | — | — | ⚠️ |
| persistence.js | 修改（1-B） | 修改（2-A） | — | |
| eventEmitter.js | 修改（1-A） | — | — | |
| actions.ts | — | 修改（2-J） | — | |
| gatewayExecution.ts | 修改（1-M） | — | — | |
| index.js | 修改（1-D） | 修改（2-C） | — | |
