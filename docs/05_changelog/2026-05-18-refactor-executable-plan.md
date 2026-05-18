# 2026-05-18 Refactor Executable Plan

## What Changed

- 新增一份通用重构执行计划
- 将前一轮静态审查得到的重构建议收敛为 5 个可执行阶段
- 约定计划分支名与阶段 tag 规则，方便后续逐阶段推进

## Plan Branch

- `refactor/executable-stabilization-plan-2026-05-18`

## Phase Tags

- `refactor-plan-phase0-start-2026-05-18`
- `refactor-plan-phase1-gateway-capability-core`
- `refactor-plan-phase2-config-split`
- `refactor-plan-phase3-chat-state-split`
- `refactor-plan-phase4-settings-schema`
- `refactor-plan-phase5-script-adapter-wizard-state`

## Why

- 当前仓库已经出现多处单文件多职责问题
- 先把重构顺序、边界和验收条件写清楚，比直接开改更稳
- 分支与阶段 tag 绑定后，后续每一步都有清晰落点
