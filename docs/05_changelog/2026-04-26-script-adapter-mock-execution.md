# 2026-04-26 Week 1 Track A — 前端 mock 执行链路闭环

## 背景

Week 1 Track A 目标是实现用户从"开工确认书"点击"确认开工"后，看到 5 个 Agent 串行执行的进度可视化，每个 Agent 产出 mock 产物，最后展示交付预览。全程纯前端 mock，不连 Gateway。

## 新建文件

| 文件 | 说明 |
|------|------|
| `src/modules/script-adapter/types/execution.ts` | Agent 执行协议类型定义 |
| `src/modules/script-adapter/services/mockAgentExecution.ts` | Mock Agent 管线执行器 |
| `src/modules/script-adapter/ui/Workbench/ExecutionView.tsx` | 执行进度主视图 |
| `src/modules/script-adapter/ui/Workbench/AgentRunCard.tsx` | 单个 Agent 运行卡片（默认折叠） |
| `src/modules/script-adapter/ui/Workbench/ArtifactPreview.tsx` | 产物预览（支持 compact/full 模式） |
| `src/modules/script-adapter/services/gatewayExecution.ts` | Gateway 执行桥接（超出 Week 1 计划） |
| `src/modules/script-adapter/store/scriptAdapterStore.ts` | 执行状态管理 |
| `src/modules/script-adapter/store/actions.ts` | 执行状态 action |

## 修改文件

| 文件 | 变更 |
|------|------|
| `src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx` | 接入执行链路，增加 briefing/executing 状态机，Gateway fallback 逻辑 |
| `src/modules/script-adapter/styles/scriptAdapter.module.css` | 新增 execution view、agent card、artifact preview、gate 等 70+ 样式类 |

## TypeScript 类型契约

### 核心类型

- **AgentExecutionPlan** — 执行计划（planId, taskId, agents, reviewGates, createdAt）
- **PlannedAgent** — 单个 Agent 计划（agentId, displayName, order, input/outputArtifactTypes, parallelizable, roleSummary）
- **AgentRun** — 单次 Agent 运行实例（runId, status, startedAt/completedAt, durationMs, progressSummary/Percent, outputArtifactIds, error）
- **ExecutionStageStatus** — `'pending' | 'running' | 'completed' | 'failed' | 'awaiting_review'`
- **ArtifactEnvelope\<T\>** — 产物信封（artifactId, artifactType, producedBy, title, summary, payload, metrics）
- **ArtifactType** — `'AdaptedScript' | 'VoiceRoleMarkers' | 'PerformanceDesign' | 'ReviewReport' | 'DeliveryPackage'`
- **ReviewGate** — 人工确认闸门（gateId, afterAgentId, gateType, status pending/approved/rejected）
- **TaskExecutionSheet** — 任务执行单（plan + runs + artifacts + gates + overallStatus）

### Payload 类型

- **AdaptedScriptPayload** — 样章台本（segments: AdaptedSegment[]，含 type narration/dialogue/inner_monologue）
- **VoiceRoleMarkersPayload** — 角色音标注（registry: VoiceRoleEntry[]，含 category narrator/main/support/unresolved/sfx）
- **PerformanceDesignPayload** — 演播设计（bgmTrack, sfxList, cvDirections）
- **ReviewReportPayload** — 质检报告（conclusion pass/pass_with_changes/reject, issues: ReviewIssue[] 含 severity P0/P1/P2）
- **DeliveryPackagePayload** — 交付包（manifest 文件清单, versionTag, notes）

## 已知限制

1. **全 mock**：5 个 Agent 产出的 payload 均为前端写死的样本数据，不调用真实 LLM
2. **Gateway 未接**：虽然 `gatewayExecution.ts` 提供了桥接入口，但 Gateway 端目前返回 mock 数据，`useMock: true`
3. **真实 Agent 未接**：Week 5 才会接入真实 Agent 调用 summarizer 处理 8 万字章节
4. **无持久化**：刷新页面后执行状态丢失（Week 3 计划做）
5. **无断点续传**：取消后无法从断点恢复（Week 4 计划做）
6. **闸门自动通过**：MVP 阶段闸门在 800ms 后自动 approve，不实现真实人工交互

## 验证

已通过：

```powershell
npx tsc --noEmit
npm run build
```
