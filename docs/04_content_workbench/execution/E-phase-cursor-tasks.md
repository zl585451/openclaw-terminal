# E 阶段 — Enable：让系统真实从 0→1 跑起来

> 优先级：E，接 P1 完成后执行（P1-1 已完成，P1-2 状态待确认）
> 预计耗时：1-2 天  
> 目标：让批次模式在选择"真实 Agent"后，调用真实 LLM，并在完成后导出可用的 DOCX/Markdown 产物到用户磁盘。
> 执行顺序：**E-1 → E-2 → E-3 → E-4 → E-5**（顺序执行，每步独立 commit）  
> 验证命令：`node --check oct-gateway/index.js` + `npx tsc --noEmit`

---

## 现状诊断（给 Cursor 读）

经过完整链路追踪，以下是各层的真实状态：

### ✅ 已经真实连线（不用改）

| 位置 | 状态 |
|------|------|
| `agentRunner.js` | 真实调用 `mockArtifactFactory.createArtifactForAgent`，按 `realAgents` 开关分流 |
| `textRewriterAgent.js` | 真实 LLM 调用，已实现单段 + chunked 两条路径 |
| `voiceClassifierAgent.js` | 真实 LLM 调用，已实现 |
| `performanceDesignerAgent.js` | 真实 LLM 调用，已实现 |
| `qualityReviewerAgent.js` | 真实 LLM 调用，已实现 |
| `deliveryPackagerAgent.js` | 纯 JS 计算，正确生成 manifest 元数据（不需要 LLM）|
| `batchOrchestrator.js` | 完整的 SQLite 持久化 + 批次状态机，无功能 bug |
| `BatchSetupPanel.tsx` | 有"模拟演示 / 真实 Agent"单选，选"真实"时传 `realAgents: 'all'` ✅ |
| `BatchExecutionPanel.tsx` | `handleExportMarkdown/handleExportDocx` 正确调用 `exportClient.ts` |
| `BatchProgressView.tsx` | 有"导出 Word DOCX / 导出 Markdown 留痕"按钮，绑定了 `onExport/onExportDocx` |
| `main.ts` | `delivery:exportMarkdown` 和 `delivery:exportDocx` 两个 IPC handler 已实现，写真实文件到磁盘 |
| `exportClient.ts` | `renderBatchDeliveryMarkdown` 和 `buildBatchDocxPayload` 完整实现 |

### ❌ 断线 / 假连线（需要修复）

| 编号 | 位置 | 问题 |
|------|------|------|
| E-1 | `batchOrchestrator.js` `fetchBook/fetchChapters` | ai_library 离线时 hard fail，无降级路径 |
| E-2 | `WorkbenchView.tsx` `startExecution()` | `realAgents: 'off'` 硬编码，单章执行链路永远用 mock |
| E-3 | `oct-gateway/config.json` | 无 `scriptAdapter` 节点，LLM provider 配置不可见 |
| E-4 | `batchOrchestrator.js` 83-120 行 | 缩进错乱（`nextStatus` 块视觉上在 `if` 外），需整理 |

---

## 完整执行链路（E 阶段后应该能跑通的路径）

```
用户操作                         代码路径
─────────────────────────────────────────────────────────
1. 打开工作台 → 选书选章节       BatchSetupPanel → aiLibraryClient → library:list IPC
2. 选"真实 Agent" + 开工         startGatewayBatch → script-adapter-batch-start IPC
                                  → main.ts handler → gateway WS → batchOrchestrator.startBatch
3. 批次运行                       batchOrchestrator.runBatchLoop → executeChapter
                                  → chapterPipeline.runSingleScriptAdapterChapter
                                  → agentRunner.runChapterAgentPipeline
                                  → mockArtifactFactory.createArtifactForAgent
                                  → [realAgents='all'] → textRewriterAgent / voiceClassifierAgent /
                                    performanceDesignerAgent / qualityReviewerAgent / deliveryPackagerAgent
4. 完成 → 点"导出 Word DOCX"     BatchProgressView.onExportDocx
                                  → BatchExecutionPanel.handleExportDocx
                                  → exportBatchDeliveryAsDocx → window.electronAPI.delivery.exportDocx
                                  → main.ts handler → dialog.showSaveDialog → fs.writeFile
```

**唯一阻塞第 1 步的是 ai_library 服务**（E-1 修复后解除）  
**唯一阻塞第 3 步的是 realAgents 配置**（BatchSetupPanel 已有 UI，用户需要选"真实 Agent"）

---

## TASK-E-1：修复 batchOrchestrator AI Library 强依赖

### 目标

`batchOrchestrator.js` 的 `startBatch` 函数调用 `fetchBook` 和 `fetchChapters`，这两个函数请求 `http://127.0.0.1:8001`。如果 ai_library 服务没有启动，整个批次会在调用之初就抛异常，用户完全无法开工。

修复：支持内联传参（`params.chapters`），当 ai_library 不可达时用内联数据代替。同时给 `fetchBook`/`fetchChapters` 加 try-catch，给出清晰错误提示。

### 改动

文件 `oct-gateway/script_adapter/batchOrchestrator.js`：

#### 第 1 步 — 修改 startBatch 顶部的 fetch 调用

找到：
```js
  const book = await fetchBook(bookId);
  const chapters = await fetchChapters(bookId);
```

替换为：
```js
  const book = await fetchBook(bookId, params);
  const chapters = await fetchChapters(bookId, params);
```

#### 第 2 步 — 修改 fetchBook 函数

找到：
```js
async function fetchBook(bookId) {
  const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}`);
  return payload?.book || payload || null;
}
```

替换为：
```js
async function fetchBook(bookId, params) {
  // 内联传参降级路径：调用方直接提供 bookTitle，跳过 HTTP 请求
  if (params?.bookTitle) {
    return { id: bookId, title: String(params.bookTitle) };
  }
  try {
    const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}`);
    return payload?.book || payload || null;
  } catch (error) {
    throw new Error(`AI_LIBRARY_UNAVAILABLE: 无法获取书籍信息（${error?.message || error}）。请确认 ai_library 服务在 ${getAiLibraryBase()} 上运行，或在批次请求中直接传入 bookTitle。`);
  }
}
```

#### 第 3 步 — 修改 fetchChapters 函数

找到：
```js
async function fetchChapters(bookId) {
  const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}/chapters`);
  return Array.isArray(payload?.chapters) ? payload.chapters : [];
}
```

替换为：
```js
async function fetchChapters(bookId, params) {
  // 内联传参降级路径：调用方直接提供 chapters 列表
  if (Array.isArray(params?.chapters) && params.chapters.length > 0) {
    return params.chapters.map((chapter, idx) => ({
      id: chapter.id || `${bookId}-${idx}`,
      book_id: bookId,
      chapter_index: typeof chapter.chapter_index === 'number' ? chapter.chapter_index : idx,
      title: chapter.title || `第 ${idx + 1} 章`,
      char_count: chapter.char_count || (chapter.text ? String(chapter.text).length : null),
    }));
  }
  try {
    const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}/chapters`);
    return Array.isArray(payload?.chapters) ? payload.chapters : [];
  } catch (error) {
    throw new Error(`AI_LIBRARY_UNAVAILABLE: 无法获取章节列表（${error?.message || error}）。请确认 ai_library 服务在 ${getAiLibraryBase()} 上运行，或在批次请求中直接传入 chapters 数组。`);
  }
}
```

#### 第 4 步 — 修改 fetchChapter（单章内容）加降级

找到：
```js
async function fetchChapter(bookId, chapterIndex) {
  const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}/chapter/${chapterIndex}`);
  return {
    chapter: payload?.chapter || null,
    text: String(payload?.text || ''),
  };
}
```

替换为：
```js
async function fetchChapter(bookId, chapterIndex) {
  // 注意：单章内容目前无内联降级，必须连接 ai_library
  try {
    const payload = await fetchJson(`${getAiLibraryBase()}/api/library/${encodeURIComponent(bookId)}/chapter/${chapterIndex}`);
    return {
      chapter: payload?.chapter || null,
      text: String(payload?.text || ''),
    };
  } catch (error) {
    throw new Error(`AI_LIBRARY_CHAPTER_UNAVAILABLE: 无法获取第 ${chapterIndex} 章内容（${error?.message || error}）。请确认 ai_library 服务正在运行。`);
  }
}
```

### 验收

```bash
node --check oct-gateway/script_adapter/batchOrchestrator.js
```

无语法错误。

---

## TASK-E-2：修复 WorkbenchView startExecution 中 realAgents 硬编码

### 目标

`WorkbenchView.tsx` 的 `startExecution()` 函数第 101 行把 `realAgents` 写死为 `'off'`。这是单章执行路径（非批次），即使 LLM 配好了也不会调用真实 Agent。

### 改动

文件 `src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`：

#### 第 1 步 — 在组件顶部添加 executionMode state

在 `const currentChapter = ...` 这行之前插入：

```tsx
const [executionMode, setExecutionMode] = useState<'mock' | 'real'>('mock');
```

（需要在文件顶部确认 `useState` 已从 `'react'` 导入，已有则跳过）

#### 第 2 步 — 修改 startExecution 中 realAgents 硬编码

找到：
```ts
    const result = await startGatewayExecution({
      taskId,
      taskTitle,
      source: 'content-workbench',
      sourceText: '',
      config: {
        realAgents: 'off',
        includePerformanceDesign: retryDeliveryOptions.cvDirections || retryDeliveryOptions.bgmSfx,
        deliveryOptions: retryDeliveryOptions,
      },
    });
```

替换为：
```ts
    const result = await startGatewayExecution({
      taskId,
      taskTitle,
      source: 'content-workbench',
      sourceText: '',
      config: {
        realAgents: executionMode === 'real' ? 'all' : 'off',
        includePerformanceDesign: retryDeliveryOptions.cvDirections || retryDeliveryOptions.bgmSfx,
        deliveryOptions: retryDeliveryOptions,
      },
    });
```

#### 第 3 步 — 在 TaskWorkbenchRail 前面插入执行模式选择器

在 `<TaskWorkbenchRail .../>` 这段组件之前（只在非 executionSheet 的渲染路径中），找到：
```tsx
    <TaskWorkbenchRail
      sidebarLabel="已锁定任务"
```

在它的 `<main>` 内，`<BatchSetupPanel ...>` 和 `{!currentBatch ? (` 之间，也就是找：
```tsx
        {!currentBatch ? (
          <BatchSetupPanel
```

在这行之前插入：
```tsx
        {!currentBatch && (
          <div className={styles.card} style={{ padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>单章执行模式：</span>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
              <input type="radio" checked={executionMode === 'mock'} onChange={() => setExecutionMode('mock')} />
              模拟演示
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
              <input type="radio" checked={executionMode === 'real'} onChange={() => setExecutionMode('real')} />
              真实 Agent（调用 LLM）
            </label>
          </div>
        )}
```

**注意**：这个单选只影响"单章试跑"路径（`ExecutionWorkbenchPanel`）。批次路径有自己的模式选择器在 `BatchSetupPanel`。

### 验收

```bash
npx tsc --noEmit
```

无新类型错误。

---

## TASK-E-3：在 config.json 添加 scriptAdapter 配置入口

### 目标

当前 `config.json` 没有 `scriptAdapter` 节点，开发者不知道可以通过配置控制 LLM provider 和默认 realAgents。添加注释式占位配置，说明每个字段的作用。

### 改动

文件 `oct-gateway/config.json`，在 `"ai_library"` 节点之后添加：

```json
"scriptAdapter": {
  "_comment": "有声书台本 Agent 配置。realAgents 控制哪些 Agent 真实调用 LLM（'off'=全 mock, 'all'=全真实, 'agent-id,agent-id2'=指定 agent）。baseUrl/apiKey/model 留空时回退到主 gateway provider。",
  "realAgents": "off",
  "baseUrl": "",
  "apiKey": "",
  "model": ""
}
```

`realAgents` 默认保持 `"off"`（安全侧），用户按需改为 `"all"` 或者从 UI 批次面板的"真实 Agent"单选切换。

### 验收

```bash
node -e "const cfg = require('./config.json'); console.log(cfg.scriptAdapter)"
```

打印 `{ _comment: '...', realAgents: 'off', baseUrl: '', apiKey: '', model: '' }`。

---

## TASK-E-4：整理 batchOrchestrator.js 缩进（nextStatus 块）

### 目标

`runBatchLoop` 函数的 while 循环结束后，`finalSnapshot` 块的缩进是 6 个空格（比 while 的 4 空格多），而且 `persistence.updateBatch` 和 `emit` 看起来在 `if (finalSnapshot)` 外面。整理成标准 2-space nesting，避免误读。

### 改动

文件 `oct-gateway/script_adapter/batchOrchestrator.js`：

找到（大约 100-120 行）：
```js
      const finalSnapshot = persistence.getBatch(batchId);
      if (finalSnapshot) {
        const pendingLeft = finalSnapshot.chapterRuns.some((run) => run.status === 'pending');
        const awaitingReview = finalSnapshot.chapterRuns.some((run) => run.status === 'awaiting_review');
        const nextStatus = controller.signal.aborted
          ? 'cancelled'
          : awaitingReview || pendingLeft
          ? 'paused'
          : finalSnapshot.batch.failedChapters > 0
            ? 'completed'
            : 'completed';
      persistence.updateBatch(batchId, {
        status: nextStatus,
        completedAt: controller.signal.aborted || !pendingLeft ? new Date().toISOString() : null,
      });
      emit(nextStatus === 'cancelled' ? 'batch_cancelled' : 'batch_completed', {
        batch: persistence.getBatch(batchId)?.batch,
      });
    }
```

替换为（缩进统一，逻辑不变）：
```js
    const finalSnapshot = persistence.getBatch(batchId);
    if (finalSnapshot) {
      const pendingLeft = finalSnapshot.chapterRuns.some((run) => run.status === 'pending');
      const awaitingReview = finalSnapshot.chapterRuns.some((run) => run.status === 'awaiting_review');
      const nextStatus = controller.signal.aborted
        ? 'cancelled'
        : awaitingReview || pendingLeft
          ? 'paused'
          : 'completed';
      persistence.updateBatch(batchId, {
        status: nextStatus,
        completedAt: controller.signal.aborted || !pendingLeft ? new Date().toISOString() : null,
      });
      emit(nextStatus === 'cancelled' ? 'batch_cancelled' : 'batch_completed', {
        batch: persistence.getBatch(batchId)?.batch,
      });
    }
```

**说明**：同时修复了 `finalSnapshot.batch.failedChapters > 0 ? 'completed' : 'completed'` 两个分支都返回 `'completed'` 的冗余条件（现在直接返回 `'completed'`）。

### 验收

```bash
node --check oct-gateway/script_adapter/batchOrchestrator.js
```

---

## TASK-E-5：全链路验证 + 变更日志

### 验收命令

```bash
# Gateway 语法检查
node --check oct-gateway/index.js
node --check oct-gateway/script_adapter/batchOrchestrator.js
node --check oct-gateway/script_adapter/chapterPipeline.js

# 前端类型检查
npx tsc --noEmit
```

全部通过，无报错。

### 文档回填

在 `docs/05_changelog/` 创建 `CHANGELOG-E-phase.md`，内容：

```markdown
# E 阶段变更记录

## 日期：YYYY-MM-DD

### E-1：batchOrchestrator AI Library 降级
- `fetchBook`、`fetchChapters`、`fetchChapter` 添加 try-catch，离线时给出明确错误信息
- `startBatch` 支持 `params.bookTitle` 和 `params.chapters` 内联传参，绕过 ai_library HTTP 依赖

### E-2：WorkbenchView 单章执行模式选择
- 添加 `executionMode` state（'mock' | 'real'，默认 mock）
- `startExecution()` 中 `realAgents` 改为读 `executionMode`，不再硬编码 'off'
- 工作台 UI 显示单选"模拟演示 / 真实 Agent"

### E-3：config.json scriptAdapter 配置入口
- 添加 `scriptAdapter` 节点，记录 `realAgents`、`baseUrl`、`apiKey`、`model` 四个可配置项
- 默认 `realAgents: 'off'`，生产环境改 `'all'` 即可全面开启真实 Agent

### E-4：batchOrchestrator.js 缩进整理
- `runBatchLoop` 中 `finalSnapshot` 块缩进统一
- 删除冗余三元分支（两个都返回 'completed'）
```

---

## 附：跑通 0→1 的操作步骤

E 阶段完成后，验证真实交付的操作流：

1. 启动 ai_library 服务（`python main.py` 或相关命令）使其运行在 `http://127.0.0.1:8001`
2. 确认 LLM API Key 已在"设置面板"配置（主 provider 的 Key，script_adapter 会复用）
3. 打开 OpenClaw Terminal → 内容制作工作台
4. 选择书籍和章节（建议先选 1 章验证）
5. 在"最终预算与试产模式"选 **"真实 Agent 试产"**
6. 点"确认开工"
7. 等待批次完成（右侧进度卡显示"已完成"）
8. 点 **"导出 Word DOCX"** → 选择保存路径 → 真实 DOCX 文件写入磁盘

如果不想依赖 ai_library，可以通过直接调用 gateway WebSocket 发送：
```json
{
  "type": "req",
  "method": "scriptAdapter.batch.start",
  "params": {
    "bookId": "test-book",
    "bookTitle": "测试书名",
    "chapterIndices": [0],
    "chapters": [
      {
        "chapter_index": 0,
        "title": "第 1 章",
        "text": "这里是章节正文内容……",
        "char_count": 100
      }
    ],
    "config": {
      "executionMode": "real",
      "realAgents": "all",
      "deliveryOptions": {
        "adaptedScript": true,
        "voiceRegistry": true,
        "qualityReview": true,
        "cvDirections": false,
        "bgmSfx": false,
        "finalPackage": true
      }
    }
  }
}
```
