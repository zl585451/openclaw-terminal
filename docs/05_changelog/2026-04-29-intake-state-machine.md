# 2026-04-29 Intake 状态机真实化

## 背景

任务创建第一个“确认素材”页面右侧原本由前端 `runMockTaskIntake` 和 `MOCK_INTAKE_STEPS` 驱动，容易让用户误以为后台 Agent 已真实执行。

## 改动

- 新增 `scriptAdapter.intake.start` Gateway 协议，由 `oct-gateway/script_adapter/intakeOrchestrator.js` 执行素材摄入状态机。
- Electron main/preload 增加 `startScriptAdapterIntake` IPC 桥接，并允许 `scriptAdapter.intake.*` 响应回到前端。
- 前端第一个确认页面改为先读取真实章节文本，再向 Gateway 发起 intake。
- 右侧后台细节改为展示 Gateway 返回的 step 状态、执行模式、executor、耗时和失败信息。
- 当前 intake step 只标记为 `system/rule`，不再把规则处理伪装成 Agent。

## 验证

- `node --check oct-gateway/script_adapter/intakeOrchestrator.js`
- `node --check oct-gateway/index.js`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
