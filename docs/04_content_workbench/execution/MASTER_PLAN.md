# 内容制作工作台 — 总体执行计划

> 版本：v1.0  
> 建立日期：2026-04-29  
> 来源：架构接手审计（见 `_archive/content-workbench-audit-2026-04-29.md`）  
> 原则：不推倒重来 · 不引入大型框架 · 每步可回滚 · 每步有验收标准

---

## 一、系统现状一句话判断

骨架可用，有三处不动就无法做长任务的结构洞，加上一批维护债。真实 Agent 执行链路已通，数据结构设计合理，可以在现有基础上分阶段修复。

---

## 二、问题优先级总表

### P0 — 不修无法推进（立即执行）

| 编号 | 问题 | 影响 |
|------|------|------|
| P0-1 | 批次长跑期间断网，WebSocket connection 过期，所有进度事件静默丢失 | 长批次不可用 |
| P0-2 | 单次执行用内存 Map 存状态，Gateway 重启后记录全部消失 | 单次不可恢复 |
| P0-3 | ReviewGate 等 500ms 自动通过，人工审核节点是假的 | 质检闭环不存在 |

### P1 — 维护债（Phase 1 内解决）

| 编号 | 问题 |
|------|------|
| P1-1 | WorkbenchView.tsx 约 950 行，严重超出 500 行架构约定 |
| P1-2 | actions.ts 有 4 个函数是 console.log 占位（rejectArtifact 等）|
| P1-3 | 命名混乱：mock_execution / startMockScriptAdapterRun 实际支持真实 Agent |
| P1-4 | 跨章 VoiceRegistry 累积不对前端可见，用户无法中途修正 |
| P1-5 | 两套独立任务队列（task_queue.js vs script_adapter/），未来无法统一 |

### P2 — 体验问题（有余力时处理）

| 编号 | 问题 |
|------|------|
| P2-1 | TASK_STEPS 在 WorkbenchView 中硬编码，不由真实 pipeline stages 驱动 |
| P2-2 | batchBudget.ts 使用固定系数，不连接真实 token 计费 |
| P2-3 | Library 服务（:8001）离线无友好降级 |
| P2-4 | 单次执行产物页面刷新后消失 |
| P2-5 | 30 秒轮询间隔过长，批次进度滞后 |

---

## 三、分阶段执行路线

### Phase 0 — P0 紧急修复（目标：2-3 天）

**目标**：让长批次可用、让状态可恢复、让 ReviewGate 真正阻塞  
**约束**：不改 Agent 执行逻辑；不破坏现有 mock 路径；每个任务独立可回滚  
**执行文档**：[P0-cursor-tasks.md](P0-cursor-tasks.md)

涉及的关键改动：

```
新增
  oct-gateway/script_adapter/connectionRegistry.js   ← 批次事件广播订阅

修改
  oct-gateway/script_adapter/eventEmitter.js         ← broadcast 替换 connection.send
  oct-gateway/script_adapter/batchOrchestrator.js    ← 移除 connection 参数
  oct-gateway/script_adapter/persistence.js          ← 新增 single_runs 表 + gate_decisions 表
  oct-gateway/script_adapter/runRegistry.js          ← 内存 + SQLite 双写
  oct-gateway/script_adapter/agentRunner.js          ← gate 到达时真正暂停
  oct-gateway/index.js                               ← subscribe / unsubscribe / approveGate 消息处理
  前端 gatewayBatch.ts                               ← approveGate / rejectGate 函数
  前端 BatchProgressView.tsx                         ← awaiting_review 状态 + 复核按钮
```

---

### Phase 1 — 结构稳定（目标：完成 P0 后约 1 周）

**目标**：消除维护债，让代码结构匹配未来扩展需求  
**执行文档**：P1-cursor-tasks.md（待写）

主要任务：

| 任务 | 涉及文件 |
|------|----------|
| 拆分 WorkbenchView.tsx | → BatchSetupPanel / BatchExecutionPanel / StartConfirmDialog |
| 重命名 mock_execution.js | → chapterPipeline.js，函数去掉 mock 前缀 |
| 实现 rejectArtifact | actions.ts + 前端提示 + gate 状态更新 |
| 暴露 VoiceRegistry 编辑 | BatchProgressView 增加折叠区 |
| 移除 useMock: true | gatewayExecution.ts 透传 realAgents 字段 |

---

### Phase 2 — Agent Queue / 审核闭环（目标：Phase 1 后约 2 周）

**目标**：真正的任务执行基础设施，可支撑百章级别工作流  
**执行文档**：P2-cursor-tasks.md（待写）

核心新增能力：

- **显式状态机**：`stateMachine.js`，定义 ChapterRun / BatchJob 合法转换
- **产物持久化**：单次 run 的 sheet 写入 SQLite，前端刷新可恢复
- **自动重试策略**：章级 `max_attempts: 3`，失败后等待 backoff 重跑
- **并发批次**（可配置）：`concurrency: 1` 默认串行，生产可调至 3

---

### Phase 3 — 生产级工作流（目标：Phase 2 后约 4 周）

**目标**：支撑百万字小说全流程；章间上下文传递；人工复核工作台；多格式导出  
**执行文档**：P3-cursor-tasks.md（待写）

核心新增能力：

- **章间上下文系统**：plotLock（剧情锁定）/ styleLock（风格画像）跨章传递
- **人工复核工作台**：ChapterReviewPanel（inline 批注 + 批准/拒绝）
- **VoiceRegistryEditor**：跨章角色音统一编辑
- **全书导出**：合并所有章的 DOCX、Excel 角色音表、PDF 质检报告
- **并发批次**：Promise pool，最大并发 N 章

---

## 四、不变原则

1. **不推倒重来**：现有 BatchOrchestrator / 5 个 Agent / 类型系统全部保留
2. **不引入大框架**：不引入 BullMQ / XState / tRPC；自制状态机约 50 行足够
3. **每步可回滚**：新增文件独立 PR；修改文件在函数级别可切换
4. **每步必须通测试**：
   ```bash
   npx tsc --noEmit
   npx vitest run
   node --check oct-gateway/index.js
   ```
5. **改后必须补文档**：changelog + 对应 specs

---

## 五、具备长期价值的现有模块（不要动）

| 模块 | 价值 | 位置 |
|------|------|------|
| TaskExecutionSheet / BatchJob / ArtifactEnvelope 类型系统 | 设计干净，可直接复用 | src/modules/script-adapter/types/ |
| BatchOrchestrator 骨架 | SQLite持久化、cancel、rerun、voiceRegistry累积 | oct-gateway/script_adapter/batchOrchestrator.js |
| 5 个真实 Agent 实现 | 有分块处理、JSON容错、降级逻辑 | oct-gateway/script_adapter/agents/ |
| Zustand store + actions 分离 | 结构清晰，易扩展 | src/modules/script-adapter/store/ |
| connectionRegistry（Phase 0 新增后） | 批次事件广播基础设施 | oct-gateway/script_adapter/connectionRegistry.js |

---

## 六、变更记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-04-29 | v1.0 | 初始版本，来自架构接手审计 |
