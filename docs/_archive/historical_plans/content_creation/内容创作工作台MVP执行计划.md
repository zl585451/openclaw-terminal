【背景】内容创作工作台已经完成三步确认 UI、开工确认书、任务对象模型、Agent 编排协议和多人演播有声书团队模板设计。当前仍处于前端 mock 阶段，尚未接入真实 Gateway、持久化、真实文件解析和真实 Agent 执行。

本计划目标是把当前设计推进到“MVP 能跑”的阶段：

- 用户可以上传或选择小说素材。
- 系统完成素材确认、目标范围确认、AI 初读策略确认。
- 用户确认开工后，系统按多人演播有声书 Agent 团队链路执行。
- 系统产出多人演播样章台本、角色音标注、演播设计、质检报告和交付包。

【项目路径】E:\windows-window\OpenClaw-Terminal

【核心目标】

先跑通一条最小闭环：

`小说文本 -> 三步确认 -> 开工确认书 -> Agent 执行进度 -> mock 产物 -> Gateway 状态机 -> 真实素材摄入 -> 第一批真实 Agent`

【执行原则】

- 先 mock 闭环，再接 Gateway。
- 先串行执行，再考虑并行。
- 先跑半章或一章样章，不追求全书处理。
- 先稳定对象协议，再扩展 Agent 数量。
- 任何会改变用户确认内容、任务对象、Agent 协议、Gateway 路由或 UI 行为的改动，都必须同步更新 `docs/`。
- 每个阶段独立 commit，阶段之间不要混合提交。

【保护区(非本计划明确要求不要改)】

- `oct-gateway/ai.js`
- `oct-gateway/runtime/`
- `src/hooks/useMessages.ts`
- `src/hooks/useWebSocket.ts`
- `src/ui/chat/`
- `electron/main.ts`
- `electron/preload.ts`
- 已定版规则文档：
  - `docs/03_specs/内容创作工作台/多人演播有声小说改编规则.md`
  - `docs/03_specs/内容创作工作台/多人演播角色音分类标注规则.md`
  - `docs/03_specs/内容创作工作台/多人演播演播设计规则.md`
  - `docs/03_specs/内容创作工作台/多人演播质检规则.md`

【关键参考文档】

- `docs/03_specs/内容创作工作台/00_项目接手指南.md`
- `docs/02_architecture/内容制作多Agent系统架构.md`
- `docs/02_architecture/内容创作Agent分层与确认闸门.md`
- `docs/02_architecture/内容创作Agent协议与编排规范.md`
- `docs/03_specs/内容创作工作台/内容制作工作台UI结构规范.md`
- `docs/03_specs/内容创作工作台/内容创作任务创建双确认流程.md`
- `docs/03_specs/内容创作工作台/内容创作任务对象模型.md`
- `docs/03_specs/内容创作工作台/多人演播有声书Agent团队编排规范.md`

===================================================================

# Part A:前端 mock 执行链路跑通

## 目标

状态：已执行，前端 mock 执行链路已接入。后续如继续优化，以 `src/modules/script-adapter/types/execution.ts` 和 `src/modules/script-adapter/services/mockAgentExecution.ts` 为当前实现基线。

让当前工作台从“开工确认书”继续往下走，形成可演示的完整前端闭环。

完成后应能演示：

`创建任务 -> 三步确认 -> 开工确认书 -> 确认开工 -> Agent 队列执行 -> mock 产物生成 -> 本轮完成`

## 代码范围

优先修改：

- `src/modules/script-adapter/`

预计新增或调整：

- `src/modules/script-adapter/types/execution.ts`
- `src/modules/script-adapter/services/mockAgentExecution.ts`
- `src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`
- `src/modules/script-adapter/styles/scriptAdapter.module.css`

## 执行步骤

### Step 1:定义前端执行协议类型

新增 TypeScript 类型，至少包含：

- `AgentExecutionPlan`
- `AgentRun`
- `ArtifactEnvelope`
- `ReviewGate`
- `TaskExecutionSheet`
- `ExecutionStageStatus`

类型应对齐：

- `docs/02_architecture/内容创作Agent协议与编排规范.md`
- `docs/03_specs/内容创作工作台/多人演播有声书Agent团队编排规范.md`

### Step 2:实现 mock Agent 执行器

新增 mock 服务，模拟串行执行：

1. 文本改编师
2. 角色音统筹
3. 演播设计师
4. 质检审校
5. 交付打包员

每一步应生成：

- `AgentRun`
- `ArtifactEnvelope`
- 用户可读摘要
- mock 产物 payload

### Step 3:改造开工确认书按钮

当前 `确认开工` 按钮应触发 mock 执行链路。

触发后，页面从“开工确认书”切换到“制作执行中 / 执行结果”视图。

### Step 4:新增执行进度视图

执行进度视图应展示：

- 当前阶段
- 哪些 Agent 已完成
- 哪些 Agent 正在执行
- 哪些 Agent 等待执行
- 每一步产出了什么
- 是否需要人工复核

用户可见文案不要暴露过多技术字段。

技术字段可以折叠展示：

- Agent ID
- 输入产物
- 输出产物
- run_id
- artifact_id

### Step 5:新增产物预览

至少提供 5 类 mock 产物预览：

- 多人演播样章台本
- 角色音标注表
- 演播设计提示
- 质检问题清单
- 制作交付包

### Step 6:更新文档

同步更新：

- `docs/03_specs/内容创作工作台/内容制作工作台UI结构规范.md`
- `docs/03_specs/内容创作工作台/00_项目接手指南.md`
- `docs/05_changelog/`

## 验证命令

```powershell
npx tsc --noEmit
npm run build
```

## 验收标准

- [ ] 点击 `确认开工` 后不再停留在静态开工确认书。
- [ ] 页面能展示 5 个 Agent 的执行状态。
- [ ] 每个 Agent 都有 mock 产物。
- [ ] 最终能显示“本轮制作完成”。
- [ ] 技术细节默认折叠。
- [ ] `npx tsc --noEmit` 通过。
- [ ] `npm run build` 通过。
- [ ] 文档和 changelog 已同步。

## Part A 完成后,再开始 Part B。不要合并执行。

===================================================================

# Part B:Gateway 最小执行状态机

## 目标

把前端 mock 执行链路沉到 Gateway，形成后端可管理的任务状态。

完成后，前端不再自己假跑执行状态，而是从 Gateway 查询任务、AgentRun 和 Artifact。

## 代码范围

优先新增或修改：

- `oct-gateway/`
- `src/modules/script-adapter/`

不要改动通用聊天主链路，除非只是新增独立路由或独立服务。

## 建议接口

最小接口可以先采用 HTTP 或 WebSocket 二选一，优先选择项目现有更易接入的方式。

建议能力：

- 创建内容创作任务
- 查询任务状态
- 启动任务执行
- 查询 AgentRun 列表
- 查询 Artifact 列表
- 查询单个 Artifact 详情
- 失败重试占位

## 执行步骤

### Step 1:定义 Gateway 内部任务对象

至少包含：

- `task_id`
- `status`
- `execution_plan`
- `agent_runs`
- `artifacts`
- `review_gates`
- `created_at`
- `updated_at`

MVP 可以先使用内存存储，不要求数据库。

### Step 2:实现任务状态流转

状态至少支持：

- `draft`
- `ready_to_run`
- `running`
- `waiting_review`
- `completed`
- `failed`

### Step 3:实现 mock 后端执行器

Gateway 模拟执行同一条链：

`文本改编 -> 角色音标注 -> 演播设计 -> 质检 -> 打包`

前端轮询或订阅状态变化。

### Step 4:前端接入 Gateway 状态

前端工作台从 Gateway 读取：

- 当前任务状态
- AgentRun
- ArtifactEnvelope

保留前端 mock fallback，方便无 Gateway 环境开发。

### Step 5:更新文档

同步更新：

- `docs/02_architecture/内容创作Agent协议与编排规范.md`
- `docs/03_specs/内容创作工作台/内容创作任务对象模型.md`
- `docs/05_changelog/`

## 验证命令

```powershell
npx tsc --noEmit
npm run build
```

如涉及 Gateway 单独测试，补充：

```powershell
node --check oct-gateway/index.js
```

## 验收标准

- [ ] Gateway 能保存内容创作任务状态。
- [ ] Gateway 能返回 AgentRun 和 Artifact。
- [ ] 前端能展示 Gateway 返回的执行状态。
- [ ] 无 Gateway 时仍可使用 mock fallback。
- [ ] 执行状态能从 `ready_to_run` 走到 `completed`。
- [ ] 文档和 changelog 已同步。

## Part B 完成后,再开始 Part C。不要合并执行。

===================================================================

# Part C:真实素材摄入

## 目标

让用户提交的真实 txt / md / docx 小说文本进入系统，并生成标准 `RawAsset`、`SourceDocument` 和 `SourceProfile`。

## 代码范围

可能涉及：

- `src/modules/script-adapter/`
- `oct-gateway/`
- 文件解析相关工具或服务

## 执行步骤

### Step 1:实现素材来源归一

三种入口统一成 `RawAsset`：

- 上传文件
- 粘贴试跑
- 已有文档

MVP 可以先优先支持：

- `.txt`
- `.md`

`.docx` 可作为后续增强，除非已有稳定解析能力。

### Step 2:生成 SourceDocument

从 RawAsset 中抽取文本，生成：

- `source_id`
- `source_type`
- `origin`
- `file_name`
- `mime_type`
- `text_digest`
- `created_at`

### Step 3:生成 SourceProfile

基础识别：

- 字数
- 章节数
- 第一章边界
- 段落数
- 文本类型候选
- 风险标记

### Step 4:替换当前假素材参数

创建页第一步不再固定显示 mock 文件名和字数，而是读取真实解析结果。

### Step 5:更新文档

同步更新：

- `docs/03_specs/内容创作工作台/内容创作任务创建双确认流程.md`
- `docs/03_specs/内容创作工作台/内容创作任务对象模型.md`
- `docs/05_changelog/`

## 验证命令

```powershell
npx tsc --noEmit
npm run build
```

## 验收标准

- [ ] 用户提交 txt / md 后能生成 SourceDocument。
- [ ] 系统能识别字数、章节和文本类型候选。
- [ ] 第一步素材确认展示真实参数。
- [ ] 后续任务规划读取真实 SourceProfile。
- [ ] 文档和 changelog 已同步。

## Part C 完成后,再开始 Part D。不要合并执行。

===================================================================

# Part D:第一批真实 Agent 接入

## 目标

先接入最关键的 3 个真实 Agent，让系统能基于真实文本完成分析和样章改编。

优先接入：

1. `task.intake_planner@1.0`
2. `business.content_analyzer@1.0`
3. `adapter.audiobook_text_rewriter@1.0`

角色音、演播设计、质检可以继续保留 mock 或半真实规则输出。

## 执行步骤

### Step 1:实现 Agent Prompt / 规则加载

每个真实 Agent 必须能读取对应规则文档或规则摘要。

注意：

- 不要把整套规则无脑塞给每次请求。
- MVP 可以先使用精简规则摘要。
- 完整规则路径必须记录在 AgentRun 中。

### Step 2:接入 task.intake_planner@1.0

输入：

- `RawAsset`
- `SourceDocument`
- `SourceProfile`
- 用户初始目标

输出：

- `IntakeReport`
- `TaskDraft`
- `AgentPreAllocation`
- `IntakeWarnings`

### Step 3:接入 business.content_analyzer@1.0

输入：

- `SourceDocument`
- `SourceProfile`
- `TaskBrief`
- `OutputTarget`
- `WorkScope`

输出：

- `AnalysisReport`
- `ModificationStrategyOptions`
- `ExecutionImpact`
- 轻量 `PlotLock`

### Step 4:接入 adapter.audiobook_text_rewriter@1.0

输入：

- `SourceDocument`
- `WorkScope`
- `AnalysisReport`
- `ModificationStrategy`
- `ExecutionBoundary`
- `PlotLock`

输出：

- `AdaptedScript`
- `RewriteNotes`
- `RiskFlags`

### Step 5:保留人工确认闸门

真实 Agent 输出后，仍必须经过：

- `target_scope_confirmation`
- `strategy_confirmation`

不得因为接入真实模型而跳过用户确认。

## 验证命令

```powershell
npx tsc --noEmit
npm run build
```

如有 Gateway 测试脚本，补充运行对应脚本。

## 验收标准

- [ ] `task.intake_planner@1.0` 能基于真实 SourceProfile 输出任务草案。
- [ ] `business.content_analyzer@1.0` 能输出问题、证据和策略建议。
- [ ] `adapter.audiobook_text_rewriter@1.0` 能生成半章或一章样章。
- [ ] 输出被包装为 ArtifactEnvelope。
- [ ] 失败时能保留错误和输入快照。
- [ ] 文档和 changelog 已同步。

## Part D 完成后,再开始 Part E。不要合并执行。

===================================================================

# Part E:完整多人演播有声书 MVP

## 目标

完成从真实小说素材到完整多人演播有声书样章交付的 MVP。

## 执行步骤

### Step 1:接入角色音标注 Agent

Agent：

- `classifier.voice_role_marker@1.0`

输出：

- `VoiceRegistry`
- `VoiceRoleMarkers`
- `UnresolvedVoiceList`

必须支持：

- 未定来源角色音
- 独立占位
- 可回绑
- 单章保守模式

### Step 2:接入演播设计 Agent

Agent：

- `designer.performance_audio@1.0`

输出：

- `PerformanceDesign`
- `AudioCueList`
- `CvDirectionNotes`

必须支持：

- BGM
- SFX / AMB
- CV 情绪
- 气息、停顿、重音
- 声场和转场

### Step 3:接入质检 Agent

Agent：

- `reviewer.production_quality@1.0`

输出：

- `ReviewReport`
- `IssueList`
- `ReviewConclusion`

必须支持：

- P0 / P1 / P2
- 通过
- 修改后通过
- 打回重做

### Step 4:实现最小返工

至少支持一种返工：

- 质检发现 P1 后，用户选择“局部返工”，系统重新执行对应 Agent。

MVP 可以只支持文本改编 Agent 的局部重跑。

### Step 5:实现交付预览

至少支持页面内查看和复制：

- 多人演播样章台本
- 角色音标注表
- 演播设计稿
- 质检报告
- 交付清单

Markdown 导出可以作为 MVP 加分项。

## 验证命令

```powershell
npx tsc --noEmit
npm run build
```

## 验收标准

- [ ] 用户能用真实小说文本完成一章或半章制作。
- [ ] 文本改编、角色音标注、演播设计、质检都有真实或半真实输出。
- [ ] 未定角色音不会被强行归旁白。
- [ ] 质检能阻止 P0 进入交付。
- [ ] 用户能看到最终交付预览。
- [ ] 至少支持一次局部返工。
- [ ] 文档和 changelog 已同步。

===================================================================

# MVP 总验收标准

当以下条件全部满足时，可以认为内容创作工作台多人演播有声书 MVP 达成：

- [ ] 真实或半真实素材可以进入系统。
- [ ] 三步确认流程完整可用。
- [ ] 开工确认书能生成。
- [ ] Agent 执行链路能从开始走到完成。
- [ ] 每个 AgentRun 都能追溯输入、输出、状态和错误。
- [ ] 每个产物都用 ArtifactEnvelope 保存。
- [ ] 用户能看到样章台本、角色音表、演播设计和质检结果。
- [ ] 关键人工确认闸门没有被跳过。
- [ ] 文档、接手指南和 changelog 均同步。

===================================================================

# 推荐 commit 拆分

## Commit 1

```bash
git commit -m "docs: add content workbench mvp execution plan"
```

## Commit 2

```bash
git commit -m "feat: add mock agent execution chain"
```

## Commit 3

```bash
git commit -m "feat: add gateway task execution state"
```

## Commit 4

```bash
git commit -m "feat: ingest real content source documents"
```

## Commit 5

```bash
git commit -m "feat: connect audiobook mvp agents"
```

===================================================================

# 遇到问题时的处理原则

- 如果发现当前 UI 和编排协议冲突，先暂停实现，更新计划或协议后再继续。
- 如果真实 Agent 输出不稳定，先降级为结构化 mock，不要阻塞整条 MVP。
- 如果 Gateway 接入影响聊天主链路，立即停止并拆分独立路由。
- 如果用户确认闸门和自动执行冲突，优先保留确认闸门。
- 如果文档与代码不一致，以当前已提交代码为准，同时补 changelog 记录差异。
