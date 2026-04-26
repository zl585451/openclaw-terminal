# Week 4 — OCT 双线推进 Prompt(Cursor / Claude 交接包)

> 状态:Week 3 已完成 — 文本改编师真实 LLM、sourceText 链路打通、AI.library 书库 Phase 2 后端 6 个接口齐全
> 工期:**1.5 - 2 天**
> 核心定调:**把书库和内容创作真正接起来,让 demo 一键跑通"上传书 → 选章节 → 真实改编 → 真实角色音"**
> 双线:Track 1 书库×工作台打通(~6h)+ Track 2 角色音统筹真实化(~5h)
> 风险等级:中(都基于 Week 3 已稳定的基础设施)

---

## 〇、Week 4 总目标

让"真实头部 Agent + mock 尾部链路"演进为"书库选章节 → 2 个真实 Agent + 3 个 mock"。一句话:

> 演示路径从"用户粘贴一段文字"升级为"用户从书库挑一章",并且角色音也是真实 LLM 跑出来的。

具体:

1. 工作台开工确认书页面增加"从书库选章节"入口,与现有粘贴 textarea **并列存在**,选了书库章节会自动 fill sourceText
2. 文本改编师跑完后,角色音统筹 Agent **消费真实 adapted_script.segments 里的 speaker 列表**,真实 LLM 输出 voice_registry 角色音表
3. 后续 3 个 Agent(演播设计 / 质检 / 打包)继续 mock,留给 Week 5

---

## 〇.5、跟 Week 3 的关系

Week 3 已经把 `ctx.artifacts` 在 agentRunner 里**完整透传**给 dispatcher(见 `oct-gateway/script_adapter/agentRunner.js:43`),意味着角色音统筹 Agent 可以从 `ctx.artifacts` 直接拿到上一步的 adapted_script,**不需要改 agentRunner / mock_execution.js 的执行框架**。Week 4 Track 2 只在 dispatcher 加一个新的 if 分支。

Week 3 已有的 `oct-gateway/services/llmClient.js`(chatCompletion + resolveProviderFor)是真实 Agent 的公共入口,Week 4 第 2 个真实 Agent 直接复用,不重复实现。

---

## 〇.6、保护清单(沿用 + 新增 1 项)

1. 沿用 Week 1/2/3 全部禁区
2. **不再动 `oct-gateway/script_adapter/agentRunner.js`、`mock_execution.js`**(Week 3 验证稳定,本周新增的真实 Agent 只在 dispatcher 加分支)
3. **不再动 `oct-gateway/services/llmClient.js`、`textRewriterAgent.js`**(Week 3 已锁,Week 4 复用不修改)
4. **不动 AI.library 的 6 个 Phase 2 接口语义和 schema**(只允许追加 / 改 docs)

---

# Track 1 — 书库 × 工作台打通

## 1 总目标

工作台开工确认书页面新增"从书库选章节"入口,选完后自动 fill sourceText 走文本改编师真实 LLM 路径。

不做的事(避免摊大):
- 不做独立的"书库管理页面"(列表 / 上传 / 删除 / 章节预览),留 Week 5
- 不改书库后端任何接口
- 不通过 Gateway 转发 ai_library(直接走 Electron main 代理,与 Gateway 解耦)

## 1 代码范围

预计文件:

- 新建:`electron/main.ts` 内追加 4 个 IPC handler:`library:list / library:get / library:chapters / library:chapter`
- 修改:`electron/preload.ts` 追加 `library` API 字段(只追加,不动现有)
- 新建:`src/modules/script-adapter/services/aiLibraryClient.ts`(前端调 IPC 的 wrapper)
- 新建:`src/modules/script-adapter/ui/Workbench/LibrarySelector.tsx`(选书 → 选章 → 触发 onPick(text))
- 修改:`src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`(在 testInputArea 旁边接入 LibrarySelector,选中章节自动 fill sourceText)
- 修改:`src/modules/script-adapter/styles/scriptAdapter.module.css`(LibrarySelector 样式)
- 新建:`docs/05_changelog/2026-04-XX-script-adapter-library-integration.md`

---

## 1.1 — Electron main 代理 4 个 IPC handler

### 文件

修改 `electron/main.ts`(在已有 `script-adapter-run-start` IPC handler 之后追加)

### 实现要求

复用现有 `resolvedAiLibraryUrlForGateway` 变量(line 853 附近已计算好),所有 IPC 走 fetch 转发到 ai_library 8001 端口。

```typescript
function getAiLibraryBase(): string {
  return (resolvedAiLibraryUrlForGateway || 'http://127.0.0.1:8001').replace(/\/$/, '');
}

async function aiLibraryFetch<T = any>(path: string, init?: RequestInit): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const url = `${getAiLibraryBase()}${path}`;
    const resp = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      return { success: false, error: `AI_LIBRARY_HTTP_${resp.status}: ${body.slice(0, 200)}` };
    }
    const data = await resp.json();
    return { success: true, data: data as T };
  } catch (error: any) {
    return { success: false, error: `AI_LIBRARY_FETCH_FAILED: ${error?.message || String(error)}` };
  }
}

ipcMain.handle('library:list', async (_event, payload: { limit?: number; offset?: number }) => {
  const limit = Number(payload?.limit) > 0 ? Math.floor(Number(payload.limit)) : 50;
  const offset = Number(payload?.offset) >= 0 ? Math.floor(Number(payload.offset)) : 0;
  return aiLibraryFetch(`/api/library/list?limit=${limit}&offset=${offset}`);
});

ipcMain.handle('library:get', async (_event, payload: { bookId: string }) => {
  if (!payload?.bookId) return { success: false, error: 'bookId required' };
  return aiLibraryFetch(`/api/library/${encodeURIComponent(payload.bookId)}`);
});

ipcMain.handle('library:chapters', async (_event, payload: { bookId: string }) => {
  if (!payload?.bookId) return { success: false, error: 'bookId required' };
  return aiLibraryFetch(`/api/library/${encodeURIComponent(payload.bookId)}/chapters`);
});

ipcMain.handle('library:chapter', async (_event, payload: { bookId: string; chapterIndex: number }) => {
  if (!payload?.bookId) return { success: false, error: 'bookId required' };
  if (typeof payload?.chapterIndex !== 'number') return { success: false, error: 'chapterIndex required' };
  return aiLibraryFetch(`/api/library/${encodeURIComponent(payload.bookId)}/chapter/${payload.chapterIndex}`);
});
```

### Done criteria

1. 启动 OCT(确认 AI.library 自启动 = on,8001 端口在线)
2. 在 DevTools console 跑 `await window.electronAPI.library.list({})` 返回 `{ success: true, data: { books: [...] } }`
3. AI.library 没启动时,4 个 IPC 都返回 `{ success: false, error: 'AI_LIBRARY_FETCH_FAILED: ...' }`,**不抛错不崩**

### commit

```
feat(electron/main): ipc proxies for ai_library library endpoints
```

---

## 1.2 — preload 暴露 library API

### 文件

修改 `electron/preload.ts`,在现有 `electronAPI` 对象内追加(其它字段保持不变):

```typescript
library: {
  list: (params?: { limit?: number; offset?: number }) =>
    ipcRenderer.invoke('library:list', params || {}),
  get: (bookId: string) => ipcRenderer.invoke('library:get', { bookId }),
  chapters: (bookId: string) => ipcRenderer.invoke('library:chapters', { bookId }),
  chapter: (bookId: string, chapterIndex: number) =>
    ipcRenderer.invoke('library:chapter', { bookId, chapterIndex }),
},
```

如果项目内有 `electronAPI` 类型定义文件(比如 `src/types/electron.d.ts`),也要对应补类型。grep `electronAPI` 看类型定义在哪。

### Done criteria

`window.electronAPI.library.list / get / chapters / chapter` 在 renderer 都可用,TS 编译通过。

### commit

```
feat(electron/preload): expose library api to renderer
```

---

## 1.3 — 前端 wrapper

### 文件

新建 `src/modules/script-adapter/services/aiLibraryClient.ts`

### 实现要求

```typescript
export interface LibraryBook {
  id: string;
  title: string;
  author: string | null;
  source_type: string;
  source_format: string;
  total_chars: number;
  chapter_count: number;
  uploaded_at: string;
  metadata: string | null;
}

export interface LibraryChapter {
  id: string;
  book_id: string;
  chapter_index: number;
  title: string | null;
  start_char: number | null;
  end_char: number | null;
  char_count: number | null;
  preview: string | null;
}

type LibraryResult<T> = { success: true; data: T } | { success: false; error: string };

function api() {
  if (typeof window === 'undefined' || !window.electronAPI?.library) {
    throw new Error('LIBRARY_API_UNAVAILABLE: 当前环境未注入 ai_library IPC');
  }
  return window.electronAPI.library;
}

export async function listBooks(limit = 50, offset = 0): Promise<LibraryBook[]> {
  const res = (await api().list({ limit, offset })) as LibraryResult<{ books: LibraryBook[] }>;
  if (!res.success) throw new Error(res.error);
  return res.data?.books ?? [];
}

export async function listChapters(bookId: string): Promise<LibraryChapter[]> {
  const res = (await api().chapters(bookId)) as LibraryResult<{ chapters: LibraryChapter[] }>;
  if (!res.success) throw new Error(res.error);
  return res.data?.chapters ?? [];
}

export async function getChapterText(bookId: string, chapterIndex: number): Promise<{ chapter: LibraryChapter; text: string }> {
  const res = (await api().chapter(bookId, chapterIndex)) as LibraryResult<{ chapter: LibraryChapter; text: string }>;
  if (!res.success) throw new Error(res.error);
  return { chapter: res.data.chapter, text: res.data.text };
}
```

### Done criteria

`import { listBooks, listChapters, getChapterText } from '../services/aiLibraryClient'` 在工作台组件可用。

### commit

```
feat(script-adapter): ai_library client wrapper for renderer
```

---

## 1.4 — LibrarySelector 组件

### 文件

新建 `src/modules/script-adapter/ui/Workbench/LibrarySelector.tsx`

### 实现要求

二级下拉:**书** → **章节**。选完章节自动调 `getChapterText` 取正文,通过 `onPick(text, meta)` 回调出去。

```typescript
import { useEffect, useState } from 'react';
import { getChapterText, listBooks, listChapters, type LibraryBook, type LibraryChapter } from '../../services/aiLibraryClient';
import styles from '../../styles/scriptAdapter.module.css';

interface LibrarySelectorProps {
  onPick: (text: string, meta: { bookTitle: string; chapterTitle: string; chars: number }) => void;
  disabled?: boolean;
}

export function LibrarySelector({ onPick, disabled }: LibrarySelectorProps) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [chapters, setChapters] = useState<LibraryChapter[]>([]);
  const [bookId, setBookId] = useState<string>('');
  const [chapterIndex, setChapterIndex] = useState<number | ''>('');
  const [loading, setLoading] = useState<'books' | 'chapters' | 'text' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 初次加载书列表
  useEffect(() => {
    let cancelled = false;
    setLoading('books');
    setError(null);
    listBooks().then((list) => {
      if (cancelled) return;
      setBooks(list);
    }).catch((e) => {
      if (cancelled) return;
      setError(e?.message || '书库连接失败');
    }).finally(() => {
      if (!cancelled) setLoading(null);
    });
    return () => { cancelled = true; };
  }, []);

  // 切书 → 加载章节
  useEffect(() => {
    if (!bookId) {
      setChapters([]);
      setChapterIndex('');
      return;
    }
    let cancelled = false;
    setLoading('chapters');
    setError(null);
    listChapters(bookId).then((list) => {
      if (cancelled) return;
      setChapters(list);
      setChapterIndex(list.length > 0 ? list[0].chapter_index : '');
    }).catch((e) => {
      if (cancelled) return;
      setError(e?.message || '章节加载失败');
    }).finally(() => {
      if (!cancelled) setLoading(null);
    });
    return () => { cancelled = true; };
  }, [bookId]);

  const handlePick = async () => {
    if (!bookId || chapterIndex === '') return;
    setLoading('text');
    setError(null);
    try {
      const { chapter, text } = await getChapterText(bookId, Number(chapterIndex));
      const book = books.find((b) => b.id === bookId);
      onPick(text, {
        bookTitle: book?.title || bookId,
        chapterTitle: chapter.title || `第 ${chapter.chapter_index + 1} 章`,
        chars: text.length,
      });
    } catch (e: any) {
      setError(e?.message || '取章失败');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={styles.librarySelector}>
      <div className={styles.librarySelectorRow}>
        <label>从书库选章节</label>
        {error ? <em className={styles.librarySelectorError}>{error}</em> : null}
      </div>
      <div className={styles.librarySelectorControls}>
        <select
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          disabled={disabled || loading === 'books'}
        >
          <option value="">{loading === 'books' ? '加载中...' : books.length === 0 ? '书库为空' : '选一本书'}</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}{b.author ? ` · ${b.author}` : ''}({b.chapter_count} 章)
            </option>
          ))}
        </select>
        <select
          value={chapterIndex}
          onChange={(e) => setChapterIndex(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={disabled || !bookId || loading === 'chapters'}
        >
          <option value="">{loading === 'chapters' ? '加载中...' : '选一章'}</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.chapter_index}>
              {c.title || `第 ${c.chapter_index + 1} 章`}({c.char_count ?? '?'} 字)
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={handlePick}
          disabled={disabled || !bookId || chapterIndex === '' || loading !== null}
        >
          {loading === 'text' ? '取章中...' : '取入测试输入框'}
        </button>
      </div>
    </div>
  );
}
```

### CSS(追加到 scriptAdapter.module.css 末尾)

```css
.librarySelector {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: rgba(38, 99, 209, 0.05);
  border: 1px dashed rgba(38, 99, 209, 0.30);
  border-radius: 8px;
  margin-bottom: 12px;
}

.librarySelectorRow {
  display: flex;
  align-items: center;
  gap: 12px;
}

.librarySelectorRow label {
  font-size: 12px;
  color: #1d4ed8;
  font-weight: 600;
}

.librarySelectorError {
  font-style: normal;
  font-size: 11px;
  color: #be3838;
}

.librarySelectorControls {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 8px;
}

.librarySelectorControls select {
  padding: 6px 10px;
  border: 1px solid rgba(38, 99, 209, 0.32);
  border-radius: 6px;
  background: white;
  font-family: inherit;
  font-size: 13px;
}
```

### Done criteria

1. AI.library 有书时,下拉能列出
2. 选书后章节下拉刷新
3. 点"取入测试输入框" → onPick 回调被触发
4. AI.library 离线 / 书库空 → 显示友好错误,不崩

### commit

```
feat(script-adapter): library selector component for workbench
```

---

## 1.5 — 接入 WorkbenchView

### 文件

修改 `src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`

### 实现要求

在原有 `testInputArea` 之上插入 `<LibrarySelector />`,onPick 回调直接 setSourceText:

```tsx
import { LibrarySelector } from './LibrarySelector';
// ...

const [sourceText, setSourceText] = useState('');
const [pickedMeta, setPickedMeta] = useState<{ bookTitle: string; chapterTitle: string } | null>(null);

const handleLibraryPick = (text: string, meta: { bookTitle: string; chapterTitle: string; chars: number }) => {
  setSourceText(text);
  setPickedMeta({ bookTitle: meta.bookTitle, chapterTitle: meta.chapterTitle });
};

// 在原有 testInputArea 之前追加:
<LibrarySelector onPick={handleLibraryPick} disabled={!!executionSheet} />

// testInputArea 内显示来源标记(可选):
{pickedMeta ? (
  <small className={styles.librarySourceBadge}>
    来自:《{pickedMeta.bookTitle}》· {pickedMeta.chapterTitle}
  </small>
) : null}
```

CSS:

```css
.librarySourceBadge {
  align-self: flex-start;
  padding: 2px 8px;
  background: rgba(38, 99, 209, 0.12);
  border-radius: 999px;
  font-size: 11px;
  color: #1d4ed8;
}
```

用户手动改 textarea → pickedMeta 失效?可以加个 useEffect 监听 sourceText 变化,如果跟最近一次 pick 的内容不一致就清掉 badge。**简化版可以不做**,Week 4 不在意这个细节。

### Done criteria

1. 打开工作台,看到 LibrarySelector + textarea 两种输入并列
2. 从书库选章节 → textarea 自动填充该章节正文,显示"来自《X》· Y" badge
3. 点确认开工 → 走 Week 3 已有的 `startGatewayExecution` 路径,sourceText 一路到 Gateway
4. 文本改编师跑出该章节的真实改编(不是粘贴的小段,而是整章 1000-5000 字)
5. 章节字数超 4000(Week 3 textRewriter 阈值)→ 文本改编师会 throw `TEXT_REWRITER_TOO_LONG`,pipeline 不崩,产物显示 [改编失败]

### 关键约束

- 不改 textarea 现有行为(用户仍可手动粘贴),LibrarySelector 是**追加的另一种入口**
- 不改 startGatewayExecution / IPC / Gateway 任何代码

### commit

```
feat(script-adapter): integrate library selector into workbench briefing
```

---

## 1.6 — 文档与 changelog

### 新建 changelog

`docs/05_changelog/2026-04-XX-script-adapter-library-integration.md`

至少包含:

1. 改动文件清单(7 个)
2. IPC 新增的 4 个 channel 名称与签名
3. 演示路径(详见整合验收)
4. 已知限制:
   - 章节超 4000 字会失败(Week 3 textRewriter 阈值,Week 5 加切片再处理)
   - 没有书库管理页面,只能用 curl 上传(Week 5)
   - LibrarySelector 在书库为空时只显示"书库为空"提示,没有上传引导(Week 5)
5. 与 Week 3 的衔接说明(复用 sourceText 链路、复用 startGatewayExecution、不改 Gateway)

### 更新接手指南

`docs/03_specs/内容创作工作台/00_项目接手指南.md` 第 3.1 节追加:

```markdown
6. `V2.20`
   工作台开工确认书页面接入书库选章节器,选定章节后自动 fill sourceText,与现有粘贴 textarea 并列。
```

---

## 1 验收标准(Track 1)

- [ ] AI.library 在线 + 有 ≥1 本书时,工作台能列出书与章节
- [ ] 选章节后 textarea 自动填充,badge 显示书名 + 章节名
- [ ] 点确认开工后文本改编师真跑 LLM,日志可见 `sourceText: <length>`
- [ ] AI.library 离线 → LibrarySelector 显示错误,textarea 仍可用
- [ ] 关闭 SCRIPT_ADAPTER_REAL_AGENTS → 行为回退,文本改编师走 mock
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` 通过
- [ ] changelog 已写

---

# Track 2 — 角色音统筹 Agent 真实化

## 2 总目标

让 `classifier.voice_role_marker@1.0` 跳出 mock,真实 LLM 调用,**消费上游 adapted_script 的 segments,提取 speaker 列表**,产出 voice_registry。其它 3 个 Agent(演播 / 质检 / 打包)仍 mock。

## 2 代码范围

预计文件:

- 新建:`oct-gateway/script_adapter/agents/voiceClassifierAgent.js`
- 修改:`oct-gateway/script_adapter/mockArtifactFactory.js`(dispatcher 加 voice_registry 真实分支)
- 新建:`oct-gateway/test/voiceClassifierAgent.test.js`
- 新建:`docs/05_changelog/2026-04-XX-voice-classifier-real-llm.md`
- 修改:`docs/03_specs/内容创作工作台/00_项目接手指南.md`(状态标注)

---

## 2.1 — 写 voiceClassifierAgent.js

### 文件

新建 `oct-gateway/script_adapter/agents/voiceClassifierAgent.js`

### 关键设计

1. **不调 LLM 解析 speaker** — 真实改编台本里 `segment.speaker` 已经是 LLM 标好的,直接用 JS 聚合 speaker 列表 + 出场次数,**只让 LLM 判类别和写声线建议**
2. 类别:`narrator / main / support / unresolved / sfx`,参考 `多人演播角色音分类标注规则.md`
3. 输出 JSON 严格对齐 `VoiceRoleMarkersPayload`(已存在于 `src/modules/script-adapter/types/execution.ts`)

### 实现要求

```javascript
'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');

const SYSTEM_PROMPT = `你是有声书角色音统筹师。给你一段已经改编好的多人演播台本里的角色出场统计,你要为每个角色判断角色音类别,并写一句声线建议。

类别(严格使用):
- narrator: 旁白,通常出场次数最多,无对白以叙述为主
- main: 主要角色,有完整对白,出场频繁
- support: 配角,对白少或仅出场 1-2 次
- unresolved: 文件、广播、回忆、电话等未确认来源的声音
- sfx: 功能性音效或非人声(如系统提示、警报、机械声)

声线建议(voiceHint)写法:性别 + 年龄段 + 情绪基调 + 语速,一句话内,例如"年轻女性,压抑、少话,反应慢半拍"。

输出严格 JSON,不要任何额外解释。结构:
{
  "registry": [
    { "roleName": "string", "category": "narrator|main|support|unresolved|sfx",
      "voiceHint": "一句话声线建议", "appearanceCount": 数字 }
  ],
  "unresolved": ["未定来源角色名 1", "未定来源角色名 2"]
}

注意:
- 必须为输入里的每个 roleName 都给出一项
- registry 顺序按 appearanceCount 降序
- unresolved 字段是 registry 中 category=unresolved 的 roleName 列表
- 不要新增输入里没有的 roleName`;

/**
 * @param {{ artifacts: object }} ctx — 由 agentRunner 透传,artifacts 是已完成 artifact 的字典
 * @returns {Promise<{ payload: object, latencyMs: number, model: string }>}
 */
async function runVoiceClassifierAgent(ctx) {
  const adaptedScript = pickAdaptedScript(ctx?.artifacts);
  if (!adaptedScript) throw new Error('VOICE_CLASSIFIER_NO_ADAPTED_SCRIPT: 上游未产出 adapted_script');

  const segments = Array.isArray(adaptedScript?.payload?.segments) ? adaptedScript.payload.segments : [];
  if (segments.length === 0) throw new Error('VOICE_CLASSIFIER_EMPTY_SEGMENTS');

  // 聚合 speaker 出场次数
  const stats = aggregateSpeakers(segments);
  if (stats.length === 0) throw new Error('VOICE_CLASSIFIER_NO_SPEAKERS');

  const provider = resolveProviderFor('script_adapter');
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `章节标题:${adaptedScript.payload.chapterTitle || '未命名'}\n\n` +
        `角色出场统计(JSON):\n${JSON.stringify(stats, null, 2)}\n\n` +
        `示例片段(供你判断声线情绪):\n${exampleSegments(segments).slice(0, 1500)}`,
    },
  ];

  const result = await chatCompletion({
    provider,
    messages,
    maxTokens: 1500,
    temperature: 0.4,
    responseJson: true,
    timeoutMs: 30000,
  });

  const payload = parseVoiceClassifierOutput(result.content, stats);
  return { payload, latencyMs: result.latencyMs, model: result.model };
}

function pickAdaptedScript(artifacts = {}) {
  return Object.values(artifacts).find((a) => a?.artifactType === 'adapted_script');
}

function aggregateSpeakers(segments) {
  const map = new Map();
  for (const seg of segments) {
    const speaker = (seg.type === 'narration' || !seg.speaker) ? '旁白' : String(seg.speaker).trim();
    if (!speaker) continue;
    map.set(speaker, (map.get(speaker) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([roleName, appearanceCount]) => ({ roleName, appearanceCount }))
    .sort((a, b) => b.appearanceCount - a.appearanceCount);
}

function exampleSegments(segments) {
  return segments
    .slice(0, 6)
    .map((s) => `[${s.speaker || '旁白'}/${s.type}] ${String(s.text || '').slice(0, 80)}`)
    .join('\n');
}

function parseVoiceClassifierOutput(raw, stats) {
  if (!raw) throw new Error('VOICE_CLASSIFIER_EMPTY_OUTPUT');
  const cleaned = raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error(`VOICE_CLASSIFIER_BAD_JSON: ${error.message}; raw=${raw.slice(0, 200)}`);
  }
  if (!parsed || !Array.isArray(parsed.registry)) {
    throw new Error('VOICE_CLASSIFIER_NO_REGISTRY');
  }
  // 兜底:appearanceCount 用本地统计覆盖,防 LLM 算错
  const statMap = new Map(stats.map((s) => [s.roleName, s.appearanceCount]));
  parsed.registry = parsed.registry.map((r) => ({
    roleName: String(r.roleName || ''),
    category: ['narrator', 'main', 'support', 'unresolved', 'sfx'].includes(r.category) ? r.category : 'support',
    voiceHint: String(r.voiceHint || ''),
    appearanceCount: Number(statMap.get(r.roleName) ?? r.appearanceCount ?? 0),
  })).filter((r) => r.roleName);
  // unresolved 字段重算一次
  parsed.unresolved = parsed.registry.filter((r) => r.category === 'unresolved').map((r) => r.roleName);
  return parsed;
}

module.exports = { runVoiceClassifierAgent };
```

### 关键约束

1. **本地聚合 speaker 统计 + LLM 只判类别** — 比让 LLM 数次数稳定得多
2. `appearanceCount` 用本地统计兜底覆盖,即使 LLM 算错也修正
3. 失败时 throw,由 dispatcher 捕获并降级

### Done criteria

测试 3 项(默认 SKIP live):

1. ctx.artifacts 为空 → throw `VOICE_CLASSIFIER_NO_ADAPTED_SCRIPT`
2. adapted_script 存在但 segments 空 → throw `VOICE_CLASSIFIER_EMPTY_SEGMENTS`
3. (live)mock 一份 4 个 segment 的 adapted_script(含 narration + 2 个 dialogue + 1 个 inner_monologue)→ 返回 registry 包含旁白 + 2 个角色 + 内心,每个 category 都在 5 类内,voiceHint 非空

### commit

```
feat(gateway/script_adapter): real voice classifier agent consuming adapted_script
```

---

## 2.2 — dispatcher 加 voice_registry 真实分支

### 文件

修改 `oct-gateway/script_adapter/mockArtifactFactory.js`

### 实现要求

在文本改编师分支后追加角色音统筹分支:

```javascript
const { runVoiceClassifierAgent } = require('./agents/voiceClassifierAgent');

// ... 原 textRewriter 分支结束后追加:

if (
  agentId === 'classifier.voice_role_marker@1.0'
  && isRealAgentEnabled(agentId)
) {
  try {
    const { payload, latencyMs, model } = await runVoiceClassifierAgent(ctx);
    return envelope(
      'voice_registry',
      agentId,
      displayName,
      '角色音标注表',
      `已用 ${model} 分类完成,${payload.registry.length} 个角色,耗时 ${latencyMs}ms`,
      payload,
      { roles: payload.registry.length, unresolved: payload.unresolved.length, latencyMs },
    );
  } catch (error) {
    return envelope(
      'voice_registry',
      agentId,
      displayName,
      '分类失败',
      `角色音真实分类失败,已回退占位:${String(error?.message || error).slice(0, 80)}`,
      { registry: [], unresolved: [] },
      { error: 1 },
    );
  }
}
```

### Done criteria

1. `SCRIPT_ADAPTER_REAL_AGENTS=adapter.audiobook_text_rewriter@1.0,classifier.voice_role_marker@1.0` → 两个 Agent 都真跑
2. `SCRIPT_ADAPTER_REAL_AGENTS=all` → 两个 Agent 真跑(因为 dispatcher 只对这两个有 real 分支),其余 3 个仍 mock
3. 文本改编师失败时,角色音 Agent **不会跟着崩** — 它的 ctx.artifacts 里有"改编失败的占位 adapted_script",会因为 `payload.segments.length === 0` 抛 EMPTY_SEGMENTS 错,被 dispatcher 捕获返回"分类失败"占位

### commit

```
feat(gateway/script_adapter): wire voice classifier into dispatcher
```

---

## 2.3 — 文档与 changelog

### 新建 changelog

`docs/05_changelog/2026-04-XX-voice-classifier-real-llm.md`

至少包含:

1. 改动文件清单
2. 启用方式 — 加到 `SCRIPT_ADAPTER_REAL_AGENTS` 即可
3. 与文本改编师的依赖关系(消费 adapted_script.segments)
4. 已知限制:
   - 演播设计 / 质检 / 打包 仍 mock,留 Week 5
   - 不做角色去重 / 别名合并(比如"小明"和"明哥"算两个角色)
   - LLM 输出的 category 兜底为 support(unknown 类不强制人工干预)
5. 单次调用预估成本:~0.01-0.02 元(角色音 prompt 比改编小很多)

### 更新接手指南

`docs/03_specs/内容创作工作台/00_项目接手指南.md` 第 5.1 节:

```markdown
3. `classifier.voice_role_marker@1.0` ← **已具备真实 LLM 调用能力(Week 4)**
```

---

## 2 验收标准(Track 2)

- [ ] 离线测试(2 项)PASS
- [ ] live 测试(1 项)PASS:用 mock adapted_script 跑通 → 真实 voice_registry 输出
- [ ] 启用 `SCRIPT_ADAPTER_REAL_AGENTS=all` 后,跑完整流程,文本改编 + 角色音都是真实
- [ ] 文本改编失败时,角色音 Agent 优雅降级,显示"分类失败"占位,pipeline 不中断
- [ ] 工作台 ArtifactPreview 角色音表能渲染真实数据(narrator/main/support/unresolved 色块都正确)
- [ ] `npx tsc --noEmit` 通过(本 Track 不动 TS,但确认前端不受影响)
- [ ] changelog 已写

---

# 整合验收

## Week 4 完成的标志

**端到端演示路径(给 Zilong 5-10 分钟跑通)**:

```powershell
# Step 0: AI.library + Gateway + Electron 启动

# Step 1: 上传一本测试小说(沿用 Week 3 Track 2)
curl -F "file=@test_novel.txt" -F "title=长夜未瞑" -F "author=测试" `
  http://127.0.0.1:8001/api/library/upload

# Step 2: 启用真实 Agent
$env:SCRIPT_ADAPTER_REAL_AGENTS='adapter.audiobook_text_rewriter@1.0,classifier.voice_role_marker@1.0'
$env:SCRIPT_ADAPTER_MODEL='qwen-max-latest'
# 重启 Gateway

# Step 3: 在工作台
# 1. 进入开工确认书页面
# 2. 看到 LibrarySelector,选《长夜未瞑》
# 3. 选第 1 章(假设 800-3000 字)
# 4. 点"取入测试输入框",textarea 自动填充,显示来自《...》· 第一章 badge
# 5. 点确认开工
# 6. 看 5 个 Agent 串行执行:
#    - 文本改编师:真跑 LLM,产出真实改编
#    - 角色音统筹:真跑 LLM,消费上游真实 segments,产出真实 voice_registry
#    - 演播设计 / 质检 / 打包:仍 mock,但消费真实上游产物
# 7. 产物预览:adapted_script segments 真实、voice_registry 角色真实
```

## 演示成本

| 调用 | 模型 | 单次成本 |
|------|------|---------|
| 文本改编师(800-3000 字) | qwen-max | ~0.05 元 |
| 角色音统筹 | qwen-max | ~0.01-0.02 元 |
| **每次开工总成本** | | **~0.06-0.07 元** |

---

# 留 Week 5+

**Week 5 候选**:

1. **第 3-5 个 Agent 真实化**(演播设计 / 质检 / 打包),让 5 个 Agent 全真
2. **执行单持久化**(SQLite,刷新不丢)— 这是 Week 3/4 都暂没做的,Week 5 再做也合理
3. **超长章节自动切片**(章节超 4000 字时,文本改编师内部分批调 + 拼接)
4. **书库独立前端 UI**(列表 / 上传 / 删除 / 章节预览),让用户不用 curl
5. **真实文件解析**(parser.source_document):.docx / .epub 上传到书库
6. **角色去重 / 别名合并**(角色音统筹的进阶版)

**Week 6+**:
- 局部 Agent 重跑、断点续传
- 多任务并发执行(`abortPipeline` 全局单例重做)
- 工作流编辑器(让用户调整 Agent 顺序、跳过某步)

---

# 给 Cursor / Claude 的协作约定

## 工作节奏建议(1.5-2 天)

第 1 天:
- 上午:Track 1 全部(1.1 → 1.6,~6h)
- 下午:Track 2 的 2.1 + 2.2(~3h)

第 2 天:
- 上午:Track 2 的 2.3(~1h)+ 整合验收

---

## 协作规则

1. Track 1 / Track 2 完全独立,可以两台 Cursor 并行(Track 1 在前端 / Electron / IPC,Track 2 在 Gateway)
2. **Track 2 依赖 Week 3 已稳定的 dispatcher 架构,不要动 dispatcher 的现有 textRewriter 分支**
3. **不要扩张到"做书库管理页面"或"接第 3 个 Agent"** — 务实第一,留 Week 5
4. 任何修改保护清单文件停下问 Zilong

## 卡壳速查

1. **`window.electronAPI.library` TypeScript 报错** — grep 项目内 electronAPI 类型定义文件,补字段;实在不行用 `(window as any).electronAPI.library`
2. **AI.library 离线时 LibrarySelector 报错** — 这是预期行为,显示错误就行,不要强制启动
3. **文本改编 + 角色音两个真实 Agent 一起跑超时** — 两个调用串行,总耗时可能 30-60 秒,确认 timeoutMs 够长(textRewriter 45s,voiceClassifier 30s)
4. **章节字数超 4000** — Week 4 不做切片,直接报 TOO_LONG 即可;Cursor 不要顺手加切片逻辑(那是 Week 5)
5. **角色音 LLM 输出 category 不在枚举里** — dispatcher 已经兜底为 support,不会崩

## 完成后回报

- Track 1 commit 列表 + 工作台 LibrarySelector 截图
- Track 2 commit 列表 + 真实 voice_registry 产物截图
- 整合验收路径执行完的截图(从书库选章 → 5 个 Agent 跑完 → 看到 2 个真实产物)
- 任何卡壳或决策需求

Zilong 确认通过后,进入 Week 5。

---

## 相关文档

- Week 3 计划:`docs/03_specs/Week3-Dual-Track-Cowork-Handoff.md`
- Week 1 计划:`docs/03_specs/Week1-Dual-Track-Cowork-Handoff.md`
- Week 2 计划(归档):`docs/_archive/process_handoffs/cowork-week2/`
- 内容创作主线:`docs/03_specs/内容创作工作台/`
- 书库 Phase 2 接口:`docs/02_architecture/AI_LIBRARY_OCT.md`
- LLM 公共调用:`oct-gateway/services/llmClient.js`(Week 3)
- 角色音规则:`docs/03_specs/内容创作工作台/多人演播角色音分类标注规则.md`
