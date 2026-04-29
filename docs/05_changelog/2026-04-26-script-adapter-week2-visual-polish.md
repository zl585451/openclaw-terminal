# 2026-04-26 Script Adapter Week 2 Visual Polish

## Summary

完成内容创作工作台执行视图的 Week 2 视觉收尾，让 Gateway mock / 前端 mock 执行链路更适合演示。

## Changes

1. 执行队列中按 `ReviewGate.afterAgentId` 插入闸门 banner，支持 pending / approved / rejected 三种状态。
2. 执行页头部新增总耗时计时器，running 时每秒刷新，完成或失败后定格。
3. failed 状态下显示重试按钮，点击后清空当前执行单并重新走确认开工路径。
4. 质检报告 `severity` 改为 P0/P1/P2 badge。
5. 角色音标注 `category` 改为中文 chip。

## CSS Classes

1. `gateBanner`
2. `gateBanner--pending`
3. `gateBanner--approved`
4. `gateBanner--rejected`
5. `executionElapsed`
6. `severityBadge`
7. `severityBadge--p0`
8. `severityBadge--p1`
9. `severityBadge--p2`
10. `roleCategory`
11. `roleCategory--narrator`
12. `roleCategory--main`
13. `roleCategory--support`
14. `roleCategory--unresolved`
15. `roleCategory--sfx`

## Known Limits

1. 当前执行产物仍是 mock 数据，真实 Agent 接入留给后续阶段。
2. Gateway 路径的取消执行尚未接入 `scriptAdapter.run.cancel`，当前取消按钮只完整覆盖前端 mock 执行器。
3. 重试会重新启动整条执行链路，不做单 Agent 局部重跑。
