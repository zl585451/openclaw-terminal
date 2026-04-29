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

