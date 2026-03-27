# OCT v2 迁移状态

> **上次更新**：2026-03-28  
> **更新人**：AMY

## 当前阶段

Phase: 2（TurnFSM 状态机）✅ 已完成  
状态: 准备 Phase 3

## 架构蓝图版本

v1.0 (2026-03-27) — 见 OCT-v2-Architecture-Blueprint.md

## Git 标签记录

| 标签 | 日期 | 说明 |
|------|------|------|
| v2-phase0-done | 2026-03-28 | Phase 0 完成（核心类型就位） |
| v2-phase1-done | 2026-03-28 | Phase 1 完成（blockRouter + blockAdapter） |
| v2-phase2-done | 2026-03-28 | Phase 2 完成（turnFSM 状态机） |

---

## Phase 0：准备工作

- [x] 0.1 创建 `docs/03_migration/` 目录和状态文件
- [x] 0.2 备份 `ChatTab.tsx` → `ChatTab.v1.tsx`
- [x] 0.3 创建 `src/core/` 目录
- [x] 0.4 创建核心类型定义 `src/core/types.ts`
- [x] 0.5 Git 完成标签 `v2-phase0-done`

**验收结果**：✅ 通过
- 所有核心类型文件就位（types.ts 7553 字节）
- blockRouter.ts / turnFSM.ts / streamRouter.ts 占位文件已创建
- ChatTab.v1.tsx 备份存在（131670 字节）
- Git 提交并打标签 v2-phase0-done（commit: c1f8d91）

**遇到的问题**：无

---

## Phase 1：ContentBlock 数据模型

- [x] 1.1 实现 `src/core/blockRouter.ts`
- [x] 1.2 Vitest 单元测试（15 种场景）
- [x] 1.3 适配层桥接现有 segments
- [x] 1.4 验收：所有现有功能不变，测试全通过

**验收结果**：✅ 通过
- blockRouter.ts 实现完成
- blockAdapter 适配层完成
- npm run test 全通过（29 passed）
- npm run start 可启动，Gateway 连接成功
- Git 提交并打标签 v2-phase1-done（commit: 61cff26）

**遇到的问题**：无

---

## Phase 2：TurnFSM 状态机

- [x] 2.1 实现 `src/core/turnFSM/` 目录结构（turnTypes.ts, turnFSM.ts, turnAdapter.ts, index.ts）
- [x] 2.2 12 个 TurnPhase 状态 + 严格转换表 allowedTransitions
- [x] 2.3 语义 API（onUserTyping, onUserSubmit, onRequestStart, onStreamOpen 等）
- [x] 2.4 适配器 deriveLegacyFlags 覆盖全部 12 阶段
- [x] 2.5 Vitest 单元测试（35 passed）
- [x] 2.6 TypeScript 编译通过（npx tsc --noEmit）
- [x] 2.7 Git 提交并打标签 v2-phase2-done

**验收结果**：✅ 通过
- turnFSM 核心实现完成（严格状态转换 + 语义 API）
- turnAdapter 适配层完成（含 hasResponse 逻辑）
- npm run test 全通过（35 passed）
- TypeScript 编译通过
- 删除根目录占位文件，避免与目录冲突
- Git 提交并打标签 v2-phase2-done

**遇到的问题**：无

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
| 2026-03-27 | Phase 0 | 目录结构 + 类型定义 + ChatTab 备份 | ✅ |
| 2026-03-28 | Phase 0 | Git 提交并打标签 v2-phase0-done | ✅ |
| 2026-03-28 | Phase 1 | blockRouter + blockAdapter 实现 + 测试 | ✅ |
| 2026-03-28 | Phase 2 | turnFSM 状态机实现 + 测试 + 标签 | ✅ |

---

## 回滚记录

（如有回滚在此记录）
