# OCT v2 迁移状态

> **上次更新**：2026-03-27  
> **更新人**：Zilong

## 当前阶段

```
Phase: 0（准备）
状态: 未开始
```

## 架构蓝图版本

v1.0 (2026-03-27) — 见 architecture-blueprint.md

## Git 标签记录

| 标签 | 日期 | 说明 |
|------|------|------|
| v2-phase0-baseline | 待打 | Phase 0 基线 |

---

## Phase 0：准备工作

- [ ] 0.1 创建 `docs/03_migration/` 目录和状态文件
- [ ] 0.2 备份 `ChatTab.tsx` → `ChatTab.v1.tsx`
- [ ] 0.3 创建 `src/core/` 目录
- [ ] 0.4 创建核心类型定义 `src/core/types.ts`
- [ ] 0.5 Git 完成标签 `v2-phase0-done`

**验收结果**：

**遇到的问题**：

---

## Phase 1：ContentBlock 数据模型

- [ ] 1.1 实现 `src/core/blockRouter.ts`
- [ ] 1.2 Vitest 单元测试（15 种场景）
- [ ] 1.3 适配层桥接现有 segments
- [ ] 1.4 验收：所有现有功能不变，测试全通过

**验收结果**：

**遇到的问题**：

---

## Phase 2：TurnFSM 状态机

- [ ] 2.1 实现 `src/core/turnFSM.ts`
- [ ] 2.2 适配层：FSM → 旧 boolean 变量
- [ ] 2.3 验收：状态转换正确，现有功能不变

**验收结果**：

**遇到的问题**：

---

## Phase 3：流式 Block Router ⭐ 关键阶段

- [ ] 3.1 实现 `src/core/streamBlockRouter.ts`
- [ ] 3.2 修改 handleIncomingMessage 接入新 Router
- [ ] 3.3 CoT 块实时渲染（不走打字机）
- [ ] 3.4 正文块流式输出
- [ ] 3.5 验收：CoT 立刻出现，正文无跳动

**验收结果**：

**遇到的问题**：

---

## Phase 4：增量渲染

- [ ] 4.1 流式文本用 pre-wrap 直接追加
- [ ] 4.2 代码块独立渲染
- [ ] 4.3 done 后最终 Markdown 渲染 pass
- [ ] 4.4 验收：长回复无闪烁无跳动

**验收结果**：

**遇到的问题**：

---

## Phase 5：Viewport 锚定

- [ ] 5.1 实现 ScrollAnchor 类
- [ ] 5.2 用户消息锚定 + 补偿滚动
- [ ] 5.3 上滑解锁 + 回到底部按钮
- [ ] 5.4 验收：发长消息后始终可见

**验收结果**：

**遇到的问题**：

---

## Phase 6：Agent 就绪

- [ ] 6.1 Gateway 工具调用事件结构化
- [ ] 6.2 ToolCallBlock + ToolResultBlock 组件
- [ ] 6.3 验收：工具调用可视化

**验收结果**：

**遇到的问题**：

---

## 变更日志

| 日期 | Phase | 内容 | 结果 |
|------|-------|------|------|
| 2026-03-27 | - | 创建迁移规划文档 | ✅ |

---

## 回滚记录

（如有回滚在此记录）
