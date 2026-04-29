# 2026-04-26 Week 1 收尾修复(类型对齐 / CSS 去重 / 测试默认行为)

## 背景

Week 1 双线(Track A 前端 mock 执行链路、Track B Gateway summarizer 服务)已经在 Cursor 中完成主体,Cowork 端进行了一次完整审查。

审查里有 3 处与"未来计划/原始约定"违背的细节,本次直接收尾,避免后续踩坑。其余偏差(闸门 banner、计时器、重试按钮、severity 色块缺失等)属于"未做",不与未来违背,统一放进 Week 2 计划。

## 变更

### 1. ArtifactType 命名对齐(P0)

之前 Cursor 在 `src/modules/script-adapter/types/execution.ts` 新增了一套 `ArtifactType = 'AdaptedScript' | 'VoiceRoleMarkers' | 'PerformanceDesign' | 'ReviewReport' | 'DeliveryPackage'` PascalCase 枚举,与现有 `src/modules/script-adapter/types/artifact.ts` 的 `ArtifactType = 'adapted_script' | 'voice_registry' | 'performance_design' | 'review_report' | 'final_package' | ...` snake_case 枚举同名但取值完全不同。

后果:

1. `import { ArtifactType }` 不指定路径会拿到不同类型,潜在歧义。
2. Week 5 真实 Agent 接入后,store 的 stage / artifact 与 execution 链路不能共用同一个枚举,需要额外做命名转换。
3. `mockAgentExecution.ts` 里 `inputArtifactTypes: ['SourceDocument', ...]` 的字符串没有任何 enum 约束,失去类型保护。

修复方式:

1. `types/execution.ts` 移除自定义 `ArtifactType`,改为 `import type { ArtifactType } from './artifact';` 并 re-export。
2. `services/mockAgentExecution.ts` 全部 5 处 `envelope('AdaptedScript', ...)` 等 PascalCase 改为 `envelope('adapted_script', ...)` snake_case。
3. `services/mockAgentExecution.ts` 中 AGENTS 列表里的 `inputArtifactTypes / outputArtifactTypes` 同步改为 snake_case。`SourceDocument / AnalysisReport / ModificationStrategy` 改成 `source_document / analysis_report / modification_strategy`(目前不在枚举内,Week 4+ 真实接入时再加入 `types/artifact.ts`)。
4. `ui/Workbench/ArtifactPreview.tsx` 4 处 `if (artifact.artifactType === 'XXX')` 改 snake_case。
5. `oct-gateway/script_adapter/mock_execution.js` 同步修改,确保 Gateway 推送的 `script-adapter` 事件 `artifactType` 字段与前端判断分支对齐。

### 2. CSS `.executionHeroCard` 重复定义清理(P2)

`src/modules/script-adapter/styles/scriptAdapter.module.css` 第 1974 行与第 2681 行(原行号)各定义了一份 `.executionHeroCard`,字段不完全一致。后者覆盖前者,前者死代码。

本次删除前者(11 行),保留后者(更精细的版本,显式指定 220px 副栏宽度、24px 内边距、定位渐变中心)。

### 3. summarizer 测试默认行为反转(P2)

`oct-gateway/test/summarizer.test.js` 原来默认会跑 live LLM 测试(消耗 API 配额),需要 `SKIP_LIVE_TESTS=1` 才跳过。这与 Cowork 审查时的约定"到这一步停下,等 Zilong 配置 key 再跑"不一致。

修复:

1. 默认只跑离线测试(chunker 三种 + summarize 输入超长校验,共 4 项)。
2. 想跑真实 LLM 调用,显式设置 `RUN_LIVE_TESTS=1`(PowerShell:`$env:RUN_LIVE_TESTS=1`)。
3. 在文件头加注释,说明触发方式与配置依赖。

## 不动的事项(已审查、与未来不冲突,留 Week 2/3 处理)

1. Gateway 桥接(`scriptAdapter.run.start` / `mock_execution.js` / preload.ts / main.ts 改动 / `services/gatewayExecution.ts`):属于提前完成 Week 3 的"Gateway 最小执行状态机",虽然违反 Week 1"纯前端 mock"的边界,但跟 Week 3 计划方向一致,保留。Week 2 时把这套从 mock 升级成真正的状态机骨架。
2. 闸门 Banner / 总耗时计时器 / 失败重试按钮 / severity-badge / role-category 色块:Week 1 视觉缺口,放 Week 2 Track A 收尾。
3. `abortPipeline` 全局单例:MVP 单任务无碍,Week 5 多任务时再重做。

## 验证

```powershell
# 类型检查
npx tsc --noEmit

# 离线测试(默认行为,无 API 消耗)
node oct-gateway/test/summarizer.test.js

# 完整测试(含 live LLM,~0.05 元/次)
$env:RUN_LIVE_TESTS=1
node oct-gateway/test/summarizer.test.js

# 视觉验证
npm run build
npm run start
# 在工作台点"确认开工",确认 5 个 Agent 串行跑通,产物预览 5 种分支正常渲染
```

## 影响

1. 前端与 Gateway 端的 mock 数据 artifactType 取值统一,后续接真实 store / 持久化时不再需要命名 bridge。
2. `npx tsc --noEmit` 应该继续通过(类型 import 路径变化但 alias re-export 保留对外 API)。
3. CI 跑 `node oct-gateway/test/summarizer.test.js` 默认只跑离线 4 项,不再消耗 API 配额。

## 关联

- Week 1 双线 Cowork 交接包:`docs/03_specs/Week1-Dual-Track-Cowork-Handoff.md`(计划文件)
- Week 2 双线 Cowork 交接包（后已归档）:`docs/_archive/process_handoffs/cowork-week2/Week2-Dual-Track-Cowork-Handoff.md`
- Week 1 主交付 changelog:
  - `2026-04-26-内容创作前端Mock执行链路.md`
  - `2026-04-26-内容创作执行状态迁移Store.md`
  - `2026-04-26-内容创作Gateway执行桥接.md`
  - `2026-04-26-Gateway摘要服务TrackB.md`
  - `2026-04-26-script-adapter-mock-execution.md`
