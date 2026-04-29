# 内容制作工作台 — 文档中心

> 模块代号：`script-adapter`  
> 长期目标：百万字小说 → 有声书 / 广播剧全自动生产流水线  
> 文档负责人：Zilong  
> Last Updated: 2026-04-29

---

## 目录结构

```
docs/04_content_workbench/
  execution/     执行计划（总计划 + 各阶段 Cursor 任务包）
  specs/         技术规格（数据结构、状态机、接口协议）
  changelog/     变更记录（每次改动后补写）
  _archive/      历史审计报告、评审快照
```

## 当前状态

| 阶段 | 状态 | 计划文档 |
|------|------|----------|
| Phase 0 — P0 紧急修复 | 🔴 待执行 | [execution/P0-cursor-tasks.md](execution/P0-cursor-tasks.md) |
| Phase 1 — 结构稳定 | ⬜ 未开始 | execution/P1-cursor-tasks.md（待写） |
| Phase 2 — Agent Queue / 审核闭环 | ⬜ 未开始 | execution/P2-cursor-tasks.md（待写） |
| Phase 3 — 生产级工作流 | ⬜ 未开始 | execution/P3-cursor-tasks.md（待写） |

## 快速入口

- **总体计划**：[execution/MASTER_PLAN.md](execution/MASTER_PLAN.md)
- **P0 立即执行**：[execution/P0-cursor-tasks.md](execution/P0-cursor-tasks.md)
- **核心数据结构**：[specs/data-models.md](specs/data-models.md)（待写）
- **原始审计报告**：[_archive/content-workbench-audit-2026-04-29.md](../_archive/content-workbench-audit-2026-04-29.md)
