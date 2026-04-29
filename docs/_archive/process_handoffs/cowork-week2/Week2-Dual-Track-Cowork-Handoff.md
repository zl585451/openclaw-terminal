# Week 2 — OCT 双线推进 Prompt(Cursor/Codex 交接包)

> 状态:Week 1 已完成,主体功能跑通,3 处类型/测试/CSS 收尾修复也已落地
> 适用:Cursor / Codex 直接喂入执行
> 三线:Track A 视觉收尾 + Track B summarizer 接入 toolLoop + Track C Gateway 状态机骨架收编
> 工期:5-7 天
> 风险等级:中低(Track A 纯前端可控、Track B 改 toolLoop 路径需谨慎、Track C 是把已存在的提前实现升级,无新接口暴露)

---

## 〇、Cursor 接手 onboarding

### 项目位置

`E:\windows-window\OpenClaw-Terminal`

### 当前状态(Week 1 已完成)

1. Track A 前端 mock 执行链路:5 个 Agent 串行可视化、5 类 artifact 预览、可取消、闸门自动通过、Zustand store 全局广播
2. Track B Gateway summarizer:`chunker.js` + `summarizer.js` + `summarize_text` 工具注册 + 单元测试脚本
3. Cursor 提前做了 Gateway 执行桥接(`scriptAdapter.run.start` 路由 + `oct-gateway/script_adapter/mock_execution.js` + electron preload/main 转发),Week 2 在此基础上升级,而不是推翻

### 必读文档(按顺序)

1. Week 1 上下文：`docs/05_changelog/2026-04-26-week1-typing-and-test-fixups.md`（仓库内未保留 `Week1-Dual-Track-Cowork-Handoff.md` 副本）
2. `docs/03_specs/内容创作工作台/00_项目接手指南.md`
3. `docs/_archive/historical_plans/content_creation/内容创作工作台MVP执行计划.md`（历史排期，已归档）
4. `docs/02_architecture/summarizer-service.md`
5. `docs/02_architecture/内容创作Agent协议与编排规范.md`

### 保护清单(不要动,除非本计划明确指出)

1. `src/ui/chat/`(主对话 UI)
2. `src/hooks/useTypewriter.ts`、`src/hooks/useMessages.ts`、`src/hooks/useWebSocket.ts`
3. `src/core/streamRouter`、`src/core/turnFSM`、`src/core/blockRouter`
4. `oct-gateway/ai.js`、`oct-gateway/runtime/`(Week 0 改完已稳定)
5. `electron/main.ts` 的现有 IPC handler 和 `handleMessage` switch(只允许在尾部追加新 case,不动现有逻辑)
6. `electron/preload.ts` 的现有 electronAPI 字段(只允许追加,不修改/删除)
7. `docs/03_specs/内容创作工作台/` 全部规则文档(只增不改)

### 三线说明

```
Track A (视觉收尾)         Track B (summarizer 接 toolLoop)    Track C (Gateway 状态机骨架)
─────────────              ────────────────────────             ──────────────
闸门 Banner                 工具结果超阈值时 summarize           mock_execution.js 拆 3 层
总耗时计时器                fallback 到硬截断                    Run/Artifact 内存存储
重试按钮                   配置项 + 开关                        cancel 信号
severity / role 色块        测试覆盖                            scriptAdapter.run.cancel
                                                              scriptAdapter.run.list

           ↓ Week 3 汇合 ↓
   Gateway 真实接入文件解析、SourceDocument 持久化
```

Track A 与 Track B 互不依赖,可并行做。Track C 依赖 Week 1 的 Gateway 桥接代码(已存在),不依赖 A/B。
建议顺序:**先 A(快收口) → 再 B(改 toolLoop 谨慎) → 最后 C(收编已存在的实现)**。

---

# Track A — 工作台执行链路视觉收尾

## A 总目标

补齐 Week 1 字面要求但未实现的 4 个视觉细节,让 demo 可以正式给外部演示。

## A 代码范围

- 修改:`src/modules/script-adapter/ui/Workbench/ExecutionView.tsx`
- 修改:`src/modules/script-adapter/ui/Workbench/ArtifactPreview.tsx`
- 修改:`src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`(failed 状态重试逻辑)
- 修改:`src/modules/script-adapter/styles/scriptAdapter.module.css`

---

## A.1 — 闸门 Banner 视觉

### 文件

修改 `src/modules/script-adapter/ui/Workbench/ExecutionView.tsx`

### 实现要求

在 `executionAgentList` 内,根据 `sheet.gates` 里的 `afterAgentId`,动态在对应 Agent 卡片**之后**插入一个 banner 横条。

**视觉规则**:

1. 闸门状态 `pending`:横条文案 `⏸ 等待 [gateType 中文名] 确认 · 自动通过中...`,带"待审核"色彩(暖橙色背景、半透明)
2. 闸门状态 `approved`:横条文案 `✓ [gateType 中文名] 已通过`,变成绿色背景
3. 闸门状态 `rejected`:横条文案 `✗ [gateType 中文名] 未通过`,变成红色背景

**gateType 中文名映射**(写到组件顶部常量):

```typescript
const GATE_TYPE_LABEL: Record<string, string> = {
  strategy_confirmation: '修改策略',
  quality_review: '质检结果',
  target_scope_confirmation: '目标范围',
};
```

### 具体改动

在 `ExecutionView.tsx` 渲染 `sheet.plan.agents.map(...)` 时,改成对每个 agent 完成后判断是否有同 `afterAgentId` 的 gate,有的话再渲染一个 `<div className={styles.gateBanner} ...>`。

可以这样实现(在 agent 列表内插入 banner):

```tsx
<div className={styles.executionAgentList}>
  {sheet.plan.agents.map((agent) => {
    const run = sheet.runs.find((item) => item.agentId === agent.agentId);
    const artifact = run?.outputArtifactIds[0] ? sheet.artifacts[run.outputArtifactIds[0]] : undefined;
    const gate = sheet.gates.find((g) => g.afterAgentId === agent.agentId);
    return (
      <Fragment key={agent.agentId}>
        {run ? (
          <AgentRunCard agent={agent} run={run} artifact={artifact} />
        ) : null}
        {gate ? (
          <div
            className={`${styles.gateBanner} ${
              gate.status === 'approved'
                ? styles['gateBanner--approved']
                : gate.status === 'rejected'
                  ? styles['gateBanner--rejected']
                  : styles['gateBanner--pending']
            }`}
          >
            <span>
              {gate.status === 'approved' ? '✓' : gate.status === 'rejected' ? '✗' : '⏸'}
            </span>
            <strong>
              {GATE_TYPE_LABEL[gate.gateType] ?? gate.gateType}
              {gate.status === 'approved' ? ' 已通过' : gate.status === 'rejected' ? ' 未通过' : ' 确认'}
            </strong>
            <em>
              {gate.status === 'pending' ? '自动通过中...' : gate.description}
            </em>
          </div>
        ) : null}
      </Fragment>
    );
  })}
</div>
```

需要 `import { Fragment } from 'react'`。

### CSS

在 `scriptAdapter.module.css` 末尾追加:

```css
.gateBanner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  margin: 6px 0;
  border-radius: 8px;
  font-size: 13px;
  border: 1px solid transparent;
  transition: background 0.3s ease, border-color 0.3s ease;
}

.gateBanner span {
  font-size: 16px;
  font-weight: 600;
}

.gateBanner strong {
  font-weight: 600;
  color: #1f2937;
}

.gateBanner em {
  margin-left: auto;
  font-style: normal;
  color: #6b7280;
  font-size: 12px;
}

.gateBanner--pending {
  background: rgba(239, 159, 39, 0.10);
  border-color: rgba(239, 159, 39, 0.32);
  animation: gateBannerPulse 1.6s ease-in-out infinite;
}

.gateBanner--approved {
  background: rgba(30, 117, 91, 0.10);
  border-color: rgba(30, 117, 91, 0.32);
}

.gateBanner--rejected {
  background: rgba(190, 56, 56, 0.10);
  border-color: rgba(190, 56, 56, 0.32);
}

@keyframes gateBannerPulse {
  0%, 100% { opacity: 0.85; }
  50%      { opacity: 1; }
}
```

### 验证

- [ ] 跑执行流程,文本改编师完成后,在它和角色音统筹之间出现"⏸ 修改策略 确认 · 自动通过中..."橙色横条
- [ ] 800ms 后变成"✓ 修改策略 已通过"绿色横条
- [ ] 质检审校完成后,在它和交付打包员之间也出现"⏸ 质检结果 确认"横条

### commit

```
feat(script-adapter): gate banner inline between agents in execution view
```

---

## A.2 — 总耗时计时器

### 文件

修改 `src/modules/script-adapter/ui/Workbench/ExecutionView.tsx`

### 实现要求

1. 在组件顶部加一个本地 state `now`,用 `useEffect` + `setInterval(1000)` 每秒刷新
2. 起始时间从 `sheet.createdAt` 解析
3. 总耗时 = `now - createdAt`,显示在 `executionHeroActions` 区域(`RUNNING/COMPLETE` strong 旁边)
4. 完成或失败后停止计时器,显示**最终耗时**(取 `sheet.updatedAt - sheet.createdAt`)

### 具体改动

```tsx
import { useEffect, useState } from 'react';

export function ExecutionView({ sheet, onBackToContract }: ExecutionViewProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (sheet.overallStatus !== 'running') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sheet.overallStatus]);

  const elapsedMs = sheet.overallStatus === 'running'
    ? now - new Date(sheet.createdAt).getTime()
    : new Date(sheet.updatedAt).getTime() - new Date(sheet.createdAt).getTime();

  const elapsedLabel = formatElapsed(elapsedMs);
  // ... 其余渲染
}

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
```

把 `elapsedLabel` 渲染到 `executionHeroActions` 内,放在 `RUNNING/COMPLETE` strong 下方:

```tsx
<div className={styles.executionHeroActions}>
  <strong>{sheet.overallStatus === 'completed' ? 'COMPLETE' : 'RUNNING'}</strong>
  <small className={styles.executionElapsed}>{elapsedLabel}</small>
  ...
</div>
```

### CSS

在 `scriptAdapter.module.css` 末尾追加:

```css
.executionElapsed {
  display: block;
  font-size: 12px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}
```

### 验证

- [ ] 点确认开工后,RUNNING 下方出现 `0s`,每秒 +1
- [ ] 全部完成后停止刷新,显示总耗时(预计 ~12-18 秒,取决于 wait 时长)
- [ ] 取消执行后停止刷新,显示当前定格的耗时

### commit

```
feat(script-adapter): live elapsed timer in execution view header
```

---

## A.3 — 失败状态重试按钮

### 文件

修改 `src/modules/script-adapter/ui/Workbench/ExecutionView.tsx` 与 `WorkbenchView.tsx`

### 实现要求

1. `ExecutionView` 在 `sheet.overallStatus === 'failed'` 时显示"重试"按钮(替换"取消执行")
2. 重试按钮 onClick 调用 `props.onRetry`,从 WorkbenchView 传入
3. WorkbenchView 收到重试请求时,清掉当前 sheet 然后重新调用 `startExecution`(走和"确认开工"完全一样的路径)

### 具体改动

`ExecutionView.tsx` Props 增加 `onRetry?: () => void`:

```tsx
interface ExecutionViewProps {
  sheet: TaskExecutionSheet;
  onBackToContract: () => void;
  onRetry?: () => void;
}
```

按钮区域改成:

```tsx
{sheet.overallStatus === 'running' ? (
  <button type="button" className={styles.ghostButton} onClick={abortPipeline}>
    取消执行
  </button>
) : sheet.overallStatus === 'failed' ? (
  <button type="button" className={styles.confirmStartButton} onClick={onRetry}>
    重试
  </button>
) : null}
```

`WorkbenchView.tsx` 内传入:

```tsx
<ExecutionView
  sheet={executionSheet}
  onBackToContract={() => {
    if (currentProjectId) scriptAdapterActions.clearExecutionSheet(currentProjectId);
  }}
  onRetry={() => {
    if (currentProjectId) {
      scriptAdapterActions.clearExecutionSheet(currentProjectId);
    }
    // 等下一次 render 后再启动,确保 sheet 已经清空
    setTimeout(startExecution, 0);
  }}
/>
```

### 验证

- [ ] 在 `mockAgentExecution.ts` 临时把某个 Agent 改成 throw 模拟失败
- [ ] 失败后看到"重试"按钮
- [ ] 点重试,流程从头跑通
- [ ] 改回原版

### commit

```
feat(script-adapter): retry button on failed execution
```

---

## A.4 — severity / role-category 色块

### 文件

修改 `src/modules/script-adapter/ui/Workbench/ArtifactPreview.tsx` 与 `styles/scriptAdapter.module.css`

### 实现要求

#### A.4.1 ReviewReport 的 severity badge

把 `<strong>{issue.severity}</strong>` 改成:

```tsx
<span
  className={`${styles.severityBadge} ${styles[`severityBadge--${issue.severity.toLowerCase()}`]}`}
>
  {issue.severity}
</span>
```

#### A.4.2 VoiceRoleMarkers 的 category 色块

把 `<span>{role.category}</span>` 改成:

```tsx
<span
  className={`${styles.roleCategory} ${styles[`roleCategory--${role.category}`]}`}
>
  {ROLE_CATEGORY_LABEL[role.category] ?? role.category}
</span>
```

在文件顶部加常量:

```tsx
const ROLE_CATEGORY_LABEL: Record<string, string> = {
  narrator: '旁白',
  main: '主要',
  support: '配角',
  unresolved: '待定',
  sfx: '功能音',
};
```

### CSS

在 `scriptAdapter.module.css` 末尾追加:

```css
.severityBadge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  border: 1px solid transparent;
}

.severityBadge--p0 {
  background: rgba(190, 56, 56, 0.12);
  color: #be3838;
  border-color: rgba(190, 56, 56, 0.30);
}

.severityBadge--p1 {
  background: rgba(239, 159, 39, 0.14);
  color: #b16a00;
  border-color: rgba(239, 159, 39, 0.30);
}

.severityBadge--p2 {
  background: rgba(125, 132, 142, 0.12);
  color: #4b5563;
  border-color: rgba(125, 132, 142, 0.28);
}

.roleCategory {
  display: inline-flex;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  border: 1px solid transparent;
}

.roleCategory--narrator {
  background: rgba(125, 132, 142, 0.12);
  color: #4b5563;
  border-color: rgba(125, 132, 142, 0.30);
}

.roleCategory--main {
  background: rgba(38, 99, 209, 0.12);
  color: #1d4ed8;
  border-color: rgba(38, 99, 209, 0.30);
}

.roleCategory--support {
  background: rgba(30, 117, 91, 0.12);
  color: #1e755b;
  border-color: rgba(30, 117, 91, 0.30);
}

.roleCategory--unresolved {
  background: rgba(190, 56, 56, 0.12);
  color: #be3838;
  border-color: rgba(190, 56, 56, 0.30);
}

.roleCategory--sfx {
  background: rgba(120, 76, 200, 0.12);
  color: #6d4cb8;
  border-color: rgba(120, 76, 200, 0.30);
}
```

### 验证

- [ ] 质检报告里 P1/P2 显示成对应色块
- [ ] 角色音表里 narrator 灰、main 蓝、support 绿、unresolved 红
- [ ] compact 和 full 两种模式都能正确渲染

### commit

```
style(script-adapter): severity badges and voice role category chips
```

---

## A.5 — 文档同步

### 修改文件

1. `docs/03_specs/内容创作工作台/内容制作工作台UI结构规范.md`
   新增 "执行视图视觉规范" 章节,描述闸门 banner、计时器、severity badge、role category chip 的颜色和触发条件。

2. `docs/03_specs/内容创作工作台/00_项目接手指南.md`
   在 "当前已经落地的版本" 段落追加一行:`Week 2 视觉收尾:闸门 banner、计时器、重试、severity / role 色块`。

### 新建文件

`docs/05_changelog/2026-04-XX-script-adapter-week2-visual-polish.md`(填实际日期),包含:

1. 4 个新增视觉特性的描述
2. 新增 CSS 类清单
3. 已知限制(仍是 mock 数据,真实 Agent 接入留 Week 5)

---

## A 验收标准

- [ ] 闸门 banner 在两个 Agent 之间正确插入,pending → approved 状态切换
- [ ] 总耗时计时器每秒刷新,完成后定格
- [ ] 失败时显示重试按钮,点击重新跑通流程
- [ ] severity / role-category 色块显示正确
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` + `npm run start` 启动正常
- [ ] 文档已同步

---

# Track B — Summarizer 接入 toolLoop

## B 总目标

把 Week 1 已经做好的 `summarizer` 服务,接进 Gateway 的工具调用循环。当工具结果超过阈值时,自动 summarize,而不是只做硬截断,降低后续 LLM 调用的 context 浪费。

## B 关键约束

1. **toolLoop 路径在保护范围内**,但本任务必须改它 —— 改之前先把现有逻辑读完整,提交 PR 单独做,不和 Track A/C 混在一起
2. summarize 失败时**必须降级**到原来的硬截断,**不能让用户的工具调用失败**
3. **配置项默认关**,显式开启才生效;开启后再灰度

## B 代码范围

预计文件清单:

1. 修改:`oct-gateway/runtime/...`(toolLoop 实现位置;**先 grep 找,可能在 `tool_runner.js` / `runtime/toolLoop.js` / `index.js` 内部 helper**)
2. 修改:`oct-gateway/config.js`(新增 `TOOL_RESULT_SUMMARIZER_ENABLED` 等开关)
3. 新建:`oct-gateway/runtime/toolResultSummarizer.js`(包装函数,toolLoop 内调用此 wrapper)
4. 新建:`oct-gateway/test/toolResultSummarizer.test.js`(单元测试)
5. 修改:`docs/02_architecture/summarizer-service.md`(补 toolLoop 集成段落)

> **注意**:本计划不直接给 toolLoop 内部代码修改(因为还没读源码),Cursor 在动手前必须**先 grep 出 toolLoop 实际位置和工具结果硬截断在哪一行**,再来填这部分 spec。如果发现 toolLoop 跨多个文件,**停下来问 Zilong**。

---

## B.1 — 读 toolLoop 现状(强制第一步)

### 任务

1. `grep -rn "tool_calls" oct-gateway/` 找到 toolLoop 实际入口
2. `grep -rn "工具结果硬截断\|truncate\|recall_tool_result" oct-gateway/` 找到 Week 0 加的硬截断逻辑
3. 输出一份 markdown 简报到 `docs/07_research/2026-04-XX-toolloop-pre-summarizer.md`,内容:
   - toolLoop 入口文件 + 函数名 + 行号
   - 工具结果走过的处理链路(执行 → 截断 → 写回 messages)
   - 当前硬截断阈值与策略
   - 建议的 summarize 触发点(在哪个 step 之前/之后插入)
4. 让 Zilong 看完简报后再继续 B.2

**不要跳过这步直接改 toolLoop**。

---

## B.2 — 实现 toolResultSummarizer wrapper

### 文件

新建 `oct-gateway/runtime/toolResultSummarizer.js`

### 实现要求

```javascript
'use strict';

const { summarize } = require('../services/summarizer');
const config = require('../config');

const DEFAULT_TRIGGER_CHARS = 2400;
const DEFAULT_TARGET_LENGTH = 600;
const DEFAULT_FALLBACK_KEEP_CHARS = 1500;

/**
 * 决定是否要对工具结果做 summarize。
 *
 * @param {string} toolName
 * @param {string} resultText
 * @returns {{ shouldSummarize: boolean, reason: string }}
 */
function shouldSummarizeToolResult(toolName, resultText) {
  if (!isFeatureEnabled()) return { shouldSummarize: false, reason: 'feature_disabled' };
  if (typeof resultText !== 'string') return { shouldSummarize: false, reason: 'not_string' };
  const triggerChars = positiveInt(config.getEnvOrConfig?.('TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS'), DEFAULT_TRIGGER_CHARS);
  if (resultText.length < triggerChars) return { shouldSummarize: false, reason: 'under_threshold' };
  // 工具白名单(可选,默认全开)
  const allowList = String(config.getEnvOrConfig?.('TOOL_RESULT_SUMMARIZER_TOOLS') || '').trim();
  if (allowList && !allowList.split(',').map((s) => s.trim()).includes(toolName)) {
    return { shouldSummarize: false, reason: 'not_in_allow_list' };
  }
  return { shouldSummarize: true, reason: 'over_threshold' };
}

/**
 * 实际执行 summarize,失败回 fallback(原文截断)。
 *
 * @returns {Promise<{ text: string, mode: 'summary' | 'fallback_truncate' | 'noop', latencyMs: number }>}
 */
async function summarizeToolResult(toolName, resultText, options = {}) {
  const { shouldSummarize, reason } = shouldSummarizeToolResult(toolName, resultText);
  if (!shouldSummarize) {
    return { text: resultText, mode: 'noop', latencyMs: 0, reason };
  }

  const targetLength = positiveInt(options.targetLength || config.getEnvOrConfig?.('TOOL_RESULT_SUMMARIZER_TARGET_CHARS'), DEFAULT_TARGET_LENGTH);
  const fallbackKeep = positiveInt(config.getEnvOrConfig?.('TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP'), DEFAULT_FALLBACK_KEEP_CHARS);

  const startedAt = Date.now();
  try {
    const result = await summarize(resultText.slice(0, 8000), {
      purpose: 'tool_result',
      targetLength,
    });
    return {
      text: `[summarizer/${result.model}] ${result.summary}`,
      mode: 'summary',
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      text: `[summarizer fallback: ${error?.message?.slice(0, 80) || 'unknown'}]\n${resultText.slice(0, fallbackKeep)}${
        resultText.length > fallbackKeep ? '\n...(truncated)' : ''
      }`,
      mode: 'fallback_truncate',
      latencyMs: Date.now() - startedAt,
    };
  }
}

function isFeatureEnabled() {
  const flag = String(config.getEnvOrConfig?.('TOOL_RESULT_SUMMARIZER_ENABLED') || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'on';
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

module.exports = {
  summarizeToolResult,
  shouldSummarizeToolResult,
};
```

### 验证

无单独验证,B.4 测试覆盖。

### commit

```
feat(gateway/runtime): tool result summarizer wrapper with fallback
```

---

## B.3 — 接入 toolLoop

### 文件

`oct-gateway/runtime/...`(B.1 简报里确定的具体文件)

### 实现要求

在工具结果**写回 messages 之前、硬截断之后**(或者替换硬截断,看 B.1 简报判断),加一段:

```javascript
const { summarizeToolResult } = require('./toolResultSummarizer');

// ... 原有工具执行逻辑
const rawResult = await toolExecutor(args);
const truncated = applyHardTruncate(rawResult); // Week 0 已有

const summarized = await summarizeToolResult(toolName, truncated);
const finalResult = summarized.text;

// 写日志
log.info('tool result summarizer', { toolName, mode: summarized.mode, latencyMs: summarized.latencyMs });

// 写回 messages
messages.push({ role: 'tool', content: finalResult, tool_call_id: ... });
```

### 关键约束

1. summarize 失败时 `summarized.text` 已经是 fallback 文本,直接用
2. `mode === 'noop'` 时返回的 text 就是输入,等价于不做任何事
3. 不要在 toolLoop 里 try/catch summarize —— 它内部已经 try 过了
4. 给每次调用打日志,Week 3 review 时根据日志调阈值

### commit

```
feat(gateway/runtime): integrate summarizer into tool loop result handling
```

---

## B.4 — 单元测试

### 文件

新建 `oct-gateway/test/toolResultSummarizer.test.js`

### 实现要求

参照 `summarizer.test.js` 模式,默认只跑离线测试(SKIP live),`RUN_LIVE_TESTS=1` 才跑 live。

测试用例:

1. `shouldSummarizeToolResult` feature 关时返回 `not_string`(实际是 `feature_disabled`,看实现)
2. feature 开,文本短于阈值 → `under_threshold`
3. feature 开,文本超阈值 → `over_threshold`
4. feature 开,工具不在白名单 → `not_in_allow_list`
5. (live)真实 summarize 工具结果 5000 字 → 返回 mode='summary'
6. (live)summarize 超时 → 返回 mode='fallback_truncate',文本以 `[summarizer fallback:` 开头

### commit

```
test(gateway/runtime): tool result summarizer unit tests
```

---

## B.5 — 配置项与默认值

### 文件

修改 `oct-gateway/config.js`(如已有结构)或在文档里描述

### 配置项清单

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `TOOL_RESULT_SUMMARIZER_ENABLED` | (关) | 总开关,设为 `1` 启用 |
| `TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS` | `2400` | 工具结果超过此长度才触发 |
| `TOOL_RESULT_SUMMARIZER_TARGET_CHARS` | `600` | 摘要目标长度 |
| `TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP` | `1500` | 降级时保留原文长度 |
| `TOOL_RESULT_SUMMARIZER_TOOLS` | (空,全开) | 工具白名单,逗号分隔 |

启用后,**先用 `TOOL_RESULT_SUMMARIZER_TOOLS=web_search,read_document` 灰度**。

### commit

```
chore(gateway/config): tool result summarizer feature flags
```

---

## B.6 — 文档同步

### 修改文件

`docs/02_architecture/summarizer-service.md`,新增章节:

```markdown
## 6. toolLoop 集成

### 触发条件
- 工具结果字符数超过 TOOL_RESULT_SUMMARIZER_TRIGGER_CHARS(默认 2400)
- 总开关 TOOL_RESULT_SUMMARIZER_ENABLED 已开
- 当前工具在白名单内(空白名单 = 全部允许)

### 失败降级
- LLM 调用超时/失败时,fallback 到 TOOL_RESULT_SUMMARIZER_FALLBACK_KEEP(默认 1500)字硬截断
- fallback 文本会以 `[summarizer fallback: <reason>]` 开头,方便日志排查

### 与 Week 0 硬截断的关系
- Week 0 硬截断仍生效,作为第一道保护
- summarizer 在硬截断之后执行,把"截断后但仍超长"的内容进一步压缩
```

### 新建 changelog

`docs/05_changelog/2026-04-XX-tool-result-summarizer.md`

---

## B 验收标准

- [ ] B.1 toolLoop 简报写完且 Zilong 已确认
- [ ] B.2 wrapper 单元测试全部通过
- [ ] B.3 toolLoop 已接入,默认开关关闭时行为与之前完全一致
- [ ] B.5 配置项有 5 个,默认值符合表格
- [ ] 开启 feature + 跑一次主对话调用 web_search,日志能看到 `tool result summarizer mode=summary`
- [ ] 关闭 feature 后行为完全回退到 Week 0 状态
- [ ] 文档已写

---

# Track C — Gateway 执行状态机骨架

## C 总目标

Cursor 在 Week 1 提前实现的 `oct-gateway/script_adapter/mock_execution.js` 是个一次性脚本,所有逻辑挤在一个文件里。Week 2 把它升级成 3 层骨架,**为 Week 5 真实 Agent 接入做结构性铺垫**。

**仍然不接真实 LLM 调用**,5 个 Agent 仍然返回 mock 数据。

## C 代码范围

- 重构:`oct-gateway/script_adapter/mock_execution.js` 拆成多个文件
- 新建:`oct-gateway/script_adapter/runRegistry.js`(任务实例注册表)
- 新建:`oct-gateway/script_adapter/agentRunner.js`(单 Agent 执行抽象)
- 新建:`oct-gateway/script_adapter/eventEmitter.js`(向 connection 推送事件的封装)
- 新建:`oct-gateway/script_adapter/mockArtifactFactory.js`(把现有的 createArtifactForAgent 拆出来)
- 修改:`oct-gateway/index.js` 新增 2 个 method 处理(`scriptAdapter.run.cancel`、`scriptAdapter.run.list`)
- 修改:`electron/main.ts` 转发新事件类型(只追加,不动现有)
- 修改:`electron/preload.ts` 新增 cancel/list API
- 修改:`src/modules/script-adapter/services/gatewayExecution.ts` 增加 cancel/list 方法
- 新建:`docs/02_architecture/script-adapter-gateway-protocol.md`

---

## C.1 — RunRegistry(任务实例注册表)

### 文件

新建 `oct-gateway/script_adapter/runRegistry.js`

### 实现要求

```javascript
'use strict';

// 内存级注册表,Week 3+ 接入持久化时换成 SQLite/Nocturne 后端,签名不变。
const _runs = new Map(); // taskId -> { sheet, status, abortController, createdAt, connection }

function register(taskId, runRecord) {
  _runs.set(taskId, runRecord);
}

function get(taskId) {
  return _runs.get(taskId) || null;
}

function update(taskId, partial) {
  const current = _runs.get(taskId);
  if (!current) return null;
  const next = { ...current, ...partial };
  _runs.set(taskId, next);
  return next;
}

function remove(taskId) {
  _runs.delete(taskId);
}

function list() {
  return Array.from(_runs.entries()).map(([taskId, record]) => ({
    taskId,
    status: record.sheet?.overallStatus,
    createdAt: record.createdAt,
    runCount: record.sheet?.runs?.length ?? 0,
    completedCount: record.sheet?.runs?.filter((r) => r.status === 'completed').length ?? 0,
  }));
}

function abort(taskId) {
  const record = _runs.get(taskId);
  if (!record?.abortController) return false;
  record.abortController.abort();
  return true;
}

module.exports = { register, get, update, remove, list, abort };
```

---

## C.2 — AgentRunner(单 Agent 执行抽象)

### 文件

新建 `oct-gateway/script_adapter/agentRunner.js`

### 实现要求

提供 `runAgent(agent, context, callbacks, signal)` 函数,负责:

1. 推送 progress 3 次
2. 调用 `mockArtifactFactory.create(agent.agentId, agent.displayName)` 拿到 artifact
3. 中途如果 `signal.aborted`,reject 一个 `AbortError`
4. 不推送事件,事件由调用方(orchestrator)负责

签名:

```javascript
async function runAgent(agent, callbacks, signal) {
  callbacks.onStart?.(agent);
  await waitWithSignal(450, signal);
  callbacks.onProgress?.(agent, '开始读取上游产物', 8);
  await waitWithSignal(650, signal);
  callbacks.onProgress?.(agent, '正在生成结构化产物', 48);
  await waitWithSignal(700, signal);
  callbacks.onProgress?.(agent, '正在整理交付摘要', 88);
  await waitWithSignal(450, signal);
  const artifact = require('./mockArtifactFactory').create(agent.agentId, agent.displayName);
  callbacks.onComplete?.(agent, artifact);
  return artifact;
}

function waitWithSignal(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    }, { once: true });
  });
}

module.exports = { runAgent };
```

---

## C.3 — EventEmitter / mockArtifactFactory

### eventEmitter.js

把 `mock_execution.js` 里 `emit` 函数提取出来:

```javascript
'use strict';

function createEmitter(connection, taskId) {
  return function emit(event, payload = {}) {
    if (!connection?.isOpen?.()) return;
    connection.send({
      type: 'event',
      event: 'script-adapter',
      payload: { event, taskId, ...payload },
    });
  };
}

module.exports = { createEmitter };
```

### mockArtifactFactory.js

把 `mock_execution.js` 里的 `createArtifactForAgent` 函数完整搬出来,导出 `create(agentId, displayName)`。Week 5 真实 Agent 接入时,这个文件被替换成真实工厂。

---

## C.4 — 重构 mock_execution.js 成 orchestrator

### 文件

修改 `oct-gateway/script_adapter/mock_execution.js`,只保留 orchestrator 角色:

```javascript
'use strict';

const registry = require('./runRegistry');
const { createEmitter } = require('./eventEmitter');
const { runAgent } = require('./agentRunner');
const { create: createArtifact } = require('./mockArtifactFactory');

const AGENTS = [ /* 5 个 Agent 定义,沿用原内容 */ ];

function createPlan(taskId, taskTitle) {
  /* 沿用原 createExecutionPlan */
}

function startMockScriptAdapterRun(params, connection, logger) {
  const taskId = String(params?.taskId || `script-adapter-${Date.now()}`);
  const taskTitle = String(params?.taskTitle || '多人演播有声书样章');

  let sheet = createPlan(taskId, taskTitle);
  const emit = createEmitter(connection, taskId);
  const abortController = new AbortController();

  registry.register(taskId, {
    sheet,
    status: 'pending',
    abortController,
    connection,
    createdAt: new Date().toISOString(),
  });

  setTimeout(() => {
    runOrchestrator().catch((error) => {
      logger?.error?.('script adapter mock run failed', { taskId, error: error?.message || String(error) });
      emit('run_failed', { error: error?.message || String(error) });
      registry.update(taskId, { status: 'failed' });
    });
  }, 0);

  async function runOrchestrator() {
    sheet = { ...sheet, overallStatus: 'running', updatedAt: new Date().toISOString() };
    registry.update(taskId, { sheet, status: 'running' });
    emit('sheet_created', { sheet });

    for (const agent of sheet.plan.agents) {
      if (abortController.signal.aborted) {
        emit('run_failed', { error: 'cancelled_by_user' });
        registry.update(taskId, { status: 'cancelled' });
        return;
      }

      // ... 用 runAgent 跑单个 agent,处理 callbacks 推事件、更新 sheet ...
    }

    sheet = { ...sheet, overallStatus: 'completed', updatedAt: new Date().toISOString() };
    registry.update(taskId, { sheet, status: 'completed' });
    emit('all_completed', { sheet });
  }

  return { taskId, planId: sheet.plan.planId };
}

module.exports = { startMockScriptAdapterRun };
```

---

## C.5 — 新增 cancel / list 方法

### 修改 `oct-gateway/index.js`

在 `handleTransportMessage` 内追加:

```javascript
if (msg?.type === 'req' && msg?.method === 'scriptAdapter.run.cancel') {
  const { taskId } = msg.params || {};
  const ok = require('./script_adapter/runRegistry').abort(String(taskId || ''));
  connection.send({
    type: 'res',
    id: msg.id,
    ok: true,
    method: msg.method,
    payload: { type: 'script-adapter-run-cancelled', cancelled: ok, taskId },
  });
  return true;
}

if (msg?.type === 'req' && msg?.method === 'scriptAdapter.run.list') {
  const list = require('./script_adapter/runRegistry').list();
  connection.send({
    type: 'res',
    id: msg.id,
    ok: true,
    method: msg.method,
    payload: { type: 'script-adapter-run-list', runs: list },
  });
  return true;
}
```

### 修改 `electron/main.ts`

在已有 `script-adapter-run-start` 之后追加:

```typescript
ipcMain.handle('script-adapter-run-cancel', (_event, payload: { taskId: string }) => {
  if (!openclawWs || openclawWs.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'Gateway 未连接' };
  }
  const requestId = `script_adapter_cancel_${Date.now()}`;
  openclawWs.send(JSON.stringify({
    type: 'req',
    id: requestId,
    method: 'scriptAdapter.run.cancel',
    params: { taskId: payload?.taskId },
  }));
  return { success: true };
});

ipcMain.handle('script-adapter-run-list', (_event) => {
  if (!openclawWs || openclawWs.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'Gateway 未连接' };
  }
  const requestId = `script_adapter_list_${Date.now()}`;
  openclawWs.send(JSON.stringify({
    type: 'req',
    id: requestId,
    method: 'scriptAdapter.run.list',
    params: {},
  }));
  return { success: true };
});
```

### 修改 `electron/preload.ts`

```typescript
cancelScriptAdapterRun: (taskId: string) =>
  ipcRenderer.invoke('script-adapter-run-cancel', { taskId }),
listScriptAdapterRuns: () =>
  ipcRenderer.invoke('script-adapter-run-list'),
```

### 修改 `src/modules/script-adapter/services/gatewayExecution.ts`

```typescript
export async function cancelGatewayExecution(taskId: string) {
  if (!window.electronAPI?.cancelScriptAdapterRun) return { success: false, error: 'unsupported' };
  return window.electronAPI.cancelScriptAdapterRun(taskId);
}

export async function listGatewayExecutions() {
  if (!window.electronAPI?.listScriptAdapterRuns) return { success: false, error: 'unsupported' };
  return window.electronAPI.listScriptAdapterRuns();
}
```

---

## C.6 — 文档

### 新建 `docs/02_architecture/script-adapter-gateway-protocol.md`

至少包含:

1. 协议总览(WebSocket 上的 3 个 method:`scriptAdapter.run.start / cancel / list`,1 个 event:`script-adapter` payload 7 种 sub-event)
2. 每个 method 的 params 与 response payload 字段说明
3. 每种 sub-event(`sheet_created / agent_started / agent_progress / artifact_created / gate_reached / gate_updated / all_completed / run_failed`)的 payload 字段说明
4. 状态机:`pending → running → completed/failed/cancelled`
5. Week 5 真实 Agent 接入计划:`mockArtifactFactory.js` 替换为 `realAgentInvoker.js`,签名不变

### 新建 changelog

`docs/05_changelog/2026-04-XX-script-adapter-gateway-skeleton.md`

---

## C 验收标准

- [ ] `oct-gateway/script_adapter/` 目录下文件:`runRegistry.js`、`agentRunner.js`、`eventEmitter.js`、`mockArtifactFactory.js`、`mock_execution.js`(orchestrator)
- [ ] 启动 Gateway,跑一次执行,行为与 Week 1 完全一致(用户视角无感知)
- [ ] 跑一次执行中途调 `scriptAdapter.run.cancel`,收到 `run_failed { error: 'cancelled_by_user' }`,registry 状态变为 `cancelled`
- [ ] `scriptAdapter.run.list` 返回当前所有任务列表
- [ ] preload.ts、main.ts 改动只是追加,没动现有方法签名
- [ ] 文档 `docs/02_architecture/script-adapter-gateway-protocol.md` 已写
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` 通过

---

# 整合验收

## Week 2 完成的标志

**Track A**:
- 工作台 demo 完整,闸门 banner、计时器、重试、severity / role 色块齐全
- 可以正式给外部演示

**Track B**:
- summarizer 接进 toolLoop,默认关
- 启用后真实工具结果会被压缩,日志可见
- 测试覆盖触发、降级、关闭三种状态

**Track C**:
- Gateway 执行从一次性脚本升级成可扩展骨架
- 支持 cancel / list,protocol 文档完整
- Week 5 接真实 Agent 时,只需要替换 mockArtifactFactory.js,其它不动

## 不做的事(留给 Week 3+)

- 真实文件解析(parser.source_document):Week 3
- SourceDocument 持久化(SQLite / Nocturne):Week 3
- 真实 Agent 调用:Week 5
- 断点续传:Week 4
- 多任务并发执行:Week 5+

---

# 给 Cursor 的额外说明

## 工作节奏建议

第 1-2 天:Track A 全套(A.1-A.5,纯前端,风险低)
第 3 天:Track B.1 toolLoop 简报 → **停下让 Zilong 看** → B.2 wrapper
第 4 天:Track B.3 接入 toolLoop + B.4 测试 + B.5 配置
第 5 天:Track C.1-C.4 重构骨架
第 6 天:Track C.5 cancel/list + C.6 文档
第 7 天:整合验收 + buffer

## 协作约定

1. 每个子任务(A.1-A.5、B.1-B.6、C.1-C.6)单独 commit,prefix 用 `feat(...) / refactor(...) / docs(...) / test(...)`
2. **Track B.1 toolLoop 简报必须先让 Zilong 看再继续**,这是硬规则
3. **任何修改 toolLoop 的 PR 单独提**,不要和 Track A/C 混
4. 改动保护清单文件之前停下来问
5. summarizer prompt 调优放到 B 跑通后,Zilong 看一眼再定版

## 卡壳时怎么办

1. toolLoop 入口找不到 → grep `tool_calls` + `recall_tool_result` + `工具结果硬截断`,实在不行问 Zilong
2. summarize 接入位置不确定 → 看 Week 0 changelog `2026-04-26-gateway-context-budget-and-tool-chain-validation.md`
3. 视觉色彩拿不准 → 沿用 `scriptAdapter.module.css` 已有的 token,不要新引色板
4. 协议字段不确定 → 以 `mock_execution.js` 现有 emit 调用为准,不要自创字段名

## 完成后回报

- 三条线各自的 commit 列表
- Track A 演示截图或录屏
- Track B 日志(开启 feature 后跑一次 web_search)
- Track C protocol 文档链接
- 任何卡壳点和决策需求

Zilong 确认通过后,Week 3 进入"真实文件解析 + SourceDocument 持久化"。
