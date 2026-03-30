# OCT v2 迁移状态

> **上次更新**：2026-03-28 02:56  
> **更新人**：AMY

## 当前阶段

Phase: 6（Agent 就绪）✅ 全部完成  
状态: Phase 0-6 迁移完成，流式体验优化进行中

## 架构蓝图版本

v1.0 (2026-03-27) — 见 OCT-v2-Architecture-Blueprint.md

## Git 标签记录

| 标签 | 日期 | 说明 |
|------|------|------|
| v2-phase0-done | 2026-03-28 | Phase 0 完成（核心类型就位） |
| v2-phase1-done | 2026-03-28 | Phase 1 完成（blockRouter + blockAdapter） |
| v2-phase2-done | 2026-03-28 | Phase 2 完成（turnFSM 状态机） |
| v2-phase3-done | 2026-03-28 | Phase 3 完成（streamRouter 流控制） |
| v2-phase4-done | 2026-03-28 | Phase 4 完成（UI 集成） |
| v2-migration-complete | 2026-03-28 | v2 核心迁移完成 |
| — | 2026-03-29 | P0 审计修复（云端 7fd04b7） |
| — | 2026-03-29 | Phase 5 完成（云端 935f5c4 + 本地 8f8942b） |
| — | 2026-03-29 | Phase 6 完成（云端 b4079ec + 本地 c4e2c0c） |

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

## Phase 3：StreamRouter 流控制 ⭐ 关键阶段 ✅ 已完成

- [x] 3.1 实现 `src/core/streamRouter/` 目录（streamTypes.ts, streamRouter.ts, streamAdapter.ts, index.ts）
- [x] 3.2 StreamState 状态机（IDLE → OPENING → OPEN → STREAMING → FLUSHING → COMPLETED → CLOSED）
- [x] 3.3 16ms setInterval 批量 flush（每 tick 最多 3 个 token）
- [x] 3.4 与 TurnFSM 联动（onStreamOpen/onToken/onStreamPause/onStreamResume/onStreamEnd/onRenderDone）
- [x] 3.5 deriveStreamFlags 适配层（isStreaming/isPaused/isFlushing/isComplete）
- [x] 3.6 Vitest 单元测试（42 passed）
- [x] 3.7 TypeScript 编译通过（npx tsc --noEmit）
- [x] 3.8 删除根目录占位文件 src/core/streamRouter.ts
- [x] 3.9 Git 提交并打标签 v2-phase3-done

**验收结果**：✅ 通过
- streamRouter 核心实现完成（严格状态转换 + 批量 flush + FSM 联动）
- streamAdapter 适配层完成
- npm run test 全通过（42 passed）
- TypeScript 编译通过
- 删除根目录占位文件，避免与目录冲突
- 未改动 ChatTab/其他 UI，模型 token 仍走现有路径
- StreamRouter 已可作为唯一入口，后续接 WS/打字机处改为 router.subscribe 即可

**遇到的问题**：无

---

## Phase 4：UI 集成 ⚠️ 部分完成

**已完成**（StreamRouter 集成）：
- [x] 4.1 创建 `src/core/blockIngest.ts`（BlockIngest 类，负责累积原文 + 路由到 blockRouter）
- [x] 4.2 StreamRouter 新增 `abortToIdle()` 方法（异常/发送失败时清定时器、清空 buffer、回到 IDLE）
- [x] 4.3 创建 `src/ui/chat/ChatTab.v2.tsx`（从 ChatTab.tsx 复制，集成新核心）
- [x] 4.4 更新 `src/App.tsx` 聊天入口改为 `import ChatTab from './ui/chat/ChatTab.v2'`
- [x] 4.5 ChatTab.v2 内样式与组件改为 `../../styles`、`../../components` 等相对路径
- [x] 4.6 验收：npx tsc --noEmit 通过，npm run test 42 passed
- [x] 4.7 本地测试通过（用户确认功能正常）

**未完成**（蓝图中 Phase 4 的核心目标——增量渲染）：
- [ ] 4.8 流式文本用 `pre-wrap` 直接追加，不每帧跑 ReactMarkdown
- [ ] 4.9 代码块独立 `<pre>` 元素，token 追加到 textContent
- [ ] 4.10 `done` 信号后做一次最终 Markdown 渲染 pass
- [ ] 4.11 验收：长回复无闪烁无跳动

**实际状态说明**：
Phase 4 完成了 StreamRouter 与 ChatTab.v2 的集成，打字机改为 16ms 批处理。但蓝图中"流式阶段不再每帧跑 ReactMarkdown"的核心目标**尚未实现**——每次 token batch 仍触发 setMessages → React 重渲染 → ReactMarkdown 全量解析。流式体验的根本性能问题待 4.8-4.11 解决。

**验收结果**：⚠️ StreamRouter 集成通过，增量渲染待实现

**遇到的问题**：
- 流式打字机"逐行飞出"，AI 输出完成后渲染"弹一下"——根因是每 token 仍触发全量 Markdown 解析

**回滚方式**：
- 把 `src/App.tsx` 的 import 改回 `./components/ChatTab` 即可切回旧版

---

## Phase 5：Viewport 锚定 ✅ 已完成

- [x] 5.1 实现 ScrollAnchor 类（`src/core/viewport/scrollAnchor.ts`）
  - [x] snapAndAnchor：用户消息 snap 到视口顶部并锁定
  - [x] reconcile：DOM 变化后补偿滚动位置
  - [x] followBottom：跟随内容增长自动滚底
  - [x] onUserScroll：用户手动滚动时解锁
- [x] 5.2 用户消息锚定 + 补偿滚动（本地 Cursor 集成）
- [x] 5.3 上滑解锁 + 回到底部按钮
- [x] 5.4 验收：发长消息后始终可见 ✅
- [x] 5.5 修复：AI 输出完成后底部无多余空白

**验收结果**：✅ 通过
- ScrollAnchor 核心类在云端实现 + 8 个单元测试
- 本地 Cursor 完成 ChatTab.v2 集成
- 用户消息顶置、AI 回复向下生长、完成后无空白
- Git 提交：云端 935f5c4，本地 8f8942b

**遇到的问题**：
- AI 输出完后底部有多余可滚动空白 → 已修复（release 后限制 scrollTop）

---

## Phase 6：Agent 就绪 ✅ 已完成

- [x] 6.1 Gateway 工具调用事件结构化（`ai.js` 新增 `onToolEvent` 回调）
  - [x] tool_call 事件：工具名 + 参数 + 状态 executing
  - [x] tool_result 事件：结果预览 + 状态 done/error
  - [x] agent-phase: tool_executing 阶段事件
- [x] 6.2 前端工具调用卡片（本地 Cursor 实现）
- [x] 6.3 验收：工具调用可视化 ✅

**验收结果**：✅ 通过
- Gateway onToolEvent 在云端实现并通过 WebSocket 实际测试（web_search 工具）
- 前端工具卡片在本地 Cursor 实现
- Git 提交：云端 b4079ec，本地 c4e2c0c

**遇到的问题**：无

---

## 变更日志

| 日期 | Phase | 内容 | 结果 |
|------|-------|------|------|
| 2026-03-27 | - | 创建迁移规划文档 | ✅ |
| 2026-03-28 | Phase 0 | 目录结构 + 类型定义 + ChatTab 备份 | ✅ |
| 2026-03-28 | Phase 0 | Git 提交并打标签 v2-phase0-done | ✅ |
| 2026-03-28 | Phase 1 | blockRouter + blockAdapter 实现 + 测试 | ✅ |
| 2026-03-28 | Phase 2 | turnFSM 状态机实现 + 测试 + 标签 | ✅ |
| 2026-03-28 | Phase 3 | streamRouter 流控制实现 + 测试 + 标签 | ✅ |
| 2026-03-28 | Phase 4 | UI 集成（ChatTab.v2）+ 测试 + 用户验收 | ⚠️ 部分 |
| 2026-03-29 | 审计修复 | P0 问题修复：TurnPhase 冲突、ERROR/CANCELLED 状态、blockRouter ID、subscriber 保护、空响应处理 | ✅ |
| 2026-03-29 | Phase 5 | ScrollAnchor 视口控制器（云端核心类 + 本地集成） | ✅ |
| 2026-03-29 | Phase 6 | Gateway 工具调用事件 + 前端工具卡片可视化 | ✅ |

---

## 回滚记录

（如有回滚在此记录）

---

## 下一步

Phase 0-6 迁移全部完成，待处理事项：
- [ ] 流式体验优化：去掉 Gateway stream_merge 和前端 StreamRouter 缓冲层，实现 0 延迟直通
- [ ] Phase 4.8-4.11：真正的增量渲染（流式阶段 pre-wrap 纯文本 + done 后一次性 Markdown 渲染）
- [ ] 打包发布 v0.1.9：Windows/Mac/Linux 三平台安装包
- [ ] 更新主页（README / 官网下载链接）
