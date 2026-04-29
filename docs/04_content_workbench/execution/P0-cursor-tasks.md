# P0 阶段 — Cursor 执行包

> 优先级：P0，立即执行  
> 预计耗时：2-3 天  
> 前置条件：无（不依赖其他 Phase）  
> 执行顺序：P0-1 → P0-2 → P0-3（顺序执行，不并行）  
> 验证命令：每个任务完成后必须跑 `npx tsc --noEmit` + `node --check oct-gateway/index.js`

---

## 背景说明（给 Cursor 读）

这是 OCT（OpenClaw Terminal）内容制作工作台模块的 P0 修复任务包。  
系统当前技术栈：Electron + React + TypeScript（前端）、Node.js CommonJS（网关）。  
网关与前端严禁互相 import，只通过 IPC + WebSocket 通信。  
不要修改 `src/core/`、`src/hooks/useMessages.ts`、`src/core/streamRouter*`、`src/core/turnFSM*`（主聊天链路高风险区）。

---

## P0-1：批次事件广播（修复断网后进度全丢问题）

### 问题

`batchOrchestrator.js` 在 `startBatch()` 时捕获单个 `connection` 对象，整个批次生命周期用这个引用推送事件。断网重连后，旧 connection 已失效，所有后续事件静默丢失，前端无进度。

### 目标

改为「订阅表」模式：任何新连接都可以订阅运行中的批次，事件广播给全部订阅者。

---

### TASK-P0-1-A：新建 connectionRegistry.js

**文件**：`oct-gateway/script_adapter/connectionRegistry.js`（新建）

```javascript
'use strict';

/**
 * connectionRegistry.js
 *
 * 管理批次事件的 WebSocket 订阅关系。
 * 解决问题：batchOrchestrator 原先持有单个 connection 引用，断网后事件丢失。
 * 改为：batchId → Set<connection> 的订阅表，事件广播给全部活跃订阅者。
 */

/** @type {Map<string, Set<object>>} batchId → 订阅该批次的 connection 集合 */
const batchSubscribers = new Map();

/**
 * 订阅某个批次的事件。
 * @param {string} batchId
 * @param {object} connection - WebSocket connection 对象，需有 .send(json) 方法
 */
function subscribe(batchId, connection) {
  if (!batchSubscribers.has(batchId)) {
    batchSubscribers.set(batchId, new Set());
  }
  batchSubscribers.get(batchId).add(connection);
}

/**
 * 取消订阅。
 * @param {string} batchId
 * @param {object} connection
 */
function unsubscribe(batchId, connection) {
  batchSubscribers.get(batchId)?.delete(connection);
}

/**
 * 向所有订阅该批次的连接广播事件。
 * 发送失败的连接会被自动移除。
 * @param {string} batchId
 * @param {object} eventPayload - 已序列化前的事件对象
 */
function broadcast(batchId, eventPayload) {
  const subs = batchSubscribers.get(batchId);
  if (!subs || subs.size === 0) return;

  const json = JSON.stringify(eventPayload);
  for (const conn of [...subs]) {
    try {
      conn.send(json);
    } catch {
      subs.delete(conn);
    }
  }
}

/**
 * 连接断开时，从所有批次订阅中移除该 connection。
 * 在 WebSocket onClose 钩子中调用。
 * @param {object} connection
 */
function onConnectionClose(connection) {
  for (const [batchId, subs] of batchSubscribers) {
    subs.delete(connection);
    if (subs.size === 0) {
      batchSubscribers.delete(batchId);
    }
  }
}

/**
 * 返回所有有活跃订阅者的 batchId 列表（调试用）。
 * @returns {string[]}
 */
function activeSubscriptions() {
  return [...batchSubscribers.entries()]
    .filter(([, subs]) => subs.size > 0)
    .map(([batchId]) => batchId);
}

module.exports = { subscribe, unsubscribe, broadcast, onConnectionClose, activeSubscriptions };
```

**验收**：文件存在，`node --check oct-gateway/script_adapter/connectionRegistry.js` 通过。

---

### TASK-P0-1-B：修改 eventEmitter.js

**文件**：`oct-gateway/script_adapter/eventEmitter.js`

找到 `createBatchScriptAdapterEmitter` 函数（当前直接调用 `connection.send`），改为调用 `connectionRegistry.broadcast`。

**修改前大致逻辑**：
```javascript
// 当前：持有单个 connection
function createBatchScriptAdapterEmitter(connection, batchId) {
  return function emit(event, payload) {
    connection.send(JSON.stringify({ type: 'push', event: `batch:${event}`, batchId, ...payload }));
  };
}
```

**修改后**：
```javascript
const connectionRegistry = require('./connectionRegistry');

function createBatchScriptAdapterEmitter(batchId) {
  return function emit(event, payload) {
    connectionRegistry.broadcast(batchId, {
      type: 'push',
      event: `batch:${event}`,
      batchId,
      ...payload,
    });
  };
}
```

注意：`connection` 参数从签名中移除。同时保留 `createScriptAdapterEmitter`（单次执行用）不动。

**验收**：`node --check oct-gateway/script_adapter/eventEmitter.js` 通过。

---

### TASK-P0-1-C：修改 batchOrchestrator.js

**文件**：`oct-gateway/script_adapter/batchOrchestrator.js`

1. 顶部引入 connectionRegistry：
   ```javascript
   const connectionRegistry = require('./connectionRegistry');
   ```

2. `startBatch(params, connection, logger)` 函数：
   - 在函数开头，使用 connection 向 registry 订阅：
     ```javascript
     connectionRegistry.subscribe(batchId, connection);
     ```
   - `createBatchScriptAdapterEmitter` 调用改为只传 `batchId`：
     ```javascript
     const emit = createBatchScriptAdapterEmitter(batchId); // 移除 connection 参数
     ```

3. `runBatchLoop(batchId, connection, logger)` 函数：
   - 同样改为 `createBatchScriptAdapterEmitter(batchId)`
   - 函数签名中 connection 参数保留（供外部调用兼容），但内部不再用它推事件

**验收**：`node --check oct-gateway/script_adapter/batchOrchestrator.js` 通过。

---

### TASK-P0-1-D：修改 index.js（连接管理 + 自动订阅）

**文件**：`oct-gateway/index.js`

在文件顶部引入：
```javascript
const connectionRegistry = require('./script_adapter/connectionRegistry');
const { listRunningBatches } = require('./script_adapter/persistence');
```

**1. 新连接建立时**（找到 WebSocket `connection` 的 onOpen 或初始化位置）：

```javascript
// 新连接建立后，自动订阅所有正在运行的批次
const runningBatches = persistence.listRunningBatches(); // 已有此方法
for (const batch of runningBatches) {
  connectionRegistry.subscribe(batch.id, connection);
}
```

**2. 连接断开时**（找到 onClose 钩子）：

```javascript
connectionRegistry.onConnectionClose(connection);
```

**3. 新增消息处理**（在 `handleTransportMessage` 函数中，已有的 `scriptAdapter.batch.*` 处理块之后追加）：

```javascript
// 客户端主动订阅某个批次（重连后调用）
if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.subscribe') {
  const batchId = String(msg.params?.batchId || '');
  if (batchId) {
    connectionRegistry.subscribe(batchId, connection);
    connection.send(JSON.stringify({
      type: 'res', id: msg.id, ok: true,
      method: msg.method,
      payload: { subscribed: true, batchId },
    }));
  }
  return true;
}
```

**验收**：`node --check oct-gateway/index.js` 通过。

---

### TASK-P0-1-E：前端订阅重连（gatewayBatch.ts）

**文件**：`src/modules/script-adapter/services/gatewayBatch.ts`

在现有函数列表末尾追加：

```typescript
/**
 * 重连后主动订阅某个批次的事件推送。
 * 在 WebSocket reconnect 成功后、currentBatchId 存在时调用。
 */
export async function subscribeGatewayBatch(batchId: string) {
  if (!window.electronAPI?.scriptAdapterBatch) return { success: false };
  // 复用已有的 IPC 通道，通过底层 sendScriptAdapterRunRequest 发送 subscribe 消息
  // 如果 preload 未暴露此方法，降级为静默不订阅（不影响 30 秒轮询兜底）
  try {
    return await (window.electronAPI as any).scriptAdapterBatchSubscribe?.(batchId)
      ?? { success: false, error: 'not_exposed' };
  } catch {
    return { success: false };
  }
}
```

同时在 `preload.ts` 的 `scriptAdapterBatch` 对象中追加：
```typescript
subscribe: (batchId: string) =>
  ipcRenderer.invoke('script-adapter-batch-subscribe', batchId),
```

并在 `electron/main.ts` 中注册对应 IPC：
```typescript
ipcMain.handle('script-adapter-batch-subscribe', (_event, batchId: string) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.subscribe', { batchId });
});
```

**验收**：`npx tsc --noEmit` 通过；`npx vitest run` 通过。

---

### P0-1 整体验收

1. 启动批次（Mock 模式，5 章）
2. 等待第 1 章开始执行
3. 关闭 WebSocket 连接（可在 Electron DevTools 的 Network 中 offline，或重启 Gateway 不重启前端）
4. 恢复连接
5. 前端能收到后续 `chapter_completed` 事件，UI 进度正常推进
6. `node --check` + `npx tsc --noEmit` 全部通过

---

## P0-2：单次执行持久化（修复 Gateway 重启后记录消失问题）

### 问题

`runRegistry.js` 是纯内存 `Map`，Gateway 重启后所有单次执行记录消失。对于需要数小时的长任务，这意味着状态完全不可追溯。

### 目标

将 `runRegistry` 改为内存 + SQLite 双写模式；Gateway 重启时将 running 状态的记录改为 interrupted，支持前端查询历史。

---

### TASK-P0-2-A：persistence.js 新增 single_runs 表

**文件**：`oct-gateway/script_adapter/persistence.js`

在 `ensureSchema()` 函数的 `database.exec(...)` SQL 中追加：

```sql
CREATE TABLE IF NOT EXISTS single_runs (
  task_id        TEXT PRIMARY KEY,
  plan_id        TEXT,
  task_title     TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  sheet          TEXT,
  error          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  completed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_single_runs_status
  ON single_runs(status, created_at DESC);
```

然后在 `persistence.js` 中追加以下函数（放在现有函数之后）：

```javascript
// ── single_runs CRUD ─────────────────────────────────────────

function createSingleRun({ taskId, planId, taskTitle }) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT OR IGNORE INTO single_runs
      (task_id, plan_id, task_title, status, created_at, updated_at)
    VALUES (@taskId, @planId, @taskTitle, 'running', @now, @now)
  `).run({ taskId, planId: planId || null, taskTitle: taskTitle || '', now });
  return getSingleRun(taskId);
}

function updateSingleRun(taskId, patch) {
  const now = new Date().toISOString();
  const updates = [];
  const params = { taskId, now };

  if (patch.status !== undefined)      { updates.push('status = @status');           params.status = patch.status; }
  if (patch.sheet !== undefined)       { updates.push('sheet = @sheet');             params.sheet = typeof patch.sheet === 'string' ? patch.sheet : JSON.stringify(patch.sheet); }
  if (patch.error !== undefined)       { updates.push('error = @error');             params.error = patch.error; }
  if (patch.completedAt !== undefined) { updates.push('completed_at = @completedAt'); params.completedAt = patch.completedAt; }
  if (patch.planId !== undefined)      { updates.push('plan_id = @planId');          params.planId = patch.planId; }

  if (updates.length === 0) return getSingleRun(taskId);
  updates.push('updated_at = @now');
  getDb().prepare(`UPDATE single_runs SET ${updates.join(', ')} WHERE task_id = @taskId`).run(params);
  return getSingleRun(taskId);
}

function getSingleRun(taskId) {
  const row = getDb().prepare('SELECT * FROM single_runs WHERE task_id = ?').get(taskId);
  if (!row) return null;
  return {
    taskId: row.task_id,
    planId: row.plan_id,
    taskTitle: row.task_title,
    status: row.status,
    sheet: row.sheet ? (() => { try { return JSON.parse(row.sheet); } catch { return null; } })() : null,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function listSingleRuns(limit = 20, offset = 0) {
  const rows = getDb().prepare(`
    SELECT * FROM single_runs ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
  return rows.map((row) => getSingleRun(row.task_id));
}

/** Gateway 启动时调用：将 running 状态的 run 改为 interrupted */
function recoverInterruptedRuns() {
  getDb().prepare(`
    UPDATE single_runs SET status = 'interrupted', updated_at = ?
    WHERE status IN ('running', 'pending')
  `).run(new Date().toISOString());
}

module.exports = {
  // ... 现有导出保留
  ensureSchema,
  createBatch, updateBatch, getBatch, listBatches, deleteBatch,
  findNextPendingChapter, getChapterRun, updateChapterRun, rerunChapter, listRunningBatches,
  // 新增
  createSingleRun, updateSingleRun, getSingleRun, listSingleRuns, recoverInterruptedRuns,
};
```

**验收**：`node --check oct-gateway/script_adapter/persistence.js` 通过。

---

### TASK-P0-2-B：runRegistry.js 改为双写模式

**文件**：`oct-gateway/script_adapter/runRegistry.js`

**完整替换**为：

```javascript
'use strict';

/**
 * runRegistry.js — 单次执行运行注册表
 *
 * 内存热缓存 + SQLite 持久化双写。
 * Gateway 重启后，历史记录可从 SQLite 查询（状态为 interrupted）。
 */

const persistence = require('./persistence');

/** @type {Map<string, object>} 内存热缓存 */
const cache = new Map();

function registerRun(record) {
  const now = new Date().toISOString();
  const normalized = {
    taskId: record.taskId,
    planId: record.planId || null,
    taskTitle: record.taskTitle || '',
    status: record.status || 'running',
    sheet: record.sheet || null,
    abortController: record.abortController || null,
    createdAt: record.createdAt || now,
    updatedAt: now,
    completedAt: null,
    error: null,
  };
  cache.set(normalized.taskId, normalized);
  // 写入 SQLite（不写 abortController，不可序列化）
  persistence.createSingleRun({
    taskId: normalized.taskId,
    planId: normalized.planId,
    taskTitle: normalized.taskTitle,
  });
  return _normalize(normalized);
}

function getRun(taskId) {
  // 优先从内存缓存读（含 abortController）
  const cached = cache.get(String(taskId || ''));
  if (cached) return _normalize(cached);
  // fallback 到 SQLite（重启后恢复场景）
  return persistence.getSingleRun(String(taskId || ''));
}

function updateRun(taskId, patch) {
  const record = cache.get(String(taskId || ''));
  if (record) {
    Object.assign(record, patch, { updatedAt: new Date().toISOString() });
    cache.set(record.taskId, record);
  }
  // 同步写 SQLite
  persistence.updateSingleRun(String(taskId || ''), patch);
  return getRun(taskId);
}

function cancelRun(taskId, reason = 'cancelled_by_user') {
  const record = cache.get(String(taskId || ''));
  if (!record) {
    const persisted = persistence.getSingleRun(String(taskId || ''));
    if (!persisted) return { success: false, error: 'run_not_found', taskId: String(taskId || '') };
    return { success: false, error: `run_already_${persisted.status}`, taskId: persisted.taskId };
  }

  if (['completed', 'failed', 'cancelled', 'interrupted'].includes(record.status)) {
    return { success: false, error: `run_already_${record.status}`, taskId: record.taskId };
  }

  try { record.abortController?.abort?.(reason); } catch {}

  const now = new Date().toISOString();
  Object.assign(record, { status: 'cancelled', completedAt: now, error: reason, updatedAt: now });
  cache.set(record.taskId, record);
  persistence.updateSingleRun(record.taskId, { status: 'cancelled', completedAt: now, error: reason });

  return { success: true, taskId: record.taskId, status: 'cancelled', run: _normalize(record) };
}

function listRuns(limit = 20) {
  // 合并内存（进行中）和 SQLite（历史）
  const inMemory = [...cache.values()].filter((r) => r.status === 'running' || r.status === 'pending');
  const historical = persistence.listSingleRuns(limit);
  const inMemoryIds = new Set(inMemory.map((r) => r.taskId));
  const merged = [
    ...inMemory.map(_normalize),
    ...historical.filter((r) => !inMemoryIds.has(r.taskId)),
  ];
  merged.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return merged.slice(0, limit);
}

function _normalize(record) {
  return {
    taskId: record.taskId,
    planId: record.planId,
    taskTitle: record.taskTitle,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    error: record.error,
    // sheet 只在 SQLite 读取时返回，内存版不附带（避免大对象污染）
  };
}

module.exports = { registerRun, getRun, updateRun, cancelRun, listRuns };
```

**验收**：`node --check oct-gateway/script_adapter/runRegistry.js` 通过。

---

### TASK-P0-2-C：Gateway 启动时执行 recoverInterruptedRuns

**文件**：`oct-gateway/index.js` 或 `oct-gateway/script_adapter/batchOrchestrator.js` 顶部

在已有的 `persistence.ensureSchema()` 调用之后追加：

```javascript
persistence.recoverInterruptedRuns();
```

注意 `batchOrchestrator.js` 顶部已有 `persistence.ensureSchema()` 调用，在其后追加即可。

**验收**：重启 Gateway，查看 SQLite `single_runs` 表中 running 的记录是否变为 interrupted。

---

### TASK-P0-2-D：mock_execution.js 每个 Agent 完成时更新 sheet

**文件**：`oct-gateway/script_adapter/agentRunner.js`

在 `emit('artifact_created', ...)` 调用之后，追加对 runRegistry 的更新：

```javascript
const runRegistry = require('./runRegistry');

// 在 artifact_created 事件之后追加（约 66 行附近）：
// 更新持久化 sheet（不阻塞主流程）
const runId = currentSheet.taskId;
if (runId) {
  try {
    runRegistry.updateRun(runId, { sheet: currentSheet });
  } catch {}
}
```

注意：只在 taskId 存在时写，不影响批次执行路径（批次走 persistence.updateChapterRun）。

**验收**：执行单次 run → 强制结束 Gateway 进程 → 重启 Gateway → 调用 `listScriptAdapterRuns` → 返回该记录，status 为 interrupted。

---

### P0-2 整体验收

1. 执行单次 run（任意章节，Mock 模式）
2. 等待第 1 个 Agent 完成
3. 强制停止 Gateway（kill 进程）
4. 重启 Gateway
5. 前端或 WebSocket 调用 `scriptAdapter.run.list` → 应看到刚才的 run，status 为 `interrupted`
6. `npx tsc --noEmit` + `npx vitest run` 通过

---

## P0-3：ReviewGate 真实阻塞（修复人工审核节点是假的问题）

### 问题

`agentRunner.js` 检测到 ReviewGate 时，等 500ms 后自动 approve，不阻塞执行。  
前端 UI 上的"需要你复核"是展示性文案，实际上点不点都一样。

### 目标

Gate 到达后真正暂停执行，将章状态设为 `awaiting_review`，等待前端发来批准指令后才继续。

---

### TASK-P0-3-A：persistence.js 新增 gate_decisions 表 + 方法

**文件**：`oct-gateway/script_adapter/persistence.js`

在 `ensureSchema()` SQL 中追加：

```sql
CREATE TABLE IF NOT EXISTS gate_decisions (
  gate_id         TEXT PRIMARY KEY,
  batch_id        TEXT NOT NULL,
  chapter_run_id  TEXT NOT NULL,
  gate_type       TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  reviewer_note   TEXT,
  created_at      TEXT NOT NULL,
  decided_at      TEXT,
  FOREIGN KEY (chapter_run_id) REFERENCES chapter_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gate_decisions_run
  ON gate_decisions(chapter_run_id, status);
```

追加函数：

```javascript
function createGateDecision({ gateId, batchId, chapterRunId, gateType }) {
  const now = new Date().toISOString();
  getDb().prepare(`
    INSERT OR IGNORE INTO gate_decisions
      (gate_id, batch_id, chapter_run_id, gate_type, status, created_at)
    VALUES (@gateId, @batchId, @chapterRunId, @gateType, 'pending', @now)
  `).run({ gateId, batchId, chapterRunId, gateType: gateType || 'review', now });
}

function resolveGateDecision(gateId, { status, reviewerNote }) {
  const now = new Date().toISOString();
  getDb().prepare(`
    UPDATE gate_decisions
    SET status = @status, reviewer_note = @reviewerNote, decided_at = @now
    WHERE gate_id = @gateId
  `).run({ gateId, status, reviewerNote: reviewerNote || null, now });
}

function getGateDecision(gateId) {
  return getDb().prepare('SELECT * FROM gate_decisions WHERE gate_id = ?').get(gateId) || null;
}

function getPendingGatesForBatch(batchId) {
  return getDb().prepare(`
    SELECT * FROM gate_decisions WHERE batch_id = ? AND status = 'pending'
  `).all(batchId);
}
```

同时更新 `module.exports` 把这四个函数加进去。

**验收**：`node --check oct-gateway/script_adapter/persistence.js` 通过。

---

### TASK-P0-3-B：chapter_runs 表新增 pending_gate 字段

**文件**：`oct-gateway/script_adapter/persistence.js` — `ensureSchema()` SQL

在 `chapter_runs` 建表语句中追加两列（若表已存在，用 ALTER TABLE）：

```javascript
// ensureSchema 中，在 CREATE TABLE IF NOT EXISTS chapter_runs 之后追加：
try {
  getDb().exec('ALTER TABLE chapter_runs ADD COLUMN pending_gate_id TEXT');
} catch {}
try {
  getDb().exec('ALTER TABLE chapter_runs ADD COLUMN pending_gate_type TEXT');
} catch {}
```

（用 try/catch 是因为 ALTER TABLE IF NOT EXISTS 在 SQLite 中不支持，这是标准做法）

同时修改 `updateChapterRun` 函数，支持 `pending_gate_id` 和 `pending_gate_type` 字段更新（同其他字段处理方式一致）。

---

### TASK-P0-3-C：batchOrchestrator.js — gate 到达时真正暂停

**文件**：`oct-gateway/script_adapter/batchOrchestrator.js`

在 `executeChapter` 函数中，当前 `runSingleScriptAdapterChapter` 完成后有 `applyLockedVoiceRegistry` 等后处理逻辑，最后会调用 `emit('chapter_completed', ...)`。

**目前没有 gate 检查**。在 `emit('chapter_completed', ...)` 之前，增加 gate 检查逻辑：

```javascript
// 在 persistence.updateChapterRun({ status: 'completed', ... }) 之后
// emit('chapter_completed') 之前插入：

// ── 检查 ReviewGate ──────────────────────────────────────────
const pendingGate = findPendingGateAfterAgent(normalizedSheet);
if (pendingGate) {
  persistence.createGateDecision({
    gateId: pendingGate.gateId,
    batchId: batch.id,
    chapterRunId: chapterRun.id,
    gateType: pendingGate.gateType,
  });
  persistence.updateChapterRun(chapterRun.id, {
    status: 'awaiting_review',
    pending_gate_id: pendingGate.gateId,
    pending_gate_type: pendingGate.gateType,
  });
  persistence.updateBatch(batch.id, {
    // 不计入 completedChapters，等待复核
  });
  emit('gate_reached', {
    chapterIndex,
    runId: chapterRun.id,
    gate: pendingGate,
  });
  return; // 不继续 emit chapter_completed，等待用户批准
}
// ── 无 gate，正常完成 ────────────────────────────────────────
```

在文件中新增辅助函数：

```javascript
/**
 * 从 sheet 的 gates 中找出状态为 pending 且对应质检类型的 gate。
 * MVP 阶段只拦截 quality_review gate。
 */
function findPendingGateAfterAgent(sheet) {
  if (!sheet || !Array.isArray(sheet.gates)) return null;
  return sheet.gates.find(
    (gate) => gate.status === 'pending' && gate.gateType === 'quality_review'
  ) || null;
}
```

同时修改 `findNextPendingChapter`（persistence.js 中）：确保 `awaiting_review` 状态的章节不被当作下一个待执行章节：

```javascript
// persistence.findNextPendingChapter 的 SQL 条件：
// WHERE status = 'pending'   →   WHERE status = 'pending'  （awaiting_review 不在此列）
// 如果已有此函数，确认 SQL 只查 status = 'pending' 即可，无需修改
```

**验收**：`node --check oct-gateway/script_adapter/batchOrchestrator.js` 通过。

---

### TASK-P0-3-D：index.js 新增 approveGate / rejectGate 消息处理

**文件**：`oct-gateway/index.js`

在 `handleTransportMessage` 函数的 `scriptAdapter.batch.*` 处理块末尾追加：

```javascript
// 人工批准 ReviewGate
if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.approveGate') {
  const { batchId, gateId, reviewerNote } = msg.params || {};
  if (!batchId || !gateId) {
    connection.send(JSON.stringify({ type: 'res', id: msg.id, ok: false, method: msg.method,
      error: { message: 'batchId and gateId required' } }));
    return true;
  }
  // 更新 gate 状态为 approved
  persistence.resolveGateDecision(String(gateId), { status: 'approved', reviewerNote });
  // 找到对应 chapter_run，将其状态改回 pending 触发继续执行
  const snapshot = persistence.getBatch(String(batchId));
  if (snapshot) {
    const run = snapshot.chapterRuns.find((r) => r.pendingGateId === gateId);
    if (run) {
      persistence.updateChapterRun(run.id, {
        status: 'pending',
        pending_gate_id: null,
        pending_gate_type: null,
      });
      // 如果批次已暂停，重新触发执行循环
      if (!activeBatches.has(String(batchId))) {
        persistence.updateBatch(String(batchId), { status: 'running', completedAt: null });
        void runBatchLoop(String(batchId), connection, log);
      }
    }
  }
  connection.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, method: msg.method,
    payload: { approved: true, gateId } }));
  return true;
}

// 人工拒绝 ReviewGate（章节标记为 failed，需用户手动 rerun）
if (msg?.type === 'req' && msg?.method === 'scriptAdapter.batch.rejectGate') {
  const { batchId, gateId, reviewerNote } = msg.params || {};
  if (!batchId || !gateId) {
    connection.send(JSON.stringify({ type: 'res', id: msg.id, ok: false, method: msg.method,
      error: { message: 'batchId and gateId required' } }));
    return true;
  }
  persistence.resolveGateDecision(String(gateId), { status: 'rejected', reviewerNote });
  const snapshot = persistence.getBatch(String(batchId));
  if (snapshot) {
    const run = snapshot.chapterRuns.find((r) => r.pendingGateId === gateId);
    if (run) {
      persistence.updateChapterRun(run.id, {
        status: 'failed',
        error_message: `Gate rejected: ${reviewerNote || '人工拒绝'}`,
        pending_gate_id: null,
        completed_at: new Date().toISOString(),
      });
    }
  }
  connection.send(JSON.stringify({ type: 'res', id: msg.id, ok: true, method: msg.method,
    payload: { rejected: true, gateId } }));
  return true;
}
```

注意：`activeBatches` 和 `runBatchLoop` 需要在 index.js 中可访问（当前 batchOrchestrator 导出的函数需要调整，或在 index.js 中直接调用 `rerunChapter` 触发 batchLoop 重启）。

如果 `activeBatches` 不在 index.js 可见范围，改为调用：
```javascript
rerunScriptAdapterBatchChapter({ batchId, chapterIndex: run.chapterIndex }, connection, log);
```
效果等价。

**验收**：`node --check oct-gateway/index.js` 通过。

---

### TASK-P0-3-E：前端 — 暴露 approveGate / rejectGate

**文件 1**：`electron/preload.ts`

在 `scriptAdapterBatch` 对象中追加：
```typescript
approveGate: (batchId: string, gateId: string, reviewerNote?: string) =>
  ipcRenderer.invoke('script-adapter-batch-approve-gate', { batchId, gateId, reviewerNote }),
rejectGate: (batchId: string, gateId: string, reviewerNote?: string) =>
  ipcRenderer.invoke('script-adapter-batch-reject-gate', { batchId, gateId, reviewerNote }),
```

**文件 2**：`electron/main.ts`

注册 IPC：
```typescript
ipcMain.handle('script-adapter-batch-approve-gate', (_event, payload) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.approveGate', payload);
});
ipcMain.handle('script-adapter-batch-reject-gate', (_event, payload) => {
  return sendScriptAdapterRunRequest('scriptAdapter.batch.rejectGate', payload);
});
```

**文件 3**：`src/modules/script-adapter/services/gatewayBatch.ts`

追加：
```typescript
export async function approveGatewayGate(batchId: string, gateId: string, reviewerNote?: string) {
  if (!window.electronAPI?.scriptAdapterBatch?.approveGate) {
    return { success: false, error: '当前环境未暴露批准入口' };
  }
  return window.electronAPI.scriptAdapterBatch.approveGate(batchId, gateId, reviewerNote);
}

export async function rejectGatewayGate(batchId: string, gateId: string, reviewerNote?: string) {
  if (!window.electronAPI?.scriptAdapterBatch?.rejectGate) {
    return { success: false, error: '当前环境未暴露拒绝入口' };
  }
  return window.electronAPI.scriptAdapterBatch.rejectGate(batchId, gateId, reviewerNote);
}
```

**验收**：`npx tsc --noEmit` 通过。

---

### TASK-P0-3-F：前端 UI — awaiting_review 状态展示

**文件**：`src/modules/script-adapter/ui/Workbench/BatchProgressView.tsx`

找到展示 `ChapterRunRecord` 状态的地方，增加 `awaiting_review` 分支：

```tsx
// 在章节状态展示逻辑中追加
{run.status === 'awaiting_review' && (
  <div className={styles.gateReviewBlock}>
    <strong>质检完成 — 等待你复核</strong>
    <p>质检 Agent 已发现问题，请确认后继续制作。</p>
    <div className={styles.gateReviewActions}>
      <button
        type="button"
        className={styles.confirmStartButton}
        onClick={() => void approveGatewayGate(batch.id, run.pendingGateId!, '').then(onRefresh)}
      >
        批准，继续制作
      </button>
      <button
        type="button"
        className={styles.ghostButton}
        onClick={() => void rejectGatewayGate(batch.id, run.pendingGateId!, '需要重做').then(onRefresh)}
      >
        拒绝，重新执行此章
      </button>
    </div>
  </div>
)}
```

注意：`run.pendingGateId` 需要从 `ChapterRunRecord` 类型中补充该字段（见下）。

**文件**：`src/modules/script-adapter/types/batch.ts`

在 `ChapterRunRecord` 接口中追加：
```typescript
pendingGateId?: string | null;
pendingGateType?: string | null;
```

**验收**：`npx tsc --noEmit` 通过；UI 显示 `awaiting_review` 章节的复核按钮。

---

### P0-3 整体验收

1. 启动批次（Mock 模式，至少 1 章）
2. 等待质检 Agent（`reviewer.production_quality@1.0`）完成
3. 确认批次**暂停执行**，前端显示"等待你复核"和两个按钮
4. 点击「批准，继续制作」
5. 确认批次继续执行，前端显示打包 Agent 开始
6. `node --check` + `npx tsc --noEmit` + `npx vitest run` 全部通过

---

## P0 阶段整体完成标准

- [ ] P0-1：断网重连后，批次进度事件正常恢复推送
- [ ] P0-2：Gateway 重启后，`listScriptAdapterRuns` 返回历史记录，status 为 interrupted
- [ ] P0-3：质检完成后批次暂停，前端显示复核按钮，批准后继续执行
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npx vitest run` 零失败
- [ ] `node --check oct-gateway/index.js` 通过
- [ ] `node --check oct-gateway/script_adapter/*.js` 全部通过
- [ ] 补写 `docs/04_content_workbench/changelog/` 变更记录

---

## 注意事项

1. **执行顺序**：P0-1 → P0-2 → P0-3，不要并行，每个完成后跑一次验证
2. **不动的文件**：`src/core/turnFSM*`、`src/core/streamRouter*`、`src/hooks/useMessages.ts`
3. **agentRunner.js 的两个同名文件**：
   - `oct-gateway/agents/agent_runner.js` — 通用 Agent 引擎（不动）
   - `oct-gateway/script_adapter/agentRunner.js` — 内容工作台 mock pipeline（TASK-P0-2-D 修改此文件）
4. **SQLite ALTER TABLE**：用 try/catch 包裹，确保已存在的库不报错
5. **回滚方案**：每个 TASK 的新文件单独删除即可回滚；修改文件用 git revert
