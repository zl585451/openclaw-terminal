# P1 阶段 — Cursor 执行包（结构稳定）

> 优先级：P1，接 P0 全部完成后执行  
> 预计耗时：3-4 天  
> 前置条件：P0-cursor-tasks.md + P0-3-supplement-review-gate-preview.md 全部完成并提交  
> 执行顺序：**P1-1 → P1-2 → P1-3 → P1-4 → P1-5**（顺序执行，每步独立 commit）  
> 验证命令：每个任务完成后必须跑 `npx tsc --noEmit` + `node --check oct-gateway/index.js`

---

## 背景说明（给 Cursor 读）

P1 的目标是"让代码结构匹配代码行为"。P0 修复了功能性问题；P1 消除命名混乱、500 行以上的单文件和占位实现，为 Phase 2 扩展打基础。

**高风险区域（不要动）**：
- `src/core/`、`src/hooks/useMessages.ts`、`src/core/streamRouter*`、`src/core/turnFSM*`
- 聊天主链路里的流式渲染与 block 管线
- `oct-gateway/agents/`（通用 Agent，不属于 script_adapter）

**P1 涉及的 5 个任务**：

| 编号 | 任务 | 风险 |
|------|------|------|
| P1-1 | 重命名 mock_execution.js → chapterPipeline.js，函数去 mock 前缀 | 低：纯重命名 |
| P1-2 | 删除 gatewayExecution.ts 里的 `useMock: true` 硬编码 | 极低：1 行删除 |
| P1-3 | 补全 actions.ts 中 4 个 console.log 占位函数 | 低：纯前端 store 逻辑 |
| P1-4 | 在 BatchProgressView 中暴露跨章 VoiceRegistry 可见列表 | 低：新增 UI 块 |
| P1-5 | 拆分 WorkbenchView.tsx（950 行）为 3 个子面板组件 | 中：状态需要正确分层 |

---

## TASK-P1-1：重命名 mock_execution.js → chapterPipeline.js

### 目标

文件名和函数名含 `mock` 前缀，但实际上这个模块支持真实 Agent 执行。改名后意图清晰，不再误导。

### 改动 1 — 文件重命名

```
oct-gateway/script_adapter/mock_execution.js
→ oct-gateway/script_adapter/chapterPipeline.js
```

### 改动 2 — chapterPipeline.js 内部函数改名

在新文件 `chapterPipeline.js` 中做以下**全局替换**（replace_all）：

| 旧名称 | 新名称 |
|--------|--------|
| `startMockScriptAdapterRun` | `startChapterPipelineRun` |
| `cancelMockScriptAdapterRun` | `cancelChapterPipelineRun` |
| `listMockScriptAdapterRuns` | `listChapterPipelineRuns` |

`createExecutionPlan`、`runSingleScriptAdapterChapter` 不改名，它们本来就没有 mock 前缀。

### 改动 3 — agentRunner.js 内函数改名

文件 `oct-gateway/script_adapter/agentRunner.js`：

| 旧名称 | 新名称 |
|--------|--------|
| `runMockAgentPipeline` | `runChapterAgentPipeline` |

同步更新该文件的 `module.exports`：
```js
// 旧
module.exports = { runMockAgentPipeline };
// 新
module.exports = { runChapterAgentPipeline };
```

### 改动 4 — chapterPipeline.js 内的 require

```js
// 旧（文件顶部）
const { runMockAgentPipeline } = require('./agentRunner');

// 新
const { runChapterAgentPipeline } = require('./agentRunner');
```

并将文件内所有 `runMockAgentPipeline(` 替换为 `runChapterAgentPipeline(`。

### 改动 5 — oct-gateway/index.js 更新引用

找到：
```js
const {
  startMockScriptAdapterRun,
  cancelMockScriptAdapterRun,
  listMockScriptAdapterRuns,
} = require('./script_adapter/mock_execution');
```

替换为：
```js
const {
  startChapterPipelineRun,
  cancelChapterPipelineRun,
  listChapterPipelineRuns,
} = require('./script_adapter/chapterPipeline');
```

同时，`index.js` 中三处使用旧函数名的地方全部更新：

```js
// 约 475 行
const run = startChapterPipelineRun(msg.params || {}, connection, log);

// 约 490 行
const result = cancelChapterPipelineRun(msg.params?.taskId, msg.params?.reason);

// 约 513 行
runs: listChapterPipelineRuns(),
```

### 改动 6 — batchOrchestrator.js 更新引用

找到：
```js
const { createExecutionPlan, runSingleScriptAdapterChapter } = require('./mock_execution');
```

替换为：
```js
const { createExecutionPlan, runSingleScriptAdapterChapter } = require('./chapterPipeline');
```

（函数名不变，只改路径。）

### 验收

```bash
node --check oct-gateway/index.js
node --check oct-gateway/script_adapter/chapterPipeline.js
node --check oct-gateway/script_adapter/batchOrchestrator.js
```

全部通过，无 `Cannot find module` 错误。

---

## TASK-P1-2：删除 gatewayExecution.ts 里的 useMock 硬编码

### 目标

`gatewayExecution.ts` 第 34 行有 `useMock: true` 硬编码。网关的 `index.js` 根本不读这个字段——实际的 mock/real 切换由 `config.realAgents` 控制。这个字段只会误导阅读者以为 mock 是强制的。

### 改动

文件 `src/modules/script-adapter/services/gatewayExecution.ts`：

找到：
```ts
return await window.electronAPI.startScriptAdapterRun({
  ...payload,
  useMock: true,
  sourceText: payload.sourceText,
  config: payload.config,
});
```

替换为：
```ts
return await window.electronAPI.startScriptAdapterRun({
  ...payload,
  sourceText: payload.sourceText,
  config: payload.config,
});
```

### 验收

`npx tsc --noEmit` 无新错误。

---

## TASK-P1-3：补全 actions.ts 中的占位函数

### 目标

`actions.ts` 中有 4 个函数只有 `console.log`，其中 `rejectArtifact` 是当前 ReviewGate 流程里理论上会被用到的，应当实现；其余 3 个明确标注为 Phase 2 待实现。

### 改动

文件 `src/modules/script-adapter/store/actions.ts`：

找到以下 4 个函数，**整体替换**：

```ts
rejectArtifact(artifactId: string, reason: string) {
  console.log('[ScriptAdapter] TODO: reject artifact', artifactId, 'reason:', reason);
},

openArtifact(artifactId: string) {
  console.log('[ScriptAdapter] TODO: open artifact', artifactId);
},

viewArtifactHistory(artifactId: string) {
  console.log('[ScriptAdapter] TODO: view artifact history', artifactId);
},

rerunScene(projectId: string, sceneId: string) {
  console.log('[ScriptAdapter] TODO: rerun scene', projectId, sceneId);
},

pauseStage(projectId: string, stageIdx: number) {
  console.log('[ScriptAdapter] TODO: pause stage', projectId, stageIdx);
},
```

替换为：

```ts
/**
 * 拒绝产物：找到该产物关联的 ReviewGate，将其状态设为 rejected。
 * 用于单次执行链路（不是批次）。批次链路的 gate 操作由 rejectGatewayGate() 处理。
 */
rejectArtifact(projectId: string, artifactId: string, reason: string) {
  useScriptAdapterStore.getState()._set((state) => {
    const sheet = state.executionSheets[projectId];
    if (!sheet) return {};
    const relatedGate = sheet.gates.find(
      (gate) => gate.relatedArtifactId === artifactId && gate.status === 'pending',
    );
    if (!relatedGate) return {};
    return {
      executionSheets: {
        ...state.executionSheets,
        [projectId]: {
          ...sheet,
          gates: sheet.gates.map((gate) =>
            gate.gateId === relatedGate.gateId
              ? { ...gate, status: 'rejected' as const }
              : gate,
          ),
          updatedAt: new Date().toISOString(),
        },
      },
    };
  });
  console.info('[ScriptAdapter] gate rejected for artifact', artifactId, '—', reason);
},

/**
 * 打开产物详情查看器。Phase 2 实现具体 UI；目前仅记录日志。
 */
openArtifact(artifactId: string) {
  console.info('[ScriptAdapter] openArtifact — Phase 2 实现', artifactId);
},

/**
 * 查看产物历史版本。Phase 2 实现；目前仅记录日志。
 */
viewArtifactHistory(artifactId: string) {
  console.info('[ScriptAdapter] viewArtifactHistory — Phase 2 实现', artifactId);
},

/**
 * 重跑指定场景。Phase 2 实现；目前仅记录日志。
 */
rerunScene(projectId: string, sceneId: string) {
  console.info('[ScriptAdapter] rerunScene — Phase 2 实现', projectId, sceneId);
},

/**
 * 暂停阶段。Phase 2 实现；目前仅记录日志。
 */
pauseStage(projectId: string, stageIdx: number) {
  console.info('[ScriptAdapter] pauseStage — Phase 2 实现', projectId, stageIdx);
},
```

**注意**：`rejectArtifact` 签名从 `(artifactId, reason)` 改为 `(projectId, artifactId, reason)`，需要检查是否有调用方。  
用 grep 搜索 `rejectArtifact(` 确认当前无调用方，若有调用方一并更新参数顺序。

### 验收

`npx tsc --noEmit` 无错误。搜索 `console.log.*TODO` 确认 script-adapter 模块内不再有 TODO 占位。

---

## TASK-P1-4：BatchProgressView 暴露跨章 VoiceRegistry

### 目标

当前 BatchProgressView 只显示"跨章角色音已锁定 N 个角色"和前 8 个角色名。用户在批次运行中途无法看到完整的角色音积累情况，无法发现分配错误。

P1 目标：在一个可折叠区块中显示完整的 VoiceRegistry 列表（只读）。P2 再加编辑能力。

### 改动

文件 `src/modules/script-adapter/ui/Workbench/BatchProgressView.tsx`：

#### 第 1 步 — 替换现有的 batchVoiceRegistrySummary 区块

找到：
```tsx
{batchVoiceRegistry.length > 0 ? (
  <div className={styles.batchVoiceRegistrySummary}>
    <strong>跨章角色音已锁定 {batchVoiceRegistry.length} 个角色</strong>
    <span>{batchVoiceRegistry.slice(0, 8).map((item) => item.roleName).join(' / ')}</span>
  </div>
) : null}
```

替换为：
```tsx
{batchVoiceRegistry.length > 0 ? (
  <details className={styles.voiceRegistryPanel}>
    <summary>
      <strong>跨章角色音</strong>
      <span>{batchVoiceRegistry.length} 个角色已锁定</span>
    </summary>
    <div className={styles.voiceRegistryTable}>
      <div className={styles.voiceRegistryHeader}>
        <span>角色名</span>
        <span>分类</span>
        <span>声音提示</span>
        <span>出现次数</span>
      </div>
      {batchVoiceRegistry.map((entry) => (
        <div key={entry.roleName} className={styles.voiceRegistryRow}>
          <span>{entry.roleName}</span>
          <span className={styles[`voiceCategory--${entry.category}`]}>
            {VOICE_CATEGORY_LABEL[entry.category] ?? entry.category}
          </span>
          <span>{entry.voiceHint || '—'}</span>
          <span>{entry.appearanceCount ?? '—'}</span>
        </div>
      ))}
    </div>
    <small className={styles.voiceRegistryNote}>
      此列表由各章质检阶段累积生成，仅供参考。角色音编辑功能将在后续版本开放。
    </small>
  </details>
) : null}
```

#### 第 2 步 — 在文件顶部添加常量

在 `const ROW_HEIGHT = 52;` 之前插入：

```tsx
const VOICE_CATEGORY_LABEL: Record<string, string> = {
  narrator: '旁白',
  main: '主角',
  support: '配角',
  unresolved: '待定',
  sfx: '音效',
};
```

#### 第 3 步 — 在 scriptAdapter.module.css 末尾追加样式

```css
/* ── VoiceRegistryPanel ─────────────────────────────────────── */

.voiceRegistryPanel {
  margin-top: 14px;
  border: 1px solid rgba(80, 150, 220, 0.2);
  border-radius: 12px;
  overflow: hidden;
}

.voiceRegistryPanel > summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  background: rgba(232, 244, 255, 0.6);
  list-style: none;
  user-select: none;
}

.voiceRegistryPanel > summary::-webkit-details-marker {
  display: none;
}

.voiceRegistryPanel > summary::before {
  content: '▶';
  font-size: 10px;
  color: rgba(60, 120, 200, 0.6);
  transition: transform 0.15s;
}

.voiceRegistryPanel[open] > summary::before {
  transform: rotate(90deg);
}

.voiceRegistryPanel > summary strong {
  font-size: 13px;
}

.voiceRegistryPanel > summary span {
  font-size: 12px;
  color: rgba(40, 80, 160, 0.6);
}

.voiceRegistryTable {
  padding: 8px 14px 12px;
  display: grid;
  gap: 0;
}

.voiceRegistryHeader {
  display: grid;
  grid-template-columns: 2fr 1fr 2fr 1fr;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(40, 80, 160, 0.5);
  padding: 4px 0 6px;
  border-bottom: 1px solid rgba(80, 150, 220, 0.15);
  margin-bottom: 4px;
}

.voiceRegistryRow {
  display: grid;
  grid-template-columns: 2fr 1fr 2fr 1fr;
  gap: 8px;
  font-size: 12px;
  padding: 5px 0;
  border-bottom: 1px solid rgba(80, 150, 220, 0.07);
  color: rgba(20, 50, 100, 0.85);
  align-items: center;
}

.voiceRegistryRow:last-child {
  border-bottom: none;
}

.voiceCategory--narrator { color: #555; }
.voiceCategory--main     { color: #1a5cc8; font-weight: 600; }
.voiceCategory--support  { color: #2a7a40; }
.voiceCategory--unresolved { color: #a07000; font-style: italic; }
.voiceCategory--sfx      { color: #7a3090; }

.voiceRegistryNote {
  display: block;
  padding: 6px 14px 10px;
  font-size: 11px;
  color: rgba(40, 80, 160, 0.45);
  font-style: italic;
}
```

### 验收

- `npx tsc --noEmit` 无错误
- 有跨章 VoiceRegistry 数据时，批次进度面板底部出现可折叠区块
- 展开后显示角色名、分类（带颜色）、声音提示、出现次数四列

---

## TASK-P1-5：拆分 WorkbenchView.tsx（950 行 → 3 个子面板）

### 目标

`WorkbenchView.tsx` 约 950 行，混合了三种职责：批次配置前的"开工确认书"、批次运行中的进度面板、开工确认弹窗。拆分后每个文件职责单一，方便独立扩展。

### 拆分方案

```
WorkbenchView.tsx (~180 行)          ← 保留，只做状态编排 + 组件路由
BatchSetupPanel.tsx (~280 行)        ← 新增：开工确认书 + 预算 + 保护条款
BatchExecutionPanel.tsx (~220 行)    ← 新增：运行中状态 + 历史 + 制作角色卡
StartConfirmDialog.tsx (~90 行)      ← 新增：开工确认弹窗
```

所有新文件放在：`src/modules/script-adapter/ui/Workbench/`

---

### 第 1 步：新建 StartConfirmDialog.tsx

提取弹窗（WorkbenchView.tsx 约 885-949 行），**完整内容**如下：

```tsx
import styles from '../../styles/scriptAdapter.module.css';
import type { BatchEstimate, TrialExecutionMode } from '../../types/batch';

interface StartConfirmDialogProps {
  open: boolean;
  loading: boolean;
  bookTitle: string;
  rangeLabel: string;
  estimate: BatchEstimate;
  executionMode: TrialExecutionMode;
  deliveryItemLabels: string[];
  warnings: string[];
  confirmButtonText: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function StartConfirmDialog({
  open,
  loading,
  bookTitle,
  rangeLabel,
  estimate,
  executionMode,
  deliveryItemLabels,
  warnings,
  confirmButtonText,
  onClose,
  onConfirm,
}: StartConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className={styles.workbenchModalOverlay}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={styles.startConfirmDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-confirm-title"
      >
        <div className={styles.startConfirmHeader}>
          <div>
            <span>开工确认</span>
            <h3 id="start-confirm-title">确认启动这次试产？</h3>
          </div>
          <button type="button" aria-label="关闭开工确认" onClick={onClose}>×</button>
        </div>

        <div className={styles.startConfirmProject}>
          <span>素材</span>
          <strong>《{bookTitle}》</strong>
          <em>{rangeLabel}</em>
        </div>

        <div className={styles.startConfirmStats}>
          <div><span>章节</span><strong>{estimate.chapterCount}</strong></div>
          <div><span>字数</span><strong>{estimate.totalChars.toLocaleString('zh-CN')}</strong></div>
          <div><span>耗时</span><strong>{estimate.estimatedDurationMinutes} 分钟</strong></div>
          <div><span>费用</span><strong>¥{estimate.estimatedCostCny.toFixed(2)}</strong></div>
        </div>

        <div className={styles.startConfirmInfoGrid}>
          <div>
            <span>试产模式</span>
            <strong>{executionMode === 'real' ? '真实 Agent 试产' : '模拟演示'}</strong>
          </div>
          <div>
            <span>交付项</span>
            <strong>{deliveryItemLabels.join(' / ')}</strong>
          </div>
        </div>

        {warnings.length > 0 ? (
          <div className={styles.startConfirmWarnings}>
            {warnings.map((w) => <div key={w}>{w}</div>)}
          </div>
        ) : (
          <div className={styles.startConfirmSafeNote}>当前批次规模适合直接试跑。</div>
        )}

        <div className={styles.startConfirmActions}>
          <button type="button" className={styles.ghostButton} onClick={onClose}>
            再检查一下
          </button>
          <button
            type="button"
            className={styles.confirmStartButton}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? '启动中…' : confirmButtonText}
          </button>
        </div>
      </section>
    </div>
  );
}
```

---

### 第 2 步：新建 BatchSetupPanel.tsx

提取"开工确认书"配置区（WorkbenchView.tsx 中 `!currentBatch` 的分支，约 607-730 行）。

```tsx
import { useEffect, useMemo, useState } from 'react';
import { listBooks, listChapters, type LibraryBook, type LibraryChapter } from '../../services/aiLibraryClient';
import { estimateBatchCost } from '../../services/batchBudget';
import { startGatewayBatch } from '../../services/gatewayBatch';
import { scriptAdapterActions } from '../../store/actions';
import type { DeliveryOptions, TaskCreationContract, TrialExecutionMode } from '../../types/batch';
import { StartConfirmDialog } from './StartConfirmDialog';
import styles from '../../styles/scriptAdapter.module.css';

interface BatchSetupPanelProps {
  taskContract?: TaskCreationContract | null;
  onBatchStarted: (batchId: string) => void;
}

export function BatchSetupPanel({ taskContract, onBatchStarted }: BatchSetupPanelProps) {
  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [batchChapters, setBatchChapters] = useState<LibraryChapter[]>([]);
  const [selectedBatchBookId, setSelectedBatchBookId] = useState('');
  const [selectedBatchChapterIndices, setSelectedBatchChapterIndices] = useState<number[]>([]);
  const [executionMode, setExecutionMode] = useState<TrialExecutionMode>('mock');
  const [deliveryOptions, setDeliveryOptions] = useState<DeliveryOptions>({
    adaptedScript: true,
    voiceRegistry: true,
    qualityReview: true,
    cvDirections: false,
    bgmSfx: false,
    finalPackage: true,
  });
  const [loading, setLoading] = useState<'books' | 'chapters' | 'start' | null>(null);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  // taskContract 优先填充
  useEffect(() => {
    if (!taskContract) return;
    setSelectedBatchBookId(taskContract.bookId);
    setSelectedBatchChapterIndices(taskContract.chapterIndices);
    setDeliveryOptions(taskContract.deliveryOptions);
  }, [taskContract]);

  // 加载书库
  useEffect(() => {
    let cancelled = false;
    setLoading('books');
    setError('');
    listBooks()
      .then((books) => {
        if (cancelled) return;
        setLibraryBooks(books);
        if (!selectedBatchBookId && books[0]) setSelectedBatchBookId(books[0].id);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '书库加载失败');
      })
      .finally(() => { if (!cancelled) setLoading(null); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 加载章节
  useEffect(() => {
    if (!selectedBatchBookId) { setBatchChapters([]); setSelectedBatchChapterIndices([]); return; }
    let cancelled = false;
    setLoading('chapters');
    setError('');
    listChapters(selectedBatchBookId)
      .then((chapters) => {
        if (cancelled) return;
        setBatchChapters(chapters);
        setSelectedBatchChapterIndices((current) => {
          const valid = current.every((i) => chapters.some((c) => c.chapter_index === i));
          return valid && current.length > 0 ? current : chapters[0] ? [chapters[0].chapter_index] : [];
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '章节加载失败');
      })
      .finally(() => { if (!cancelled) setLoading(null); });
    return () => { cancelled = true; };
  }, [selectedBatchBookId]);

  const selectedBatchBook = useMemo(
    () => libraryBooks.find((b) => b.id === selectedBatchBookId)
      || (taskContract ? {
          id: taskContract.bookId, title: taskContract.bookTitle, author: '',
          source_type: 'library', chapter_count: taskContract.chapterCount,
          total_chars: taskContract.totalChars,
        } as LibraryBook : null),
    [libraryBooks, selectedBatchBookId, taskContract],
  );

  const effectiveBatchChapters = useMemo(() => {
    if (batchChapters.length > 0 || !taskContract) return batchChapters;
    const avg = Math.round(taskContract.totalChars / Math.max(1, taskContract.chapterCount));
    return taskContract.chapterIndices.map((idx) => ({
      id: `${taskContract.bookId}-${idx}`, book_id: taskContract.bookId,
      chapter_index: idx, title: `第 ${idx + 1} 章`, char_count: avg,
    })) as LibraryChapter[];
  }, [batchChapters, taskContract]);

  const batchEstimate = useMemo(
    () => estimateBatchCost(effectiveBatchChapters, selectedBatchChapterIndices, {
      includeVoiceRegistry: deliveryOptions.voiceRegistry,
      includeQualityReview: deliveryOptions.qualityReview,
      includeCvDirections: deliveryOptions.cvDirections,
      includeBgmSfx: deliveryOptions.bgmSfx,
    }),
    [effectiveBatchChapters, selectedBatchChapterIndices, deliveryOptions.voiceRegistry,
     deliveryOptions.qualityReview, deliveryOptions.cvDirections, deliveryOptions.bgmSfx],
  );

  const deliveryItemLabels = useMemo(() => [
    '多人演播台本',
    deliveryOptions.voiceRegistry ? '角色音表' : null,
    deliveryOptions.qualityReview ? '质检报告' : null,
    deliveryOptions.cvDirections ? 'CV 演播指导' : null,
    deliveryOptions.bgmSfx ? 'BGM/SFX 建议' : null,
  ].filter(Boolean) as string[], [deliveryOptions]);

  const startWarnings = useMemo(() => {
    const w: string[] = [];
    if (executionMode === 'real' && batchEstimate.chapterCount > 5)
      w.push('真实 Agent 试产超过 5 章，建议先跑 1 章或 3-5 章。');
    if (deliveryOptions.bgmSfx && batchEstimate.chapterCount > 5)
      w.push('已开启 BGM/SFX 建议，批量成本会明显上升。');
    return w;
  }, [batchEstimate.chapterCount, deliveryOptions.bgmSfx, executionMode]);

  const contractRangeLabel = taskContract?.rangeLabel
    || (batchEstimate.chapterCount === 1 ? '单章试产' : `${batchEstimate.chapterCount} 章小批量试产`);

  const startBatchButtonText = batchEstimate.chapterCount <= 1
    ? '确认开工，开始单章试产'
    : batchEstimate.chapterCount <= 5
      ? '确认开工，开始小批量试产'
      : '确认高成本预算，开始批次';

  const deliverySummary = [
    'Word DOCX', '多人演播台本',
    deliveryOptions.voiceRegistry ? '角色音表' : null,
    deliveryOptions.qualityReview ? '质检报告' : null,
    deliveryOptions.cvDirections ? 'CV 演播指导' : null,
    deliveryOptions.bgmSfx ? 'BGM/SFX 建议' : null,
  ].filter(Boolean).join(' / ');

  const requestStart = () => {
    if (!selectedBatchBook || batchEstimate.chapterCount === 0) {
      setError('请先选择一本书和至少一个章节。');
      return;
    }
    if (executionMode === 'real' && taskContract?.rangeLabel.includes('全书')) {
      setError('首次真实试产不建议直接跑全书，请先选择 1 章或 3-5 章。');
      return;
    }
    setError('');
    setConfirmOpen(true);
  };

  const confirmStart = async () => {
    if (!selectedBatchBook || batchEstimate.chapterCount === 0) return;
    setConfirmOpen(false);
    setLoading('start');
    setError('');
    try {
      const result = await startGatewayBatch({
        bookId: selectedBatchBook.id,
        bookTitle: selectedBatchBook.title,
        chapterIndices: selectedBatchChapterIndices,
        estimate: batchEstimate,
        config: {
          executionMode,
          realAgents: executionMode === 'real' ? 'all' : 'off',
          includePerformanceDesign: deliveryOptions.cvDirections || deliveryOptions.bgmSfx,
          deliveryOptions,
        },
      });
      if (!result.success || !result.batchId) {
        setError(result.error || '批次启动失败');
        return;
      }
      onBatchStarted(result.batchId);
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <section className={`${styles.card} ${styles.workOrderHeroCard}`}>
        <div className={styles.workOrderHeroMain}>
          <div className={styles.workOrderHeroCopy}>
            <div className={styles.workOrderKicker}>开工确认书</div>
            <h2>请最后确认预算、试产模式和交付物。</h2>
            <p>
              你前面确认的素材、章节范围、目标和修改策略已经锁定。这里不再重新选章节，
              只做开工前拍板；如需改范围，请返回修改方案。
            </p>
            <div className={styles.workOrderSealRow}>
              <span>不改剧情</span>
              <span>{batchEstimate.chapterCount <= 1 ? '单章试产' : '小批量试产'}</span>
              <span>交付 Word DOCX</span>
            </div>
          </div>
          <div className={styles.contractSummaryGrid}>
            <div><span>素材</span><strong>{selectedBatchBook?.title || taskContract?.bookTitle || '待选择素材'}</strong></div>
            <div><span>范围</span><strong>{contractRangeLabel}</strong></div>
            <div><span>修改策略</span><strong>{taskContract?.strategyTitle || '轻度听感改编'}</strong></div>
            <div><span>交付物</span><strong>{deliverySummary}</strong></div>
            <div><span>未启用</span><strong>{deliveryOptions.bgmSfx ? '无' : 'BGM/SFX 建议'}</strong></div>
          </div>
        </div>
        <div className={styles.workOrderHeroActions}>
          <div className={styles.readyStamp}>READY</div>
          <button
            type="button"
            className={styles.confirmStartButton}
            disabled={loading === 'start' || batchEstimate.chapterCount === 0}
            onClick={requestStart}
          >
            {loading === 'start' ? '启动中…' : startBatchButtonText}
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => scriptAdapterActions.setViewMode('pipeline')}
          >
            返回修改方案
          </button>
        </div>
      </section>

      <section className={styles.contractApprovalGrid}>
        <div className={`${styles.card} ${styles.batchBudgetCard}`}>
          <div className={styles.sectionTitle}>最终预算与试产模式</div>
          <div className={styles.batchBudgetStats}>
            <div><span>已选章节</span><strong>{batchEstimate.chapterCount}</strong></div>
            <div><span>总字数</span><strong>{batchEstimate.totalChars.toLocaleString('zh-CN')}</strong></div>
            <div><span>预计耗时</span><strong>{batchEstimate.estimatedDurationMinutes} 分钟</strong></div>
            <div><span>预计费用</span><strong>¥{batchEstimate.estimatedCostCny.toFixed(2)}</strong></div>
          </div>
          <div className={styles.batchModeBlock}>
            <strong>试产模式</strong>
            <label className={styles.batchOptionToggle}>
              <input type="radio" checked={executionMode === 'mock'} onChange={() => setExecutionMode('mock')} />
              <span>模拟演示：不调用真实模型，适合看流程</span>
            </label>
            <label className={styles.batchOptionToggle}>
              <input type="radio" checked={executionMode === 'real'} onChange={() => setExecutionMode('real')} />
              <span>真实 Agent 试产：会调用模型并产生费用，建议先跑 1 章或 3-5 章</span>
            </label>
          </div>
          <div className={styles.batchModeBlock}>
            <strong>本次交付内容已锁定</strong>
            <p>{deliverySummary}</p>
            <small>交付项在第 3 步确认。最后页只显示摘要，避免开工前重复配置。</small>
          </div>
          <div className={styles.batchCostBreakdown}>
            <div><span>基础台本 / 角色音 / 质检</span><strong>¥{batchEstimate.baseCostCny.toFixed(2)}</strong></div>
            <div><span>CV 演播指导</span><strong>¥{batchEstimate.cvCostCny.toFixed(2)}</strong></div>
            <div><span>BGM/SFX 建议</span><strong>¥{batchEstimate.bgmSfxCostCny.toFixed(2)}</strong></div>
          </div>
          <div className={styles.batchWarningList}>
            {batchEstimate.warnings.length > 0
              ? batchEstimate.warnings.map((w) => <div key={w}>{w}</div>)
              : <div>当前批次规模适合直接试跑。</div>}
          </div>
          {error ? <div className={styles.inlineErrorText}>{error}</div> : null}
        </div>

        <div className={`${styles.card} ${styles.contractGuardCard}`}>
          <div className={styles.sectionTitle}>开工保护条款</div>
          <div className={styles.contractGuardList}>
            <div><strong>范围已锁定</strong><span>{contractRangeLabel}。如需改章节，返回新建任务第 1 步。</span></div>
            <div><strong>不会改核心剧情</strong><span>只优化表达和演播可执行性，不改变人物关系和关键事件。</span></div>
            <div><strong>完成后主交付为 DOCX</strong><span>Markdown 只作为内部留痕，客户优先看 Word 文档。</span></div>
          </div>
        </div>
      </section>

      <StartConfirmDialog
        open={confirmOpen}
        loading={loading === 'start'}
        bookTitle={selectedBatchBook?.title || taskContract?.bookTitle || '待选择素材'}
        rangeLabel={contractRangeLabel}
        estimate={batchEstimate}
        executionMode={executionMode}
        deliveryItemLabels={deliveryItemLabels}
        warnings={startWarnings}
        confirmButtonText={startBatchButtonText}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void confirmStart()}
      />
    </>
  );
}
```

---

### 第 3 步：新建 BatchExecutionPanel.tsx

提取批次运行中的所有 UI（WorkbenchView.tsx 中 `currentBatch` 分支的内容，约 733-882 行）：

```tsx
import type { BatchJob, ChapterRunRecord } from '../../types/batch';
import { BatchProgressView } from './BatchProgressView';
import { exportBatchDeliveryAsDocx, exportBatchDeliveryAsMarkdown } from '../../services/exportClient';
import { deleteGatewayBatch, rerunGatewayBatchChapter, cancelGatewayBatch } from '../../services/gatewayBatch';
import { scriptAdapterActions } from '../../store/actions';
import styles from '../../styles/scriptAdapter.module.css';

const TEAM_ROLE_COPY: Record<string, { title: string; shortDesc: string; promise: string }> = {
  'stage-text-adaptation': {
    title: '文本改编师',
    shortDesc: '把原文改成更适合多人演播的口语化样章。',
    promise: '保留剧情，只让旁白和对白更好听。',
  },
  'stage-voice-classification': {
    title: '角色音统筹',
    shortDesc: '标出谁在说话、哪些声音暂时未定、哪些需要后续分配 CV。',
    promise: '不把文件记录、OS、未定声音硬塞给旁白。',
  },
  'stage-performance-design': {
    title: '演播设计师',
    shortDesc: '补充 BGM、音效、CV 情绪、气息和动作提示。',
    promise: '让剧组拿到后能直接理解怎么演。',
  },
  'stage-quality-review': {
    title: '质检审校',
    shortDesc: '检查有没有改剧情、角色音是否混乱、演播提示是否可执行。',
    promise: '发现风险会停下来提醒你确认。',
  },
  'stage-export': {
    title: '交付打包员',
    shortDesc: '整理成剧组能看的台本、角色音表和制作说明。',
    promise: '把零散产物打包成清楚的交付件。',
  },
};

const ARTIFACT_LABELS: Record<string, string> = {
  adapted_script: '多人演播样章台本',
  voice_registry: '角色音标注表',
  performance_design: '演播设计稿',
  review_report: '质检审核报告',
  final_package: '交付包',
};

const STATUS_LABEL: Record<string, string> = {
  done: '已完成', running: '执行中', review: '待复核', pending: '待执行', failed: '失败',
};

interface BatchExecutionPanelProps {
  batch: BatchJob;
  chapterRuns: ChapterRunRecord[];
  batchHistory: BatchJob[];
  currentBatchId: string | null;
  onBatchSelect: (id: string) => void;
  onRefresh: () => void;
  onBatchRefreshHistory: () => void;
}

export function BatchExecutionPanel({
  batch,
  chapterRuns,
  batchHistory,
  currentBatchId,
  onBatchSelect,
  onRefresh,
  onBatchRefreshHistory,
}: BatchExecutionPanelProps) {
  const completed = batch.status === 'completed';
  const running = !completed;

  // 制作角色：从 stages（WorkbenchView 的 store 状态）获取。
  // 这里简化为从 TEAM_ROLE_COPY 直接生成演示列表，Phase 2 再连接真实 stages。
  const teamKeys = Object.keys(TEAM_ROLE_COPY);

  const handleExportMarkdown = async () => {
    await exportBatchDeliveryAsMarkdown(batch, chapterRuns);
  };

  const handleExportDocx = async () => {
    await exportBatchDeliveryAsDocx(batch, chapterRuns);
  };

  return (
    <>
      {running ? (
        <section className={`${styles.card} ${styles.lifecycleStatusCard}`}>
          <div>
            <div className={styles.workOrderKicker}>开工中</div>
            <h2>正在试产，批次运行中。</h2>
            <p>详细进度见下方批次进度卡。</p>
          </div>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => scriptAdapterActions.setViewMode('pipeline')}
          >
            查看制作阶段
          </button>
        </section>
      ) : null}

      <BatchProgressView
        batch={batch}
        chapterRuns={chapterRuns}
        onRefresh={onRefresh}
        onRerun={(chapterIndex) => {
          void rerunGatewayBatchChapter(batch.id, chapterIndex).then(onRefresh);
        }}
        onExport={() => void handleExportMarkdown()}
        onExportDocx={() => void handleExportDocx()}
        onCancel={() => {
          void cancelGatewayBatch(batch.id).then(() => {
            onBatchRefreshHistory();
            onRefresh();
          });
        }}
      />

      {completed ? (
        <details className={`${styles.card} ${styles.collapsibleWorkbenchSection}`}>
          <summary>查看批次历史</summary>
          <section className={styles.batchHistoryCard}>
            <div className={styles.productionTeamHeader}>
              <div>
                <div className={styles.sectionTitle}>批次历史</div>
                <p>重启后状态由 Gateway 持久化恢复。</p>
              </div>
              <button type="button" className={styles.ghostButton} onClick={onBatchRefreshHistory}>
                刷新历史
              </button>
            </div>
            <div className={styles.batchHistoryList}>
              {batchHistory.length === 0 ? (
                <div className={styles.batchHistoryEmpty}>还没有批次记录。</div>
              ) : batchHistory.map((item) => (
                <div key={item.id} className={item.id === currentBatchId ? styles.batchHistoryItemActive : styles.batchHistoryItem}>
                  <button type="button" className={styles.batchHistoryMain} onClick={() => onBatchSelect(item.id)}>
                    <strong>{item.bookTitle}</strong>
                    <span>{item.completedChapters}/{item.totalChapters} · {item.status}</span>
                    <em>{new Date(item.createdAt).toLocaleString('zh-CN')}</em>
                  </button>
                  <button
                    type="button"
                    className={styles.ghostButton}
                    disabled={item.status === 'running'}
                    onClick={() => void deleteGatewayBatch(item.id).then(onBatchRefreshHistory)}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </section>
        </details>
      ) : null}

      <details className={`${styles.card} ${styles.collapsibleWorkbenchSection}`}>
        <summary>查看制作角色和保护条款</summary>
        <section className={styles.productionTeamCard}>
          <div className={styles.productionTeamHeader}>
            <div>
              <div className={styles.sectionTitle}>谁在为你干活</div>
              <p>这几位"制作角色"会按顺序帮你完成样章。</p>
            </div>
          </div>
          <div className={styles.productionTeamGrid}>
            {teamKeys.map((key, idx) => {
              const role = TEAM_ROLE_COPY[key];
              return (
                <div key={key} className={styles.productionTeamMember}>
                  <div className={styles.productionMemberTop}>
                    <span>{idx + 1}</span>
                  </div>
                  <strong>{role.title}</strong>
                  <p>{role.shortDesc}</p>
                  <small>{role.promise}</small>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.contractDeliveryGrid}>
          <div className={`${styles.card} ${styles.contractGuardCard}`}>
            <div className={styles.sectionTitle}>保护条款</div>
            <div className={styles.contractGuardList}>
              <div><strong>不会改核心剧情</strong><span>只优化表达和演播可执行性，不改变人物关系和关键事件。</span></div>
              <div><strong>不会提前解释悬疑</strong><span>旧物、对讲机和关键线索仍按原来的信息顺序出现。</span></div>
              <div><strong>不会乱归角色音</strong><span>未定来源声音会保留为候选，交给你或统筹后续确认。</span></div>
            </div>
          </div>
        </section>
      </details>
    </>
  );
}
```

**注意**：`TEAM_ROLE_COPY`、`ARTIFACT_LABELS`、`STATUS_LABEL` 从 WorkbenchView.tsx 顶部移入 BatchExecutionPanel.tsx，WorkbenchView.tsx 中删除这些常量定义。

---

### 第 4 步：精简 WorkbenchView.tsx

删除所有已迁移到子组件的状态、effects 和 JSX，只保留：

**保留的 state**：
- `batchHistory`, `currentBatchId`, `currentBatch`, `currentBatchRuns`
- Store 衍生：`currentProjectId`, `project`, `chapters`, `stages`, `executionSheet`

**保留的 effects**：
- `subscribeGatewayExecutionEvents`（单次执行事件）
- `subscribeGatewayBatchEvents`（批次事件）
- `currentBatchId` 变化时 `subscribeGatewayBatch` + `loadBatchStatus`
- 30 秒轮询 `loadBatchStatus`

**保留的函数**：
- `refreshBatchHistory`、`loadBatchStatus`
- `handleBatchExport`、`handleBatchExportDocx`
- `startMockExecution`、`startExecution`（单次链路，保持不动）

**精简后的 JSX 结构**：
```tsx
if (executionSheet) {
  return <div className={styles.taskWorkbench}>
    <aside>{/* 任务步骤 sidebar */}</aside>
    <ExecutionView ... />
  </div>;
}

return (
  <div className={styles.taskWorkbench}>
    <aside>{/* 任务步骤 sidebar + 返回按钮 */}</aside>
    <main className={styles.taskMain}>
      {!currentBatch ? (
        <BatchSetupPanel
          taskContract={taskContract}
          onBatchStarted={async (batchId) => {
            setCurrentBatchId(batchId);
            await refreshBatchHistory(batchId);
            await loadBatchStatus(batchId);
          }}
        />
      ) : null}

      {currentBatch ? (
        <BatchExecutionPanel
          batch={currentBatch}
          chapterRuns={currentBatchRuns}
          batchHistory={batchHistory}
          currentBatchId={currentBatchId}
          onBatchSelect={setCurrentBatchId}
          onRefresh={() => void loadBatchStatus(currentBatch.id)}
          onBatchRefreshHistory={() => void refreshBatchHistory(currentBatchIdRef.current)}
        />
      ) : null}
    </main>
  </div>
);
```

删除后 WorkbenchView.tsx 应在 180-220 行范围内。

---

## 整体 P1 验收清单

完成全部 5 个任务后，依次确认：

- [ ] `node --check oct-gateway/index.js` — 通过
- [ ] `node --check oct-gateway/script_adapter/chapterPipeline.js` — 通过（旧文件 mock_execution.js 已不存在）
- [ ] `npx tsc --noEmit` — 0 错误
- [ ] `npx vitest run`（若有测试覆盖相关文件）— 通过
- [ ] 热更新后工作台正常渲染（开工确认书 + 批次进度 + 弹窗均可正常操作）
- [ ] `grep -r "mock_execution" oct-gateway/` — 无结果
- [ ] `grep -r "useMock" src/` — 无结果
- [ ] `grep -r "console.log.*TODO" src/modules/script-adapter/` — 无结果
- [ ] WorkbenchView.tsx 行数 ≤ 230 行
- [ ] VoiceRegistry 折叠面板在有批次数据时正常展开显示

---

## 补充说明（给 Cursor 读）

### P1-5 执行顺序

先建 3 个新文件，确认 `npx tsc --noEmit` 通过，再精简 WorkbenchView.tsx，再次验证。  
不要同时改两个文件——先让新文件存在并编译通过，才能安全删除 WorkbenchView 里的对应代码。

### BatchExecutionPanel 里的 teamStages

原 WorkbenchView 里 `teamStages` 是从 Zustand store 的 `stages` 衍生而来。迁移后 BatchExecutionPanel 直接使用 `TEAM_ROLE_COPY` 常量作为静态演示列表，不再接入 store。这是有意为之：store 里的 stages 是单次执行链路专用，批次链路暂不需要同步。Phase 2 统一状态机时再整合。

### 不要做的事

- 不要删除 `ExecutionView.tsx`（单次执行链路，P1 不动）
- 不要把 `startMockExecution` / `startExecution` 移出 WorkbenchView（单次链路保持不动）
- 不要在 P1 里实现 VoiceRegistry 编辑功能（P2 任务）
- 不要修改 `DeliveryPreview.tsx`、`ReviewGatePreview.tsx`（P0 刚完成，保持稳定）
