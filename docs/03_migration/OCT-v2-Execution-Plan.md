# OCT v2 架构迁移 · 总控执行手册

> **角色分工**：Zilong（决策 + 验收） · Claude（架构 + 诊断） · Cursor（实现）  
> **预计总工期**：5-6 个工作日  
> **创建日期**：2026-03-27  
> **状态**：🟢 Phase 1 已完成，准备 Phase 2

---

## 📌 上下文保活策略

### 问题
Claude 每次对话有 token 上限，长工程跨多个会话时容易丢上下文。

### 解决方案：`migration-status.md` 作为唯一真相源

在项目根目录维护一个状态文件，**每完成一个步骤就更新它**。每次开新 Claude 会话时，上传这个文件 + 架构蓝图，Claude 就能立刻知道当前进度。

**文件路径**：`docs/03_migration/migration-status.md`

```
每次和 Claude 开新会话时，上传这两个文件：
1. docs/03_migration/migration-status.md    ← 当前进度
2. docs/03_migration/architecture-blueprint.md  ← 架构蓝图

Claude 会根据这两个文件知道：
- 哪些 Phase 已完成
- 当前在做什么
- 遇到了什么问题
- 下一步是什么
```

---

## 🔒 Git 备份策略

### 命名规范

```bash
# 每个 Phase 开始前打一个基线标签
git tag v2-phase{N}-baseline

# 每个 Phase 完成验收通过后打一个完成标签
git tag v2-phase{N}-done

# 如果某个 Phase 失败需要回滚
git checkout v2-phase{N}-baseline
```

### 备份时机（必须执行，不可跳过）

| 时机 | 操作 | 命令 |
|------|------|------|
| Phase 开始前 | 提交当前所有改动 + 打基线标签 | 见下方 |
| Phase 中每个子任务完成 | 提交改动（不打标签） | 见下方 |
| Phase 验收通过 | 提交 + 打完成标签 | 见下方 |
| 遇到严重问题 | 回滚到基线 | 见下方 |

### 具体 Git 命令（复制粘贴可用）

```powershell
# ═══ Phase 开始前：基线备份 ═══
cd E:\windows-window\OpenClaw-Terminal
git add -A :!resources/nocturne_memory :!"docs/发布文档"
git commit -m "v2-phase{N}: baseline before migration"
git tag v2-phase{N}-baseline

# ═══ 子任务完成：中间提交 ═══
git add -A :!resources/nocturne_memory :!"docs/发布文档"
git commit -m "v2-phase{N}.{子任务号}: {简短描述}"

# ═══ Phase 验收通过：完成标签 ═══
git add -A :!resources/nocturne_memory :!"docs/发布文档"
git commit -m "v2-phase{N}: done ✅"
git tag v2-phase{N}-done

# ═══ 回滚（出问题时用） ═══
git stash                              # 保存当前未提交的改动
git checkout v2-phase{N}-baseline      # 回到基线
# 如果确认要放弃：git stash drop
# 如果想恢复改动：git stash pop
```

---

## 📋 总进度看板

> 每完成一项，把 ⬜ 改为 ✅，记录日期

### Phase 0：准备工作（预计 0.5 天）✅ 已完成
- [x] 0.1 创建 `docs/03_migration/` 目录和状态文件
- [x] 0.2 备份 `ChatTab.tsx` → `ChatTab.v1.tsx`
- [x] 0.3 创建 `src/core/` 目录
- [x] 0.4 创建核心类型定义 `src/core/types.ts`
- [x] 0.5 Git 基线：`v2-phase0-baseline` → 完成：`v2-phase0-done`

### Phase 1：ContentBlock 数据模型（预计 1 天）✅ 已完成
- [x] 1.1 实现 `src/core/blockRouter.ts`（文本 → ContentBlock[] 转换器）
- [x] 1.2 写 Vitest 单元测试覆盖 15 种场景
- [x] 1.3 适配层：blockRouter 输出 → 现有 segments 格式
- [x] 1.4 验收：所有现有功能不变，测试全通过（29 passed）
- [x] 1.5 Git：`v2-phase1-baseline` → `v2-phase1-done`（commit: 61cff26）

### Phase 2：TurnFSM 状态机（预计 0.5 天）⏳ 进行中
- [ ] 2.1 实现 `src/core/turnFSM.ts`
- [ ] 2.2 适配层：FSM → 旧 boolean 变量
- [ ] 2.3 验收：状态转换正确，现有功能不变
- [ ] 2.4 Git：`v2-phase2-baseline` → `v2-phase2-done`

### Phase 3：流式 Block Router（预计 1-2 天）⭐
- [ ] 3.1 实现 `src/core/streamBlockRouter.ts`
- [ ] 3.2 修改 handleIncomingMessage 接入新 Router
- [ ] 3.3 CoT 块实时渲染（不走打字机）
- [ ] 3.4 正文块流式输出
- [ ] 3.5 验收：CoT 立刻出现，正文无跳动
- [ ] 3.6 Git：`v2-phase3-baseline` → `v2-phase3-done`

### Phase 4：增量渲染（预计 1 天）
- [ ] 4.1 流式文本用 pre-wrap 直接追加
- [ ] 4.2 代码块独立渲染
- [ ] 4.3 done 后最终 Markdown 渲染 pass
- [ ] 4.4 验收：长回复无闪烁无跳动
- [ ] 4.5 Git：`v2-phase4-baseline` → `v2-phase4-done`

### Phase 5：Viewport 锚定（预计 1 天）
- [ ] 5.1 实现 ScrollAnchor 类
- [ ] 5.2 用户消息锚定 + 补偿滚动
- [ ] 5.3 上滑解锁 + 回到底部按钮
- [ ] 5.4 验收：发长消息后始终可见
- [ ] 5.5 Git：`v2-phase5-baseline` → `v2-phase5-done`

### Phase 6：Agent 就绪（预计 0.5 天）
- [ ] 6.1 Gateway 工具调用事件
- [ ] 6.2 ToolCallBlock + ToolResultBlock 组件
- [ ] 6.3 验收：工具调用可视化
- [ ] 6.4 Git：`v2-phase6-baseline` → `v2-phase6-done`

---

## 🔄 每个 Phase 的标准执行流程

```
┌─────────────────────────────────────────────────────┐
│  每个 Phase 都按以下 7 步执行，不跳步                 │
└─────────────────────────────────────────────────────┘

Step 1: 【Zilong】 打 Git 基线标签
        执行 Phase 开始前的 git 命令

Step 2: 【Zilong → Claude】 开新会话（如需要）
        上传 migration-status.md + architecture-blueprint.md
        告诉 Claude "我要开始 Phase N"

Step 3: 【Claude】 输出该 Phase 的 Cursor Prompt
        包含所有要改的文件、具体改动、验证方式

Step 4: 【Zilong → Cursor】 把 Cursor Prompt 喂给 Cursor 执行
        如果 Cursor 出问题：
        - 简单问题 → 让 Cursor 自己修
        - 复杂问题 → 让 AMY 出 claude-brief.md → 交给 Claude 诊断

Step 5: 【Zilong】 验收测试
        按 Cursor Prompt 末尾的"验证方式"逐项测试
        每项测试结果记录到 migration-status.md

Step 6: 【Zilong】 更新 migration-status.md
        - 把完成的项目从 ⬜ 改为 ✅
        - 记录遇到的问题和解决方式
        - 记录实际花费时间

Step 7: 【Zilong】 打 Git 完成标签
        执行 Phase 完成后的 git 命令

        ↓ 进入下一个 Phase，回到 Step 1
```

---

## 🚨 回滚预案

### 什么时候该回滚

- Cursor 执行后 OCT 无法启动（黑屏/白屏/报错）
- 功能严重退化（原来能用的现在不能用了）
- 连续尝试 3 次修复仍未解决

### 如何回滚

```powershell
# 1. 停止 Electron 进程
# 2. 回滚到 Phase 基线
git checkout v2-phase{N}-baseline

# 3. 重装依赖（以防 package 变了）
npm install

# 4. 重启测试
npm run start
```

### 回滚后怎么继续

在 migration-status.md 里记录：

```markdown
### Phase N 回滚记录
- 回滚时间：2026-XX-XX
- 回滚原因：{具体描述}
- 现象：{用户看到什么}
- Cursor 报了什么错（如有）
```

然后下次和 Claude 会话时上传这个文件，Claude 会分析问题并出修正版 Cursor Prompt。

---

## 📄 migration-status.md 模板

> 这就是你在项目里要创建的那个文件的完整内容

```markdown
# OCT v2 迁移状态

## 当前阶段
Phase: 0（准备）
状态：未开始

## 架构蓝图版本
v1.0 (2026-03-27)

## Git 标签记录
| 标签 | 日期 | 说明 |
|------|------|------|
| （尚未开始） | | |

## Phase 0：准备
- [ ] 0.1 创建目录结构
- [ ] 0.2 备份 ChatTab.tsx
- [ ] 0.3 创建 src/core/
- [ ] 0.4 创建 types.ts
验收结果：
遇到的问题：

## Phase 1：ContentBlock 模型
- [ ] 1.1 blockRouter.ts
- [ ] 1.2 单元测试
- [ ] 1.3 适配层
- [ ] 1.4 验收通过
验收结果：
遇到的问题：

## Phase 2：TurnFSM
- [ ] 2.1 turnFSM.ts
- [ ] 2.2 适配层
- [ ] 2.3 验收通过
验收结果：
遇到的问题：

## Phase 3：流式 Block Router ⭐
- [ ] 3.1 streamBlockRouter.ts
- [ ] 3.2 handleIncomingMessage 接入
- [ ] 3.3 CoT 实时渲染
- [ ] 3.4 正文流式
- [ ] 3.5 验收通过
验收结果：
遇到的问题：

## Phase 4：增量渲染
- [ ] 4.1 流式 pre-wrap
- [ ] 4.2 代码块独立
- [ ] 4.3 最终渲染 pass
- [ ] 4.4 验收通过
验收结果：
遇到的问题：

## Phase 5：Viewport 锚定
- [ ] 5.1 ScrollAnchor
- [ ] 5.2 锚定 + 补偿
- [ ] 5.3 上滑解锁
- [ ] 5.4 验收通过
验收结果：
遇到的问题：

## Phase 6：Agent 就绪
- [ ] 6.1 Gateway 事件
- [ ] 6.2 ToolCall 组件
- [ ] 6.3 验收通过
验收结果：
遇到的问题：

## 变更日志
| 日期 | Phase | 内容 | 结果 |
|------|-------|------|------|
| | | | |
```

---

## 📋 验收检查清单（Zilong 用）

每个 Phase 完成后，对照这些检查：

### 通用检查（每个 Phase 都要做）

```
□ OCT 能正常启动（npm run start 无报错）
□ Gateway 能正常连接（状态显示 CONNECTED）
□ 能正常发送消息并收到回复
□ 选项胶囊（pills）仍能正常渲染和点击
□ 任务清单仍能正常渲染和勾选
□ /status 命令正常返回
□ /cot medium 后 CoT 面板出现
□ /cot off 后 CoT 面板不出现
□ 右侧 Gateway 日志面板正常显示
□ 设置面板能正常打开和保存
```

### Phase 3 专项检查（最关键的 Phase）

```
□ CoT 面板在 AI 开始输出的 1 秒内出现（不是等打字机）
□ CoT 内容实时流入（能看到文字逐步出现）
□ CoT 结束后自动折叠
□ 点击折叠的 CoT 能展开
□ 正文在 CoT 之后正常输出
□ 长回复（超过一屏）不跳动
□ 代码块正常渲染和高亮
□ 表格正常渲染（不闪烁）
```

### Phase 5 专项检查

```
□ 发送消息后，用户消息在视口上方可见
□ AI 回复在用户消息下方生长
□ AI 输出过程中视口不跳动
□ 手动上滑后，自动滚动停止
□ 上滑后出现"回到底部"按钮
□ 点击"回到底部"能回到最新位置
```

---

## ⚡ 快速参考：给 Claude 开新会话时的模板消息

每次需要和 Claude 开新会话继续工作时，复制这段模板：

```
我正在进行 OCT v2 架构迁移。

上传了两个文件：
1. migration-status.md — 当前进度
2. architecture-blueprint.md — 架构蓝图

当前状态：Phase {N}，具体进展见 migration-status.md

请帮我：
{选一个}
A) 出 Phase {N} 的 Cursor Prompt
B) 诊断这个问题：{描述}
C) Phase {N} 验收通过了，出 Phase {N+1} 的 Cursor Prompt
```

---

## 🎯 第一步：现在就做

1. 在项目中创建目录：

```powershell
mkdir E:\windows-window\OpenClaw-Terminal\docs\03_migration
```

2. 把本文件保存为：

```
docs/03_migration/execution-plan.md
```

3. 把架构蓝图保存为：

```
docs/03_migration/architecture-blueprint.md
```

4. 创建 migration-status.md（用上面的模板）

5. 打第一个 Git 基线：

```powershell
cd E:\windows-window\OpenClaw-Terminal
git add -A :!resources/nocturne_memory :!"docs/发布文档"
git commit -m "v2: migration planning docs"
git tag v2-phase0-baseline
```

6. 回到 Claude，说"Phase 0 基线已打好，请出 Phase 0 的 Cursor Prompt"

---

## 📝 变更日志

| 日期 | Phase | 内容 | 结果 |
|------|-------|------|------|
| 2026-03-27 | Phase 0 | 创建目录结构、类型定义、备份旧文件 | ✅ 完成 |
| 2026-03-28 | Phase 1 | blockRouter + 单元测试 + 适配层 | ✅ 完成 (29 passed, commit: 61cff26, tag: v2-phase1-done) |

---

*这个手册是整个迁移工程的操作圣经。遇到任何卡点，先回来看这个文件。*
