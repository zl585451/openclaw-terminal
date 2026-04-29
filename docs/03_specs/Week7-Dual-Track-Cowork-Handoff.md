# Week 7 — OCT 批量生产与预算闸门 Prompt(Cursor / Claude 交接包)

> 2026-04-27 实际执行说明:
> 本文中的“预算闸门 / 范围选择 / 高成本开关”已被吸收进 Week 7 实装版本，
> 但最终没有单独按本文完整落地，而是并入 `Week7-Merged-Execution-Summary.md` 所述的合并方案。

> 状态:Week 6 已完成 — 项目素材库入口、网页上传 / 章节预览 / 删除、Delivery Markdown 导出、单章长文本切片
> 工期:**2 - 3 天**
> 核心定调:**从“单章样章”升级到“可预算、可恢复、可合并的多章生产任务”**
> 双线:Track 1 范围选择 + 交付内容定制 + 预算闸门 / Track 2 批量执行档案 + 多章合并交付
> 风险等级:高(第一次从单章工作流进入书级 / 批量级生产骨架)

---

## 〇、Week 7 总目标

Zilong 一句话验收:**"上传一本 100 万字小说后,我能选择第 1-10 章或全书,勾选本次要交付哪些内容,开工前看到预算,确认后系统逐章处理,失败不拖垮整批,最后能导出已完成章节合集和失败清单。"**

Week 7 不追求“全书智能制作终局版”。本周目标是先把系统从单章 demo 变成生产团队能理解、能控成本、能恢复的批量任务雏形。

具体:

1. 新建任务第 1 步支持从项目素材库选择一本书,并定义处理范围:单章 / 连续章节 / 全书 / 自定义章节。
2. 新建任务阶段新增“交付内容选择”,让用户决定要跑哪些 Agent / 产出哪些文件。
3. 开工前必须显示预算估算:章节数、总字数、预计调用次数、预计耗时、预计费用区间、费用上限。
4. BGM / SFX / CV 演播设计必须做成可选项,批量任务默认不强制全跑。
5. Gateway 侧新增批量任务执行档案,每章每个 Agent 的输入摘要、输出、状态、费用估算都落盘。
6. 批量任务按章节逐个执行,某章失败后记录失败并继续后续章节。
7. 完成后支持多章 Markdown 合集导出、失败章节清单导出、角色音汇总初版。

---

## 〇.5、Zilong 验收时只做 4 件事

1. 在 `项目素材库` 上传或选择一本已切章的小说。
2. 进入新建任务,选择 `第 1-10 章`,切换交付内容模式,观察预算是否实时变化。
3. 确认开工,看到批量进度页按章节推进;中间失败章节不应阻断整批。
4. 导出“已完成章节 Markdown 合集”和“失败章节清单”,用文本编辑器打开检查内容。

其他 Cursor 自行完成,**不要让 Zilong 跑终端、装依赖、手改 config**。

---

## 〇.6、Cursor 必须遵守的 8 条铁律

1. **不把多章文本拼成一个超大 prompt**。批量能力必须按章节 / 批次拆开执行。
2. **不动 ai_library 后端**。Week 7 继续只消费现有书库 API 与 Electron IPC。
3. **不把 BGM/SFX 当作默认必跑项**。批量范围大于 10 章时默认关闭,用户手动开启才跑。
4. **预算闸门必须在开工前出现**。哪怕是估算,也要让用户看到成本区间和费用上限。
5. **每章执行结果必须落盘**。刷新、重启、单章失败后,不能只靠内存状态。
6. **失败章节必须可跳过、可重跑**。一章失败不能拖垮整个批量任务。
7. **最终导出基于结构化产物合并**。不要让模型重新读全书来写汇总。
8. **保持单章工作台可用**。Week 7 的批量能力不能破坏 Week 6 的单章样章流程。

---

## 〇.7、保护清单

沿用 Week 1-6 禁区。Week 7 新增保护:

1. `textRewriterAgent.js` 的单章切片接口保持不变。
2. `DeliveryPreview` 的单章导出能力保持可用。
3. `LibraryView` 仍作为项目素材库入口,不要退回工作台 tab。
4. `agentRunner.js / mock_execution.js / llmClient.js` 若必须动,必须先写清楚原因;优先新增批量 runner,不要重写旧 runner。

---

# Track 1 — 范围选择、交付内容定制、预算闸门

## 1 总目标

让用户在开工前完成三件事:

1. 选定一本书和章节范围。
2. 选择本次要交付哪些内容。
3. 看懂预算,设置费用上限,再确认开工。

这一步的产品心智是:**制作团队可控地购买算力和产物**,不是“AI 默认什么都全跑”。

## 1 文件清单

预计:

- 修改:`src/modules/script-adapter/ScriptAdapterApp.tsx`(新建任务第 1/2 步升级)
- 新建:`src/modules/script-adapter/services/batchBudget.ts`(预算估算前端纯函数)
- 新建:`src/modules/script-adapter/types/batch.ts`(范围、交付选项、预算、批量任务类型)
- 新建:`src/modules/script-adapter/ui/Create/RangePicker.tsx`
- 新建:`src/modules/script-adapter/ui/Create/DeliveryOptionsPanel.tsx`
- 新建:`src/modules/script-adapter/ui/Create/BudgetGatePanel.tsx`
- 修改:`src/modules/script-adapter/styles/scriptAdapter.module.css`
- 修改:`src/types/electronAPI.ts`
- 修改:`electron/preload.ts`
- 修改:`electron/main.ts`(批量任务 IPC 桥,只代理 Gateway / 本地存储,不接 ai_library 新接口)
- 新建:`docs/05_changelog/2026-04-XX-script-adapter-budgeted-batch-task.md`

---

## 1.1 — 范围选择 RangePicker

### 目标

在新建任务第 1 步,用户选中书后,不再只能选一个章节,而是可以定义范围。

范围模式:

1. `single`:单章
2. `range`:连续章节,如第 1-10 章
3. `all`:全书
4. `custom`:自定义勾选若干章节

### 类型建议

```typescript
export type ChapterRangeMode = 'single' | 'range' | 'all' | 'custom';

export interface ChapterRangeSelection {
  mode: ChapterRangeMode;
  bookId: string;
  chapterIndexes: number[];
  startChapterIndex?: number;
  endChapterIndex?: number;
  totalChars: number;
  chapterCount: number;
}
```

### UI 要点

1. 默认模式:`single`,保持 Week 6 样章体验。
2. 当章节数 > 1 时显示 `连续章节` 和 `全书`。
3. `range` 模式用两个 select:起始章 / 结束章。
4. `custom` 模式用可滚动章节列表 + checkbox,不要一次铺满页面。
5. 右侧实时显示:
   - 已选章节数
   - 预计总字数
   - 最长单章字数
   - 是否包含超过 12000 字章节

### Done criteria

- 可选第 1 章、第 1-10 章、全书。
- 选错范围(起始 > 结束)时 UI 自动纠正或提示。
- 章节数、总字数实时更新。
- 没有章节数据时显示“请先上传并切章”。

---

## 1.2 — 交付内容选择 DeliveryOptionsPanel

### 目标

让用户在开工前选择要跑哪些产物,并让预算随选项变化。

### 交付模式

提供 4 个模式:

1. `经济模式`
   - 文本改编
   - 基础角色音表
   - Markdown 台本

2. `标准模式`
   - 文本改编
   - 角色音标注
   - 质检报告
   - Markdown 台本
   - 失败章节清单

3. `制作增强模式`
   - 文本改编
   - 角色音标注
   - CV 演播指导
   - BGM / SFX 建议
   - 质检报告
   - 完整交付包

4. `自定义`
   - 用户自行勾选产物项

### deliveryOptions 类型建议

```typescript
export interface DeliveryOptions {
  adaptedScript: boolean;       // 必选
  voiceRegistry: boolean;
  cvDirections: boolean;
  bgmSfx: boolean;
  qualityReview: boolean;
  finalPackage: boolean;
  failedChapterReport: boolean;
  mergedRoleRegistry: boolean;
}
```

### 默认策略

1. 单章:默认 `标准模式`,可让用户开启 `制作增强模式`。
2. 1-10 章:默认 `标准模式`,BGM/SFX 默认关闭。
3. 10 章以上:默认 `经济模式`,质检可选,BGM/SFX 默认关闭。
4. 全书:默认 `经济模式`,BGM/SFX 必须用户手动开启并二次确认。

### BGM/SFX 特别约束

1. `BGM / SFX 建议` 是高费用项,必须独立开关。
2. `CV 演播指导` 与 `BGM / SFX 建议` 在 UI 上分开显示。
3. Week 7 可以先不拆 Agent 文件,但 `performanceDesignerAgent` 或 dispatcher 必须能根据 options 少生成或跳过字段。
4. 未选择 BGM/SFX 时,最终导出不要出现空的 BGM/SFX 章节。

### Done criteria

- 用户切换交付模式后,预算估算立即变化。
- 关闭 BGM/SFX 后,执行队列不应调用对应生成逻辑。
- 导出内容按选项裁剪,不显示未选模块的空壳。

---

## 1.3 — 预算闸门 BudgetGatePanel

### 目标

批量任务启动前必须让用户看到预算,并设置费用上限。

### 预算展示字段

```text
本次任务:第 1-50 章
预计字数:31.8 万字
预计章节任务:50 个
预计模型调用:约 150-250 次
预计耗时:1.5-4 小时
预计费用:约 ¥42-¥120
费用上限:¥80
超出后:自动暂停并保留已完成章节
```

### BudgetEstimate 类型建议

```typescript
export interface BudgetEstimate {
  chapterCount: number;
  totalChars: number;
  estimatedCalls: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedMinCostCny: number;
  estimatedMaxCostCny: number;
  estimatedDurationMinutesMin: number;
  estimatedDurationMinutesMax: number;
  expensiveOptions: Array<'bgmSfx' | 'qualityReview' | 'cvDirections'>;
}
```

### 估算规则 MVP

先做前端纯函数估算,不用追求精确:

1. 中文 token 粗估:`chars / 1.8`
2. 文本改编:
   - 每章至少 1 次
   - 每 3500 字增加 1 次 chunk 调用
3. 角色音:
   - 每章 1 次或每批次 1 次,Week 7 建议每章 1 次,后续优化
4. BGM/SFX:
   - 只有勾选时每章 1 次
5. 质检:
   - 只有勾选时每章 1 次
6. 打包:
   - 纯 JS,不计模型费用

### 价格表

Week 7 先内置本地估算表,后续再接设置面板:

```typescript
export interface ModelPriceProfile {
  model: string;
  inputPerMillionTokensCny: number;
  outputPerMillionTokensCny: number;
  latencyPerCallSecondsMin: number;
  latencyPerCallSecondsMax: number;
}
```

如果当前 provider 价格未知:

1. 显示“费用未知,仅显示调用次数和 token 估算”。
2. 不阻止执行。
3. 仍允许用户设置“最大调用次数”。

### 成本闸门规则

1. 当估算费用 > 50 元时,必须显示高成本提示。
2. 当章节数 > 10 且 BGM/SFX 开启时,必须提示“该项会显著增加费用”。
3. 用户必须点击 `确认预算并开工` 才能启动批量任务。
4. 执行中累计估算超过费用上限时,自动暂停。

### Done criteria

- 切换章节范围和交付选项,预算数字实时变化。
- 关闭 BGM/SFX 后,预算明显下降。
- 费用上限可设置。
- 高成本任务需要明确确认。

---

## 1.4 — 批量任务创建 IPC

### 目标

前端确认预算后,通过 Electron IPC 创建批量任务。

### IPC 建议

```typescript
window.electronAPI.scriptAdapterBatch.create({
  bookId,
  rangeSelection,
  deliveryOptions,
  budgetLimitCny,
  estimate,
});

window.electronAPI.scriptAdapterBatch.get(batchTaskId);
window.electronAPI.scriptAdapterBatch.list();
window.electronAPI.scriptAdapterBatch.pause(batchTaskId);
window.electronAPI.scriptAdapterBatch.resume(batchTaskId);
window.electronAPI.scriptAdapterBatch.retryChapter(batchTaskId, chapterIndex);
```

### Done criteria

- 前端能创建 batch task。
- 返回 `batchTaskId`。
- 创建后跳转到批量进度页。

---

# Track 2 — 批量执行档案、多章合并、恢复与导出

## 2 总目标

让批量任务真正跑得住:

1. 每章有执行档案。
2. 每个 Agent 的输入摘要、输出、状态、费用估算可追踪。
3. 失败章节不阻断整批。
4. 多章结果按结构化 artifact 合并,不让模型重新读全书。
5. 刷新 / 重启后能恢复进度。

## 2 文件清单

预计:

- 新建:`oct-gateway/script_adapter/batch/batchRunner.js`
- 新建:`oct-gateway/script_adapter/batch/batchStore.js`
- 新建:`oct-gateway/script_adapter/batch/batchMerger.js`
- 新建:`oct-gateway/script_adapter/batch/budgetLedger.js`
- 修改:`oct-gateway/index.js` 或 script adapter method registry(新增 batch 方法)
- 修改:`electron/main.ts`(转发 batch IPC 到 Gateway 或本地 store)
- 新建:`src/modules/script-adapter/ui/Batch/BatchRunView.tsx`
- 新建:`src/modules/script-adapter/services/batchExecution.ts`
- 新建:`oct-gateway/test/batchStore.test.js`
- 新建:`oct-gateway/test/batchMerger.test.js`
- 新建:`docs/05_changelog/2026-04-XX-script-adapter-batch-runner.md`

---

## 2.1 — 执行档案模型

### 目标

每章不是“跑完就丢”,而是形成可恢复的章节执行档案。

### BatchTask 类型建议

```javascript
{
  batchTaskId: "batch-...",
  bookId: "book-...",
  bookTitle: "长夜未瞑",
  rangeLabel: "第 1-10 章",
  chapterIndexes: [0,1,2,3,4,5,6,7,8,9],
  deliveryOptions: {},
  budget: {
    estimate: {},
    limitCny: 80,
    actualCny: 0,
    estimatedCny: 0
  },
  status: "pending|running|paused|completed|failed|cancelled",
  createdAt: "",
  updatedAt: "",
  chapterRuns: []
}
```

### ChapterRun 类型建议

```javascript
{
  chapterRunId: "chapter-run-...",
  chapterIndex: 0,
  chapterTitle: "第 1 章",
  sourceSnapshot: {
    bookId: "",
    chapterIndex: 0,
    charCount: 8200,
    hash: "sha256...",
    textRef: "library://bookId/chapter/0"
  },
  status: "pending|running|completed|failed|skipped",
  currentAgentId: "",
  startedAt: "",
  completedAt: "",
  error: "",
  retryCount: 0,
  agentRuns: [],
  artifacts: {}
}
```

### AgentRunRecord 类型建议

```javascript
{
  agentId: "adapter.audiobook_text_rewriter@1.0",
  status: "pending|running|completed|failed|skipped",
  inputSummary: {
    sourceChars: 8200,
    artifactTypes: [],
    deliveryOptions: {}
  },
  outputArtifactId: "artifact-...",
  model: "deepseek-v4",
  estimatedInputTokens: 0,
  estimatedOutputTokens: 0,
  actualInputTokens: null,
  actualOutputTokens: null,
  estimatedCostCny: 0,
  actualCostCny: null,
  startedAt: "",
  completedAt: "",
  error: ""
}
```

### 存储位置

MVP 可先用 JSON 文件,不必一上来 SQLite:

```text
userData/script-adapter/batch-runs/{batchTaskId}/batch.json
userData/script-adapter/batch-runs/{batchTaskId}/chapters/{chapterIndex}.json
userData/script-adapter/batch-runs/{batchTaskId}/artifacts/{chapterIndex}/{artifactType}.json
```

后续 Week 8 再迁 SQLite。

### Done criteria

- 创建 batch task 后磁盘出现 batch.json。
- 每章完成后写入 chapter run 文件和 artifacts。
- 关闭应用再打开,可以 list 到历史 batch task。

---

## 2.2 — BatchRunner

### 目标

用现有单章 Agent pipeline 逐章执行,并根据 deliveryOptions 裁剪 Agent 队列。

### 执行顺序 MVP

```text
每章:
1. 从 AI.library 获取章节正文
2. textRewriterAgent 改编台本(必跑)
3. voiceClassifierAgent 角色音(按 options)
4. performanceDesignerAgent:
   - cvDirections 或 bgmSfx 任一开启才跑
   - options 传入 agent,让它少生成或少保存字段
5. qualityReviewerAgent(按 options)
6. deliveryPackagerAgent(纯 JS,按 options 生成清单)
7. 保存 ChapterRun
```

### 失败策略

1. 单章某个必需 Agent 失败:
   - 该章 `failed`
   - 写入 error
   - 继续下一章
2. 可选 Agent 失败:
   - 记录该 Agent failed
   - 产物中标记缺失
   - 该章仍可 completed_with_warnings(如果类型未定义,先用 completed + metrics.warning)
3. 费用超限:
   - 当前 Agent 完成后暂停
   - batch status = paused
   - 不启动下一章

### 并发策略

Week 7 建议默认串行,最多允许并发 2。

原因:

1. 成本更可控。
2. provider 限流风险低。
3. 更容易恢复与排错。

### Done criteria

- 选择第 1-3 章可逐章跑完。
- 第 2 章故意失败时,第 3 章仍继续。
- 费用上限触发后,任务进入 paused。
- 可 resume 后继续未完成章节。

---

## 2.3 — 批量进度页 BatchRunView

### 目标

让制作团队看到整批任务的生产状态,而不是盯着单章执行卡。

### UI 信息架构

顶部:

```text
长夜未瞑 · 第 1-10 章有声书制作
进度:7/10 完成 · 1 失败 · 2 待处理
预算:已估 ¥18.2 / 上限 ¥50
预计剩余:约 24 分钟
[暂停] [继续] [导出已完成] [导出失败清单]
```

中部章节表:

| 章节 | 字数 | 状态 | 当前 Agent | 费用 | 操作 |
|------|------|------|------------|------|------|
| 第 1 章 | 8200 | completed | - | ¥1.20 | 查看 / 导出 |
| 第 2 章 | 9100 | failed | textRewriter | ¥0.80 | 重跑 |
| 第 3 章 | 7600 | running | voiceClassifier | ¥0.40 | 查看日志 |

底部:

1. 失败原因列表
2. 已生成产物统计
3. 交付内容开关摘要

### Done criteria

- 批量任务开始后自动进入进度页。
- 刷新页面后能重新打开进度页。
- 可以重跑失败章节。
- 可以导出已完成章节合集。

---

## 2.4 — 多章合并 batchMerger

### 目标

按结构化产物合并,不重新让模型读全书。

### 合并产物

1. `adapted_script_book.md`
   - 按章节顺序拼接每章台本
   - 每章保留标题
   - segmentId 增加章节前缀或保持章节内编号

2. `voice_registry_book.json`
   - 合并所有章节角色音表
   - 同名角色合并 appearanceCount
   - voiceHint 冲突时保留 variants,标记 `needs_review`

3. `performance_design_book.md`
   - 只有用户选了 cvDirections / bgmSfx 才导出
   - 按章节整理

4. `review_summary_book.md`
   - 只有用户选了 qualityReview 才导出
   - 按 P0/P1/P2 汇总问题

5. `failed_chapters.md`
   - 所有失败 / 跳过章节
   - 错误原因
   - 是否可重跑

### Done criteria

- 3 章完成后可导出 Markdown 合集。
- 未选择 BGM/SFX 时,导出里没有演播设计章节。
- voice registry 可合并重复角色。
- 失败章节清单可单独导出。

---

## 2.5 — 费用账本 budgetLedger

### 目标

把预算从“开工前估算”推进到“执行中累计”。

### 数据规则

1. 如果 LLM 返回 usage,记录 actual tokens。
2. 如果没有 usage,按输入/输出长度估算。
3. 每个 AgentRunRecord 都记录 estimatedCostCny。
4. BatchTask 聚合 actual / estimated。
5. 超过 budgetLimitCny 自动暂停。

### Done criteria

- 每章完成后,批量页预算数字增加。
- 超过上限后不启动下一章。
- 导出失败清单中包含“因预算暂停”的原因。

---

# Week 7 验收标准

## Track 1 验收

- [ ] 新建任务可选择单章 / 连续章节 / 全书 / 自定义章节
- [ ] 可选择经济 / 标准 / 制作增强 / 自定义交付内容
- [ ] BGM/SFX 是独立开关,批量任务默认关闭
- [ ] 预算随范围和交付内容实时变化
- [ ] 可设置费用上限
- [ ] 开工前必须确认预算
- [ ] `npx tsc --noEmit` 通过

## Track 2 验收

- [ ] 创建 batch task 后磁盘有执行档案
- [ ] 第 1-3 章可逐章跑完
- [ ] 单章失败后后续章节继续
- [ ] 可暂停 / 继续 / 重跑失败章节
- [ ] 刷新后批量任务状态仍可恢复
- [ ] 可导出已完成章节 Markdown 合集
- [ ] 可导出失败章节清单
- [ ] BGM/SFX 未选时,不调用对应生成逻辑,导出也不出现空段落
- [ ] `node oct-gateway/test/batchStore.test.js` 通过
- [ ] `node oct-gateway/test/batchMerger.test.js` 通过

---

# 整合验收(Zilong 10 分钟跑通)

```text
1. 打开 OCT → Chat 顶部点“项目素材库”
2. 上传一本小说或选择已有书
3. 返回内容创作 → 新建任务
4. 第 1 步选择这本书 → 范围选“第 1-10 章”
5. 第 2 步选择“标准模式”,确认 BGM/SFX 默认关闭
6. 查看预算:章节数、总字数、调用次数、费用区间、费用上限
7. 设置费用上限,点击“确认预算并开工”
8. 进入批量进度页,看到章节逐个推进
9. 任意失败章节可重跑,失败不影响后续章节
10. 导出已完成章节 Markdown 合集 + 失败章节清单
```

---

# 留 Week 8+

1. **BookBible 书级上下文**
   - 主要人物表
   - 地名 / 术语表
   - 角色音一致性规则
   - 改编风格规则
   - 每章完成后回写新增角色 / 术语

2. **跨章节一致性校正**
   - 同名角色 voiceHint 冲突检测
   - 人名 / 地名变体检测
   - 旁白风格漂移检测

3. **全书质检**
   - 不逐章看小问题,而是检查全书级一致性
   - 抽样 + 结构化统计

4. **更细的 Agent 拆分**
   - performanceDesigner 拆成 CV direction 与 BGM/SFX 两个 Agent
   - qualityReview 支持抽检 / 全检模式

5. **SQLite 持久化**
   - JSON store 可跑 MVP
   - SQLite 负责长期历史、查询、筛选、统计

6. **成本策略增强**
   - 不同模型价目表设置
   - 经济模型 / 高质量模型混用
   - 先试跑 3 章再估全书

7. **docx / 制作团队交付包**
   - Markdown 合集先够用
   - 后续导出 docx、xlsx 角色表、zip 交付包

---

# 给 Cursor 的协作约定

## 时间安排建议

第 1 天:

- 上午:Track 1.1 范围选择 + 章节统计
- 下午:Track 1.2/1.3 交付内容选择 + 预算闸门

第 2 天:

- 上午:Track 2.1/2.2 batchStore + batchRunner MVP
- 下午:Track 2.3 批量进度页 + 暂停/继续/重跑

第 3 天:

- 上午:Track 2.4/2.5 多章合并 + 费用账本
- 下午:测试、changelog、真实样例、验收录屏/截图

## 必须遵守

1. **Zilong 不开终端**。所有启用方式必须在 UI 内完成或写成“打开哪里点哪里”。
2. **预算和范围必须先于执行**。不要先跑再告诉用户花了多少钱。
3. **BGM/SFX 默认可选且批量默认关闭**。这是费用控制点。
4. **每章都要有本地执行档案**。没有持久化就不算 Week 7 完成。
5. **不要承诺全书质量一致性已完美解决**。Week 7 只做生产骨架,一致性增强留 Week 8。
6. **不要让全书任务一次性并发打爆 provider**。默认串行,最多并发 2。

## 卡壳速查

1. **AI.library 没有范围 API** → 用现有 chapters + chapter API 循环取章,不要改 ai_library 后端。
2. **某章超过 12000 字** → 标记该章 failed 或 split_required,继续后续章节;Week 8 再做章内二级策略。
3. **provider 不返回 usage** → 用字符数估算 token 和费用,并标记为 estimated。
4. **预算价格未知** → 显示 token / 调用次数估算,费用显示“未知”,允许用户设置最大调用次数。
5. **性能太慢** → 优先做暂停/继续和进度可见,不要盲目提高并发。
6. **合并角色表冲突** → 不自动覆盖,保留 variants 并标记 needs_review。

## Cursor 完成后回报清单

- [ ] Track 1 + Track 2 commit 列表
- [ ] 预算面板截图:关闭 / 开启 BGM/SFX 后费用变化
- [ ] 批量进度页截图:运行中、失败、完成三种状态
- [ ] 本地执行档案目录示例
- [ ] 一份多章 Markdown 合集真实文件
- [ ] 一份失败章节清单真实文件
- [ ] 测试命令和结果

---

## 相关文档

- Week 6 计划:`docs/03_specs/Week6-Dual-Track-Cowork-Handoff.md`
- Week 5 计划:`docs/03_specs/Week5-Dual-Track-Cowork-Handoff.md`
- AI.library 接口:`docs/02_architecture/AI_LIBRARY_OCT.md`
- 内容创作主线:`docs/03_specs/内容创作工作台/`
- Gateway 执行桥:`docs/03_specs/内容创作工作台/内容创作Gateway执行桥接协议.md`
- 多人演播团队编排:`docs/03_specs/内容创作工作台/多人演播有声书Agent团队编排规范.md`
