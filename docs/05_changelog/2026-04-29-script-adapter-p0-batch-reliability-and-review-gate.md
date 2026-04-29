# 2026-04-29 Script Adapter P0 批次可靠性与 ReviewGate

## 变更

1. 批次事件广播从“单连接直推”改为 `connectionRegistry` 订阅表广播，Gateway 新连接认证后会自动补订阅运行中批次。
2. Electron 与前端新增 `scriptAdapter.batch.subscribe`、`approveGate`、`rejectGate` 通道，工作台可在 `awaiting_review` 时展示人工复核按钮。
3. `runRegistry` 改为内存 + SQLite 双写，新增 `single_runs` 表；Gateway 重启后会把未结束的单次执行恢复成 `interrupted`。
4. 批次侧新增 `gate_decisions` 表与 `chapter_runs.pending_gate_*` 字段，`quality_review` Gate 现在会真实暂停章节并等待批准后继续。

## 验证

1. `node --check oct-gateway/index.js`
2. `node --check oct-gateway/script_adapter/connectionRegistry.js`
3. `node --check oct-gateway/script_adapter/eventEmitter.js`
4. `node --check oct-gateway/script_adapter/batchOrchestrator.js`
5. `node --check oct-gateway/script_adapter/persistence.js`
6. `node --check oct-gateway/script_adapter/runRegistry.js`
7. `node --check oct-gateway/script_adapter/agentRunner.js`
8. `npx tsc --noEmit`
9. `npx vitest run`
