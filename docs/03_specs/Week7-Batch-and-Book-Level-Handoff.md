# Week 7 — OCT 批量章节 / 全书级任务承接方案(Cursor 交接包)

> 2026-04-27 实际执行说明:
> 本文中的“批次执行骨架 / SQLite 持久化 / 失败隔离 / 历史与导出”已被采纳为 Week 7 主骨架，
> 但最终执行版不是原文逐条照搬，而是与预算闸门方案合并后落在 `Week7-Merged-Execution-Summary.md`。

> 状态:Week 6 已完成 — 书库管理 UI、导出 .md、超长章节切片
> 工期:**2.5 - 3 天**(本周显著比 Week 1-6 重)
> 核心定调:**从"单章演示工具"升级为"全书级生产工具"**
> 双线:Track 1 批量执行内核(后端 + 持久化) + Track 2 批量交互(章节范围 + 进度面板)
> 风险等级:中高(动数据模型,但不动 5 个 Agent 内部)

---

## 〇、为什么必须做(对齐 Zilong 的真实业务)

OCT 当前用户是**有声书制作团队**,真实业务量级:

- 短篇小说:几十万字
- 中长篇:**100 万字以上**
- 单章字数:3000-4000 字(刚好不触发 Week 6 切片)
- 单本书章节数:200-300 章

**Week 6 之前的"单章工作流"完全没法承接生产**。让人手动开 200 次"确认开工"是不现实的。Week 7 必须把"单章"升级为"批次/全书"。

Zilong 提的 5 类真实问题对应的解决思路:

| 问题域 | Week 7 这周做 | Week 8+ 留 |
|------|------|------|
| 任务输入层(范围选择) | 章节多选 / 范围拖选 / 全书勾选 + 实时预估 | 跨书制作、复合任务模板 |
| 执行模型(批量调度) | BatchJob → ChapterRun 二层模型,失败隔离,单章重跑 | 暂停/继续、并发执行、跨任务 |
| 一致性(跨章) | **角色音跨章累积**(轻量先行) | 完整一致性层(剧情记忆、术语词典、风格基线) |
| 交付层(批次结果) | 批次进度面板、失败清单、单章展开看产物 | 全书 .docx 合并、整本 .epub 导出、按角色拆音轨 |
| 产品结构(项目空间) | 工作台升级"项目工作台"模式,但保留"快速测试"单章入口 | 项目级 dashboard、跨任务历史检索、项目成本统计 |

---

## 〇.5、Zilong 验收时只做这些(不开终端)

1. **Track 1 完成 + 配置开关 Cursor 给好后**:Zilong 不用任何配置,默认就生效
2. **Track 2 完成后,做一次端到端**:
   - 进工作台 → 选《长夜未瞑》 → 在新版章节选择器里框选第 1-5 章 → 看预估"5 章 / 18000 字 / 预计 8 分钟 / 预计 0.65 元"
   - 点"启动批次" → 进入"批次进度面板",看 5 章按顺序在跑
   - 故意让其中第 3 章失败(可以选一个超 12000 字的章节触发) → 看其他章不受影响,失败章右侧出现"重跑"按钮
   - 全部完成后看"批次交付清单",每章可点开查看 5 个产物
   - 关掉 OCT 再打开 → 进度还在,产物还在(持久化)

---

## 〇.6、产品交互草图(给 Cursor 看,不给 Zilong)

### 章节范围选择器(替代 Week 3 的 textarea + Week 4 的 LibrarySelector "选单章")

```
┌────────────────────────────────────────────────────────┐
│ 选择章节范围                          [✓ 全选] [清空]   │
├────────────────────────────────────────────────────────┤
│ 切换:[● 范围]  [○ 离散]  [○ 全书]                     │
│                                                         │
│ ▼《长夜未瞑》共 287 章 / 1,182,440 字                  │
│                                                         │
│ ◯ 第 1 章 樟木箱      3,420 字  ┐                      │
│ ◉ 第 2 章 旧相机      4,108 字  │ 已选 5 章            │
│ ◉ 第 3 章 楼上的灯    3,892 字  │ 18,234 字            │
│ ◉ 第 4 章 雨夜        3,214 字  │ 预计 8 分钟          │
│ ◉ 第 5 章 信封        3,600 字  │ 预计 0.65 元(qwen) │
│ ◉ 第 6 章 夜色未眠    3,420 字  ┘                      │
│ ◯ 第 7 章 父亲的笔记本                                  │
│ ... (滚动)                                              │
│                                                         │
│ [启动批次制作]                                          │
└────────────────────────────────────────────────────────┘
```

3 种模式:
- **范围模式**:点首章 + Shift 点尾章 → 自动框选连续区间
- **离散模式**:每章独立勾选 / 反选
- **全书模式**:一键勾选全部,显示总成本

### 批次进度面板(替代 Week 5 的"5 个 Agent 卡片")

```
┌────────────────────────────────────────────────────────┐
│ 批次:《长夜未瞑》第 2-6 章       [暂停] [取消] [详情] │
│ 总进度:3 / 5 章完成    总耗时:5m 12s   总花费:0.39元│
├────────────────────────────────────────────────────────┤
│ ✓ 第 2 章 旧相机       2.1m  ¥0.13   [展开看产物]      │
│ ✓ 第 3 章 楼上的灯     1.8m  ¥0.12   [展开看产物]      │
│ ⟳ 第 4 章 雨夜      [文本改编师 48%]                    │
│ ○ 第 5 章 信封        排队中                            │
│ ○ 第 6 章 夜色未眠    排队中                            │
│                                                         │
│ ✗ (没有失败章节)                                       │
└────────────────────────────────────────────────────────┘
```

完成后底部追加:

```
┌────────────────────────────────────────────────────────┐
│ ✅ 批次完成 5/5,共 18,234 字,耗时 8m 24s,花费 ¥0.65 │
│                                                         │
│ [📦 导出整批 Markdown]  [📋 复制汇总 JSON]             │
└────────────────────────────────────────────────────────┘
```

如果有失败章节:

```
│ ⚠️ 1 章失败:                                          │
│   第 4 章 雨夜  错误:LLM_TIMEOUT  [🔁 重跑] [跳过]    │
```

---

## 〇.7、保护清单(沿用 + 关键)

1. 沿用 Week 1-6 全部禁区
2. **绝对不动 5 个 Agent 文件**(`agents/*.js`):本周改的是**调度层**,不是 Agent 内部
3. **textRewriterAgent 的切片功能保持单章内**(Week 6 已锁),批次调度是更上层的事,跟切片无关
4. **AI.library 后端不动**,继续用 Week 4 的 6 个接口
5. **"单章测试"入口保留**(LibrarySelector 选单章那条路径,做 demo 时用)

---

# Track 1 — 批量执行内核

## 1 总目标

把 Gateway 的 `scriptAdapter` 从"一次跑一章"升级为"一次跑 N 章",并且**进度持久化**(关掉 OCT 重开能继续看)。

## 1.1 — 数据模型(SQLite)

### 文件

新建 `oct-gateway/script_adapter/persistence.js`(后端持久化层,放 Gateway 内,**不放 ai_library**)

数据库:`%APPDATA%/OpenClaw-Terminal/userData/script_adapter.sqlite3`(独立于 ai_library 的 library.sqlite3)

### Schema

```sql
-- 批次任务(父任务)
CREATE TABLE IF NOT EXISTS batch_jobs (
  id TEXT PRIMARY KEY,                  -- batch-uuid
  book_id TEXT NOT NULL,                -- ai_library 的 book_id
  book_title TEXT NOT NULL,
  selected_chapter_indices TEXT NOT NULL, -- JSON 数组,如 [1, 2, 3, 4, 5]
  status TEXT NOT NULL,                 -- 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused'
  total_chapters INTEGER NOT NULL,
  completed_chapters INTEGER DEFAULT 0,
  failed_chapters INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  estimated_cost REAL,                  -- 预估元
  actual_cost REAL DEFAULT 0,           -- 实际元
  config TEXT                           -- JSON: { realAgents, model, ... }
);

-- 章节级 run(子任务,等价于 Week 5 的 TaskExecutionSheet,但带 batch_id)
CREATE TABLE IF NOT EXISTS chapter_runs (
  id TEXT PRIMARY KEY,                  -- run-uuid
  batch_id TEXT NOT NULL,
  book_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL,
  chapter_title TEXT,
  source_chars INTEGER,
  status TEXT NOT NULL,                 -- 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  sheet TEXT,                           -- JSON: 完整 TaskExecutionSheet 序列化(产物 + run 信息)
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  cost REAL DEFAULT 0,
  attempt INTEGER DEFAULT 1,            -- 第几次尝试(重跑会 +1)
  FOREIGN KEY (batch_id) REFERENCES batch_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chapter_runs_batch ON chapter_runs(batch_id, chapter_index);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status, created_at DESC);
```

### 关键 API

```javascript
// persistence.js 导出
function createBatch(batch) {...}              // 插入 + 同时为每章插入 chapter_runs(status='pending')
function getBatch(batchId) {...}                // 父任务 + 全部 chapter_runs
function listBatches(limit, offset) {...}       // 历史批次列表
function updateBatchStatus(batchId, status) {...}
function updateChapterRun(runId, updates) {...} // 部分更新(status, sheet, error 等)
function listChapterRuns(batchId) {...}
function findRetryCandidate(batchId) {...}      // 找下一个 pending / failed-need-retry
function deleteBatch(batchId) {...}
```

### Cursor 容易踩的坑

| 坑 | 怎么处理 |
|----|---------|
| sheet 字段塞 JSON 太大 | 单章 sheet ~50KB,200 章 = 10MB,SQLite 没问题。但**不要序列化原始章节正文进 sheet**(那是 ai_library 的事) |
| Electron 主进程访问 sqlite | 用 `better-sqlite3`(同步、快、Electron 友好);grep 一下项目里是不是已经装了 |
| 数据库路径 | 用 `electron.app.getPath('userData')`,跟 AI.library 的 library_data 平级,叫 `script_adapter.sqlite3` |
| 表初始化时机 | Gateway 启动时 `ensureSchema()`,跟 ai_library 的 `ensure_schema()` 同样模式 |

---

## 1.2 — Gateway 路由升级

### 现有(Week 1-5)

`scriptAdapter.run.start / cancel / list`(单章)

### 新增(Week 7,**保留旧的不删**)

```
scriptAdapter.batch.start          { bookId, chapterIndices: number[], config? } → { batchId }
scriptAdapter.batch.status         { batchId } → { batch, chapterRuns: [...] }
scriptAdapter.batch.cancel         { batchId } → { success }
scriptAdapter.batch.pause          { batchId } → { success }   // Week 8 实现,Week 7 接口占位
scriptAdapter.batch.resume         { batchId } → { success }   // Week 8
scriptAdapter.batch.rerunChapter   { batchId, chapterIndex } → { success }
scriptAdapter.batch.list           { limit, offset } → { batches: [...] }
scriptAdapter.batch.delete         { batchId } → { success }
```

事件(沿用 Week 1 的 `event: 'script-adapter'` 频道,payload 区分 sub-event):

```
batch_created        { batchId, batch }
chapter_started      { batchId, chapterIndex, runId }
chapter_progress     { batchId, chapterIndex, agentId, percent, summary }
chapter_completed    { batchId, chapterIndex, runId, sheet }
chapter_failed       { batchId, chapterIndex, runId, error }
batch_completed      { batchId }
batch_cancelled      { batchId }
```

### 内部调度逻辑(`oct-gateway/script_adapter/batchOrchestrator.js`)

伪代码:

```javascript
async function startBatch({ bookId, chapterIndices, config }, connection) {
  const batchId = `batch-${uuid()}`;
  const book = await fetchBook(bookId);                 // 调 ai_library
  // 入库 batch_jobs + chapter_runs(全部 pending)
  persistence.createBatch({ batchId, bookId, ... });
  emit('batch_created', { batchId, batch });

  // 串行跑(Week 7 不做并发,Week 8 加)
  for (const chapterIndex of chapterIndices) {
    if (await persistence.isCancelled(batchId)) break;
    
    const run = await persistence.startChapterRun(batchId, chapterIndex);
    emit('chapter_started', { batchId, chapterIndex, runId: run.id });
    
    try {
      const chapterText = await fetchChapterText(bookId, chapterIndex);  // 调 ai_library
      // ⭐ 关键:复用 Week 5 已有的 mock_execution / runMockAgentPipeline,只是把每章包成一个独立的 sheet
      const sheet = await runSingleChapter({
        taskId: run.id,
        taskTitle: `《${book.title}》第 ${chapterIndex + 1} 章`,
        sourceText: chapterText,
        ctx: await buildSharedContext(bookId, batchId),     // 见 1.3 一致性骨架
        onProgress: (agentId, percent, summary) => {
          emit('chapter_progress', { batchId, chapterIndex, agentId, percent, summary });
        },
      });
      
      await persistence.completeChapterRun(run.id, sheet);
      await updateSharedContext(bookId, sheet);             // 见 1.3
      emit('chapter_completed', { batchId, chapterIndex, runId: run.id, sheet });
      
    } catch (error) {
      await persistence.failChapterRun(run.id, error.message);
      emit('chapter_failed', { batchId, chapterIndex, error: error.message });
      // ⭐ 失败隔离:不 throw,继续下一章
    }
  }
  
  await persistence.completeBatch(batchId);
  emit('batch_completed', { batchId });
}
```

### Cursor 容易踩的坑

| 坑 | 怎么处理 |
|----|---------|
| 怎么复用 Week 5 已稳定的单章 pipeline | runMockAgentPipeline 已经接受 `{ sheet, emit, signal, onSheetUpdate, ctx }`,直接当函数调即可,不要在 batchOrchestrator 内重写 5 个 Agent 调度 |
| 单章失败拖整批 | for 循环每章独立 try/catch,**绝对不能让 throw 跳出 for** |
| 长批次中途用户关闭 OCT | persistence 写到 SQLite,重启后调 `findInterruptedBatches()` 把状态从 'running' 恢复成 'paused',显示"该批次中断,可继续" |
| 重跑某章 | `rerunChapter` 把 chapter_runs 的 status 重置为 pending,attempt+1,然后调度器重新拾起 |

---

## 1.3 — 一致性骨架(Week 7 只做角色音跨章共享)

完整的"项目级共享上下文"是 Week 8 主菜。Week 7 先做**角色音表跨章累积**作为先行验证 — 这是 5 个 Agent 里**最容易因为不一致而翻车**的(同一个角色在第 1 章是 narrator、第 50 章变 main 是不能接受的)。

### 数据

`batch_jobs.config` JSON 字段加一个子字段:

```json
{
  "realAgents": "all",
  "model": "qwen-max-latest",
  "sharedContext": {
    "voiceRegistry": [
      { "roleName": "周佳宁", "category": "main", "voiceHint": "...", "appearanceCount": 47 }
    ],
    "lastUpdatedAtChapter": 5
  }
}
```

### 调度时注入

`buildSharedContext(bookId, batchId)` 返回 `{ sharedVoiceRegistry: [...] }`,塞进 `ctx`。

agentRunner 的 ctx 已经能透传任何字段,**voiceClassifierAgent 不改 prompt 框架,只在调用时 prepend 一段:**

```
当前书已经累积的角色音表(请保持一致,不要改类别 / 声线;新角色才新增):
旁白(narrator)/ 周佳宁(main)/ 周婉云(main)/ ...
```

### 完成后回写

每章 `voice_registry` 产物完成后,`updateSharedContext(bookId, sheet)` 把新角色 merge 进 batch_jobs.config,**已存在的角色不覆盖**。

### Cursor 容易踩的坑

| 坑 | 怎么处理 |
|----|---------|
| 角色名细微差异(小明 vs 明哥) | 第一版**严格按 roleName 字符串匹配**,差异留 Week 8 用 LLM 做别名归并 |
| 第 N 章把第 1 章已经定的"narrator"改成"main" | merge 时**已存在角色不覆盖**,前端 UI 在产物里给个小提示"角色音已锁定,如需调整请到批次设置" |
| sharedContext 越来越大 token 爆 | 累积 50 个角色 ~2KB JSON,塞进 prompt 没事;>100 个时 Week 8 加截断 |

---

# Track 2 — 批量交互(章节范围选择 + 进度面板)

## 2 总目标

工作台从"开工确认书 单章" → "项目工作台 批次"。**保留单章入口**(给快速测试 / demo 用,从 LibrarySelector "取入测试输入框"那条路径不删)。

## 2.1 — 章节范围选择器

### 文件

新建:

- `src/modules/script-adapter/ui/Workbench/ChapterRangeSelector.tsx`
- `src/modules/script-adapter/store/scriptAdapterStore.ts` 加批次相关字段

替代/并存:Week 4 的 LibrarySelector 保留(单章入口),新选择器作为"批次入口"。

### 视觉(已在 〇.6 节给出)

### 关键交互

1. 默认显示当前书的全部章节列表(虚拟滚动 — 用 `react-window` 或自己写 IntersectionObserver,**章节 200+ 时不卡**)
2. 三种模式切换:范围 / 离散 / 全书
3. **实时预估**(本地计算,不调 LLM):
   - 章节数 = selected.length
   - 总字数 = sum(selected.char_count)
   - 预计耗时 = 章节数 × 60s(单章实测平均,留 buffer)
   - 预计成本 = 章节数 × 0.13 元(qwen-max)或 0.05 元(deepseek)— 模型从配置读
4. 章数过 50 时给警示:"批次较大,建议先跑 5 章试样章看效果"

### Cursor 容易踩的坑

| 坑 | 怎么处理 |
|----|---------|
| 200+ 章渲染慢 | 用 react-window 或类似;实在不想引依赖,自己用 `slice(visibleStart, visibleEnd)` + 滚动事件 |
| 全选按钮误点导致 200 章直接跑 | "启动批次"前弹原生 confirm,显示"确认启动 X 章批次,预计 Y 元 Z 分钟" |
| Shift 范围选 | onClick 时记录 lastClickedIndex,Shift+Click 时 fill(lastClickedIndex, currentIndex) |

---

## 2.2 — 批次进度面板

### 文件

- 新建:`src/modules/script-adapter/ui/Workbench/BatchProgressView.tsx`
- 修改:`WorkbenchView.tsx`(原 ExecutionView 路径走单章,BatchProgressView 走批次)
- store 新增 `currentBatch / chapterRunsByIndex` 字段订阅 Gateway 事件

### 视觉(已在 〇.6 节给出)

### 关键交互

1. **每章一行**,显示状态图标 + 章节名 + 耗时 + 成本 + 操作按钮
2. 状态图标沿用 Week 5 的 `○ ⟳ ✓ ✗ ⏸`(已有 token,不重新发明)
3. **当前正在跑的章节展开**,显示 5 个 Agent 进度(复用 Week 5 的 ExecutionView 内部组件)
4. **失败章节**(`status='failed'`)右侧出现红色"重跑"按钮,点击调 `scriptAdapter.batch.rerunChapter`
5. **完成章节**点"展开看产物",**复用 Week 5 的 ArtifactPreview + DeliveryPreview**(单章产物展示无需重做)

### Cursor 容易踩的坑

| 坑 | 怎么处理 |
|----|---------|
| 200 章列表 | 同样用虚拟滚动 |
| 进度事件丢失(网络抖动) | 加 `scriptAdapter.batch.status` 定期 poll(30s 一次)兜底 |
| 实时进度卡顿(每秒收 5 个事件) | 进度面板用 `requestAnimationFrame` 节流,store 只更新 chapterRunsByIndex,不全量重渲染 |

---

## 2.3 — 历史批次入口

工作台导航栏(已有"工作台 / 团队流程 / Agent 池 / 我的书库")**新增第 5 个 tab**:`📋 批次历史`。

### 视觉

```
┌────────────────────────────────────────────────────────┐
│ 📋 批次历史                                             │
├────────────────────────────────────────────────────────┤
│ ✅《长夜未瞑》第 2-6 章   2026-04-29 14:23  5/5 ¥0.65 │
│ ⚠️《长夜未瞑》第 1 章     2026-04-29 11:08  1/1 ¥0.13 │
│ ⏸《破晓时分》第 1-50 章   2026-04-28 22:15  12/50 中断│
│   [继续此批次] [查看产物]                              │
│ ✗《破晓时分》第 1-3 章   2026-04-28 18:00  0/3 失败  │
└────────────────────────────────────────────────────────┘
```

点击单条 → 进入批次详情(复用 BatchProgressView,只读模式)。

中断的批次有"继续此批次"按钮 — Week 7 接口占位但不实现实际逻辑(留 Week 8),按钮显示"留 Week 8"提示。

---

## 2.4 — 批次完成后的"交付汇总"

复用 Week 5 的 `DeliveryPreview` 但升级为批次版:

```
┌────────────────────────────────────────────────────────┐
│ 《长夜未瞑》第 2-6 章 · 多人演播交付包                  │
│ ────────────────────────────────────────────────────  │
│ 📊 批次统计                                            │
│ 5 章完成 · 18,234 字 · 角色 8 名 · 总耗时 8m24s         │
│ 实际花费 ¥0.65                                         │
│                                                         │
│ 📚 章节清单(可点开看每章产物)                          │
│ - 第 2 章 旧相机     (展开)                            │
│ - 第 3 章 楼上的灯   (展开)                            │
│ - 第 4 章 雨夜       (展开)                            │
│ - 第 5 章 信封       (展开)                            │
│ - 第 6 章 夜色未眠   (展开)                            │
│                                                         │
│ 🎭 整批角色音表(跨章共享,8 个角色)                   │
│ 旁白 / 周佳宁 / 周婉云 / ...                            │
│                                                         │
│ [📦 导出整批 Markdown]  [📋 复制批次 JSON]             │
└────────────────────────────────────────────────────────┘
```

整批 Markdown 导出 — Week 6 的 `exportDeliveryAsMarkdown` 升级,接受多个 sheet,在 .md 里按章节分隔。

### Cursor 容易踩的坑

| 坑 | 怎么处理 |
|----|---------|
| 批次大(>20 章)时 .md 文件几 MB | 不要分页,直接整个写出来,Electron writeFile 撑得住 |
| 章节顺序 | 严格按 chapter_index 排序,不要按 completed_at(失败重跑会乱) |

---

# Week 7 必做 / 不做 切割

## ✅ Week 7 必做

1. SQLite 持久化(batch_jobs + chapter_runs)
2. `scriptAdapter.batch.*` 路由(start / status / cancel / rerunChapter / list / delete)
3. batchOrchestrator 串行调度(失败隔离)
4. **角色音跨章共享**(轻量版)
5. 章节范围选择器(范围 / 离散 / 全书 + 实时预估)
6. 批次进度面板(实时跑 + 失败重跑)
7. 批次历史 tab + 中断状态展示
8. 批次完成后整批 Markdown 导出

## ❌ Week 7 不做(明确告诉 Cursor 不要顺手做)

1. **暂停 / 继续**(`scriptAdapter.batch.pause/resume` 接口占位但内部未实现)— Week 8
2. **并发执行**(2-4 章同时跑加速)— Week 8
3. **完整一致性层**(剧情记忆 / 术语词典 / 风格基线)— Week 8
4. **跨书制作**(一次跑多本书)— Week 9+
5. **整本 .docx / .epub 导出**— Week 8
6. **角色名别名归并**(小明 vs 明哥)— Week 8
7. **成本实时显示**到设置面板— Week 9+
8. **批次模板**(保存"全书 + qwen-max + 真实 5 Agent"为常用模板)— Week 9+

---

# 三、最大风险点(给 Zilong 的预警)

按风险大小排序:

### 风险 1:**长批次首次试跑时间会长得吓人**

200 章 × 60 秒/章 = 200 分钟 = **3.3 小时**。Zilong 第一次跑全书会震惊。

**预防**:
- 章节范围选择器**默认提示"建议先跑 5 章试样章"**
- 批次启动前 confirm 弹窗显示预估耗时
- 进度面板要做得"可关掉但后台继续跑"(刷新 OCT 不影响 Gateway 后台执行)

### 风险 2:**LLM provider rate limit / 配额耗尽**

200 章 × 5 Agent × 1-2 次调用 = 1000-2000 次 LLM 调用。一次 burst 跑全书很可能撞 provider 限速。

**预防**:
- batchOrchestrator 章节间默认间隔 1-2 秒(简单 setTimeout)
- 单章失败时记录错误码,如果是 429(rate limit),自动等 30 秒后重试一次再标失败
- 批次开工前在 confirm 框显示"如果你的 API 配额不足,建议分批跑"

### 风险 3:**持久化 schema 早期定不死**

Week 8 加完整一致性层、剧情记忆,sheet 字段可能要扩。

**预防**:
- batch_jobs / chapter_runs 都加 `config` / `sheet` 这种 JSON 字段(扩展靠 JSON 内部,不动表结构)
- DB migration 函数预留(`migrate_v1_to_v2()` 占位)

### 风险 4:**用户重启 OCT 时正在跑的批次状态**

Gateway 退出 → 内存里的执行循环死了 → SQLite 里的 batch_jobs 还是 'running' 状态 → 用户以为还在跑

**预防**:
- Gateway 启动时调 `findRunningBatches()`,把状态强制改成 'paused',前端在批次历史里显示"中断,Week 8 支持继续"
- 用户能选"删除该批次"清理掉

### 风险 5:**前端虚拟滚动写歪**

200+ 章如果不做虚拟滚动,DevTools 看到 200 个 React 节点同时渲染,卡顿明显。

**预防**:
- 必须用 `react-window`(项目里 grep 一下是否已装,没装的话装)
- 或者简化版:只渲染 visibleStart..visibleEnd ± 10 个,用 `<div style={{height: 'fillerHeight'}}/>` 占位

---

# Week 8+ 路线总览(基于 Zilong 实际业务)

### Week 8 — **跨章一致性 + 暂停继续**(产品力周)

- 完整 sharedContext:剧情进展摘要(用 Week 1 summarizer)、专有名词词典、风格基线
- 暂停 / 继续(state machine 升级)
- 章节并发执行(2-4 章同时跑,加速 2-4 倍)
- 角色名别名归并(LLM-based)

### Week 9 — **全书交付物 + 检索补强**

- 整本 .docx / .epub 导出
- DeliveryPreview 升级到"项目级"(整本书的产物 dashboard)
- AI.library Phase 3:把上传的小说接进 Chroma 向量库,主对话 AI 真能引用书库内容(Zilong 之前提的撞墙点 4)
- 失败章节自动重试 N 次

### Week 10 — **生产化体验**

- 设置面板加成本可视化("本月用了 X 元")
- 批次模板("全书 · qwen-max · 真实 5 Agent")保存
- 书库分页 / 搜索 / 标签
- 性能压测:连续跑 1000 章不崩

### Week 11+ — **第二批 Agent / 跨书能力**

- task.intake_planner / business.content_analyzer 真实化
- 跨书制作(一次跑多本)
- Workspace 隔离(Claude Projects 风格,Zilong 提过)

---

# 给 Cursor 的协作约定

## 时间安排建议(2.5-3 天,**比之前的 Week 重**)

第 1 天:
- 上午:Track 1.1 SQLite + persistence.js(~3h)
- 下午:Track 1.2 batchOrchestrator + 路由(~5h)

第 2 天:
- 上午:Track 1.3 角色音跨章共享(~3h)+ Track 2.1 章节范围选择器(~5h)
- 下午:Track 2.2 批次进度面板(~5h)

第 3 天:
- 上午:Track 2.3 历史 tab + 2.4 整批导出(~4h)
- 下午:整合验收 + changelog + Zilong 验收 5 分钟跑通

## 必须遵守

1. **Zilong 不开终端**。配置开关全部默认开,或在设置面板暴露
2. **不动 5 个 Agent 文件**(`agents/*.js`),本周改的是调度层
3. **保留"单章测试"入口**(LibrarySelector 选单章那条路径不删)
4. **章节范围选择器和批次进度面板必须用虚拟滚动**(>50 章不卡)
5. **失败隔离铁律**:任何一章失败不能拖垮整个批次
6. **重启 OCT 后**,running 状态自动改 paused,不要给用户造成"还在跑"的假象

## Cursor 完成后回报清单

- [ ] Track 1 + Track 2 commit 列表
- [ ] **录屏**:从工作台选《长夜未瞑》→ 框选第 2-6 章 → 启动批次 → 进度面板看 5 章跑完 → 看交付汇总 → 导出 .md
- [ ] 一份**真实** 5 章 .md 导出文件粘贴在 changelog 里
- [ ] 一次失败章节 → 重跑成功的截图(故意挑超 12000 字章节触发失败)
- [ ] 关闭 OCT → 重开 → 批次历史 tab 看到中断的批次 + "Week 8 支持继续"提示

---

## 相关文档

- Week 6 计划:`docs/03_specs/Week6-Dual-Track-Cowork-Handoff.md`
- 已锁基础设施:5 个 `oct-gateway/script_adapter/agents/*.js`、`agentRunner.js`、`mock_execution.js`、`llmClient.js`
- AI.library 接口:`docs/02_architecture/AI_LIBRARY_OCT.md`
- Week 5 ArtifactPreview / DeliveryPreview(本周复用展示组件):`src/modules/script-adapter/ui/Workbench/`
