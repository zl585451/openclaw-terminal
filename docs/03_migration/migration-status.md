# OCT v2 迁移状态

> **上次更新**：2026-03-28 02:56  
> **更新人**：AMY

## 当前阶段

Phase: 4（增量渲染 / UI 集成）✅ 已完成  
状态: 准备 Git 提交 + 打包发布

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
| v2-migration-complete | 2026-03-28 | v2 迁移完成 |

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

## Phase 4：增量渲染（UI 集成）⭐ 最后一步迁移 ✅ 已完成

- [x] 4.1 创建 `src/core/blockIngest.ts`（BlockIngest 类，负责累积原文 + 路由到 blockRouter）
- [x] 4.2 StreamRouter 新增 `abortToIdle()` 方法（异常/发送失败时清定时器、清空 buffer、回到 IDLE）
- [x] 4.3 创建 `src/ui/chat/ChatTab.v2.tsx`（从 ChatTab.tsx 复制，集成新核心）
  - [x] 单次 TurnFSM + StreamRouter(fsm) + BlockIngest（useRef 懒初始化）
  - [x] FSM subscribe：更新 fsmPhase，在 USER_COMMITTED / REQUEST_DISPATCHED 打 needsScrollToUserRef，在 TURN_FINISHED / IDLE 清 userScrolledUp
  - [x] StreamRouter.subscribe：tokens → BlockIngest → 更新 streamingMessageRef / fullTextRef / displayedText（走 bridged + parseOptionBox）→ setMessages
  - [x] state === COMPLETED：close() → fsm.onTurnFinish() → 落盘最终内容、ingest.reset()、助手 isStreaming: false
  - [x] 去掉 useState(isStreaming)，改为 deriveLegacyFlags(fsmPhase) + 最后一条助手 msg.isStreaming 的 useMemo
  - [x] 普通对话：delta → oct.stream.pushToken；done → oct.stream.end()；系统命令仍走原拼接 + 打字机
  - [x] OCT_V2_DISABLE_TYPEWRITER = true：普通流式不再用 RAF 打字机，节奏交给 StreamRouter 16ms 批处理
  - [x] sendMessage / quickSend：非系统命令时 abortToIdle → onUserTyping（若 IDLE）→ onUserSubmit → onRequestStart → ingest.reset → stream.open()；发送失败则 abortToIdle + recoverOctStreamFromEndFailure
- [x] 4.4 更新 `src/App.tsx` 聊天入口改为 `import ChatTab from './ui/chat/ChatTab.v2'`
- [x] 4.5 ChatTab.v2 内样式与组件改为 `../../styles`、`../../components` 等相对路径
- [x] 4.6 验收：npx tsc --noEmit 通过，npm run test 42 passed
- [x] 4.7 本地测试通过（用户确认功能正常）

**验收结果**：✅ 通过
- BlockIngest 实现完成（增量 ingest(batch) → 累积原文 → blockRouter + blocksToSegments → getBridgedText()）
- StreamRouter.abortToIdle() 实现完成（异常处理）
- ChatTab.v2.tsx 完成集成（单次 TurnFSM + StreamRouter + BlockIngest）
- App.tsx 入口已切换为 ChatTab.v2
- TypeScript 编译通过
- 单元测试通过（42 passed）
- 用户本地测试确认功能正常
- 保留 ChatTab.tsx 作回滚备用

**遇到的问题**：无

**回滚方式**：
- 把 `src/App.tsx` 的 import 改回 `./components/ChatTab` 即可切回旧版

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
| 2026-03-28 | Phase 0 | 目录结构 + 类型定义 + ChatTab 备份 | ✅ |
| 2026-03-28 | Phase 0 | Git 提交并打标签 v2-phase0-done | ✅ |
| 2026-03-28 | Phase 1 | blockRouter + blockAdapter 实现 + 测试 | ✅ |
| 2026-03-28 | Phase 2 | turnFSM 状态机实现 + 测试 + 标签 | ✅ |
| 2026-03-28 | Phase 3 | streamRouter 流控制实现 + 测试 + 标签 | ✅ |
| 2026-03-28 | Phase 4 | UI 集成（ChatTab.v2）+ 测试 + 用户验收 | ✅ |

---

## 回滚记录

（如有回滚在此记录）

---

## 下一步：打包发布

Phase 4 完成后，接下来处理停车场事项：
- [ ] 生成 Windows/Mac/Linux 三个系统安装包
- [ ] 更新主页（README / 官网下载链接）
