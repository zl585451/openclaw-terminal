# P0 批次可靠性与人工复核

## 本次收口

1. 批次执行事件支持断线重连后的自动恢复推送。
2. 单次执行记录改为 SQLite 持久化，Gateway 重启后历史可追溯。
3. `quality_review` Gate 不再是假提示，章节会进入 `awaiting_review`，批准后继续跑打包阶段。

## 受影响模块

1. `oct-gateway/script_adapter/*`
2. `oct-gateway/index.js`
3. `oct-gateway/transport/ws.js`
4. `electron/main.ts`
5. `electron/preload.ts`
6. `src/modules/script-adapter/services/gatewayBatch.ts`
7. `src/modules/script-adapter/ui/Workbench/BatchProgressView.tsx`
