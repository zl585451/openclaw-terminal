# Project Layer MVP 实现方案

> 目标：把书库进化成 Project 层，AMY 在对话中自动感知当前项目（书名、作者、章节结构），
> 同时把 Canvas 的上传功能移走，Canvas 只做 AI 产出物。
>
> **范围约定：只做 MVP，不做 Book Intelligence AI 生成（留扩展位），不做 Canvas 读取章节，不做多人协作。**

---

## 一、完整链路（5 跳）

```
useWebSocket.ts  →  electron/main.ts  →  oct-gateway/index.js  →  contextBuilder.js  →  AMY system prompt
   (send)          (openclaw-send IPC)   (handleChatRequest)       (_buildSystemPrompt)
```

**每一跳都需要透传 `projectContext`，一处漏掉整条链路就断。**

---

## 二、改动文件总览（11 处）

| # | 文件 | 类型 | 说明 |
|---|------|------|------|
| 1 | `src/components/workbench/WorkbenchPanel.tsx` | 修改 | 移除 Canvas 上传按钮 |
| 2 | `src/contexts/ProjectContext.tsx` | 新建 | 活跃项目全局状态 |
| 3 | `src/types/gateway.ts` | 修改 | 消息载荷加 `projectContext` |
| 4 | `src/hooks/useWebSocket.ts` | 修改 | send 时携带 `projectContext` |
| 5 | `src/hooks/useMessages.ts` | 修改 | 透传 `projectContext` |
| 6 | `src/modules/script-adapter/ui/Library/BookCard.tsx` | 修改 | 加"设为当前项目"按钮 |
| 7 | `src/modules/script-adapter/ui/Library/LibraryView.tsx` | 修改 | 接入 ProjectContext |
| 8 | `src/main.tsx` | 修改 | 包裹 `ProjectProvider` |
| **9** | **`electron/main.ts`** | **修改** | **⚠️ 关键中间节点：IPC handler + sendChatMessage 透传** |
| 10 | `oct-gateway/index.js` | 修改 | 从请求 params 里取 `projectContext` |
| 11 | `oct-gateway/runtime/contextBuilder.js` | 修改 | 注入项目上下文到 system prompt |

**Backend 无需改动**：`api_server.py` 和 `library_db.py` 现有接口已满足 MVP 需求。
（`book_intelligence` 列可留到 Book Intelligence Phase 2 再加）

---

## 二、逐文件具体实现

---

### 1. `src/components/workbench/WorkbenchPanel.tsx` — 移除 Canvas 上传

**删除以下内容：**

```tsx
// ❌ 删除整个 handleImportScript 函数（约第 80-109 行）
const handleImportScript = useCallback(async () => {
  ...
}, [importing, workbench]);

// ❌ 删除 state
const [importing, setImporting] = useState(false);

// ❌ 删除 import
import { inferImportedTextArtifactType, parseScript } from '../../utils/scriptParser';
```

**工具栏里删除（约第 166-174 行）：**
```tsx
// ❌ 删除这个按钮
<button
  className="canvas-action-btn"
  onClick={handleImportScript}
  disabled={importing}
  title="上传 .txt 或 .docx 文本文件"
>
  {importing ? '解析中…' : '📄 文本'}
</button>
```

**空状态里删除（约第 126-132 行）：**
```tsx
// ❌ 删除 empty state 里的上传按钮
<button
  className="canvas-action-btn"
  style={{ marginTop: '16px' }}
  onClick={handleImportScript}
  disabled={importing}
>
  {importing ? '解析中…' : '📄 上传文本'}
</button>
```

**空状态文案改为：**
```tsx
const renderEmptyState = () => (
  <div className="canvas-empty">
    <div className="canvas-empty-title">Workbench</div>
    <div className="canvas-empty-copy">
      AMY 的产出物会出现在这里。在左侧 Projects 选择一本书，然后开始对话。
    </div>
  </div>
);
```

---

### 2. `src/contexts/ProjectContext.tsx` — 新建

```tsx
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { listBooks, listChapters } from '../modules/script-adapter/services/aiLibraryClient';
import type { LibraryBook, LibraryChapter } from '../modules/script-adapter/services/aiLibraryClient';

export interface ActiveProject {
  id: string;
  title: string;
  author: string | null;
  total_chars: number;
  chapter_count: number;
  chapters: Array<{
    chapter_index: number;
    title: string | null;
    char_count: number | null;
  }>;
  // 扩展位：AI 生成书脑（Phase 2）
  book_intelligence?: string | null;
}

interface ProjectContextValue {
  activeProject: ActiveProject | null;
  activeProjectId: string | null;
  setActiveProjectById: (bookId: string | null) => Promise<void>;
  clearActiveProject: () => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const STORAGE_KEY = 'oct.active-project-id';

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY) || null; } catch { return null; }
  });
  const [activeProject, setActiveProject] = useState<ActiveProject | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 初始化：有持久化 ID 时恢复项目数据
  useEffect(() => {
    if (!activeProjectId) return;
    void loadProject(activeProjectId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProject = useCallback(async (bookId: string) => {
    setIsLoading(true);
    try {
      const books = await listBooks();
      const book = books.find((b: LibraryBook) => b.id === bookId);
      if (!book) {
        // 书已被删除，清除持久化
        setActiveProjectId(null);
        setActiveProject(null);
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
        return;
      }
      const chapters = await listChapters(bookId);
      setActiveProject({
        id: book.id,
        title: book.title,
        author: book.author,
        total_chars: book.total_chars,
        chapter_count: book.chapter_count,
        chapters: chapters.map((c: LibraryChapter) => ({
          chapter_index: c.chapter_index,
          title: c.title,
          char_count: c.char_count,
        })),
      });
    } catch (e) {
      console.warn('[ProjectContext] 加载项目失败:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setActiveProjectById = useCallback(async (bookId: string | null) => {
    if (!bookId) {
      setActiveProjectId(null);
      setActiveProject(null);
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return;
    }
    setActiveProjectId(bookId);
    try { localStorage.setItem(STORAGE_KEY, bookId); } catch {}
    await loadProject(bookId);
  }, [loadProject]);

  const clearActiveProject = useCallback(() => {
    setActiveProjectId(null);
    setActiveProject(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return (
    <ProjectContext.Provider value={{
      activeProject,
      activeProjectId,
      setActiveProjectById,
      clearActiveProject,
      isLoading,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
```

---

### 3. `src/types/gateway.ts` — 加 `projectContext` 字段

在 `GatewaySendPayload` 接口里加一个字段：

```ts
// 在现有 GatewaySendPayload 接口里追加
export interface GatewaySendPayload {
  content: string;
  imageDataUrl?: string;
  files?: UploadedFile[];
  pacingMs?: number;
  workbenchContext?: WorkbenchRoundtripContext;
  canvasContext?: WorkbenchRoundtripContext;
  requestId?: string;
  // 新增：活跃项目上下文，AMY 在 system prompt 中感知当前书目
  projectContext?: {
    id: string;
    title: string;
    author: string | null;
    total_chars: number;
    chapter_count: number;
    chapters: Array<{ chapter_index: number; title: string | null; char_count: number | null }>;
  } | null;
}
```

---

### 4. `src/hooks/useWebSocket.ts` — send 时携带 `projectContext`

找到 `send` 函数（约第 312-336 行），修改签名和调用：

```ts
// 修改 send 函数签名，新增 projectContext 参数
const send = async (
  content: string,
  imageDataUrl?: string,
  files?: GatewaySendPayload['files'],
  pacingMs?: number,
  workbenchContext?: WorkbenchRoundtripContext,
  requestId?: string,
  projectContext?: GatewaySendPayload['projectContext']   // ← 新增
): Promise<GatewaySendResult> => {
  const normalizedRequestId = typeof requestId === 'string' ? requestId.trim() : '';
  try {
    const result = await ipcRenderer.invoke<GatewaySendResult>('openclaw-send', {
      content: content.trim(),
      imageDataUrl,
      files,
      pacingMs,
      workbenchContext,
      canvasContext: workbenchContext,
      requestId: normalizedRequestId || undefined,
      projectContext: projectContext ?? null,  // ← 新增
    });
    return result || {};
  } catch (error) {
    console.error('[useWebSocket] send error:', error);
    return {};
  }
};
```

同时更新 `useWebSocket` 返回值的类型声明（如果有独立 interface，更新对应签名）。

---

### 5. `src/hooks/useMessages.ts` — 透传 `projectContext`

找到 `sendMessage` 函数（约第 953-957 行）：

```ts
// 修改 sendMessage 签名
const sendMessage = useCallback(async (
  text: string,
  imageDataUrl: string | null,
  files?: UploadedFile[],
  workbenchContext?: WorkbenchRoundtripContext
) => {
```

**步骤：**

1. 在 hook 内顶部引入 `useProject`：
```ts
import { useProject } from '../contexts/ProjectContext';
```

2. 在 hook 函数体内调用：
```ts
const { activeProject } = useProject();
```

3. 在 `sendMessage` 内找到调用 `ws.send(...)` 的地方（约第 1073 行附近），追加 `projectContext`：
```ts
// 找到类似这样的调用
await ws.send(
  finalContent,
  imageDataUrl,
  files,
  pacingMs,
  roundtripContext,
  requestId,
  activeProject   // ← 新增，直接传 activeProject（结构一致）
);
```

> 注意：`activeProject` 的结构与 `GatewaySendPayload['projectContext']` 一致，可直接传递。

---

### 6. `src/modules/script-adapter/ui/Library/BookCard.tsx` — 加"设为当前项目"

```tsx
import type { LibraryBook } from '../../services/aiLibraryClient';
import styles from '../../styles/scriptAdapter.module.css';

interface BookCardProps {
  book: LibraryBook;
  isActive?: boolean;           // ← 新增
  onView: () => void;
  onDelete: () => void;
  onSetActive: () => void;      // ← 新增
}

export function BookCard({ book, isActive = false, onView, onDelete, onSetActive }: BookCardProps) {
  const charsLabel =
    book.total_chars >= 10000 ? `${(book.total_chars / 10000).toFixed(1)} 万字` : `${book.total_chars} 字`;

  return (
    <article
      className={styles.bookCard}
      style={isActive ? { borderColor: 'var(--accent-primary)', borderWidth: '2px' } : undefined}
    >
      <div className={styles.bookCardBody}>
        <strong>
          {isActive && <span style={{ color: 'var(--accent-primary)', marginRight: '6px' }}>▶</span>}
          {book.title}
        </strong>
        <em>{book.author || '佚名'}</em>
        <small>{book.chapter_count} 章 · {charsLabel}</small>
        <small className={styles.bookCardMeta}>
          上传于 {new Date(book.uploaded_at).toLocaleDateString('zh-CN')}
        </small>
      </div>
      <div className={styles.bookCardActions}>
        {!isActive && (
          <button type="button" className={styles.ghostButton} onClick={onSetActive}>
            设为当前项目
          </button>
        )}
        {isActive && (
          <span style={{ fontSize: '12px', color: 'var(--accent-primary)', padding: '4px 8px' }}>
            当前项目 ✓
          </span>
        )}
        <button type="button" className={styles.ghostButton} onClick={onView}>查看</button>
        <button type="button" className={styles.dangerButton} onClick={onDelete}>删除</button>
      </div>
    </article>
  );
}
```

---

### 7. `src/modules/script-adapter/ui/Library/LibraryView.tsx` — 接入 ProjectContext

```tsx
import { useEffect, useState } from 'react';
import { deleteBook, listBooks, type LibraryBook } from '../../services/aiLibraryClient';
import { BookCard } from './BookCard';
import { BookDetailDrawer } from './BookDetailDrawer';
import { UploadDialog } from './UploadDialog';
import { useProject } from '../../../../contexts/ProjectContext';  // ← 新增
import styles from '../../styles/scriptAdapter.module.css';

export function LibraryView() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailBookId, setDetailBookId] = useState<string | null>(null);
  const { activeProjectId, setActiveProjectById } = useProject();  // ← 新增

  // ...（refresh、useEffect、handleDelete 保持不变）

  // 渲染 BookCard 时传入新 props：
  {books.map((book) => (
    <BookCard
      key={book.id}
      book={book}
      isActive={book.id === activeProjectId}              // ← 新增
      onView={() => setDetailBookId(book.id)}
      onDelete={() => void handleDelete(book.id, book.title)}
      onSetActive={() => void setActiveProjectById(book.id)} // ← 新增
    />
  ))}
```

---

### 8. `src/main.tsx` — 包裹 ProjectProvider

```tsx
import { ProjectProvider } from './contexts/ProjectContext';  // ← 新增

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <PermissionsProvider>
        <ProjectProvider>        {/* ← 新增 */}
          <App />
        </ProjectProvider>        {/* ← 新增 */}
      </PermissionsProvider>
    </SettingsProvider>
  </React.StrictMode>,
)
```

---

### 9. `electron/main.ts` — ⚠️ 关键中间节点

这是最容易漏掉的一环。`sendChatMessage` 函数和 `openclaw-send` IPC handler
都需要同时改，否则 `projectContext` 在进入 WebSocket 之前就丢失了。

**第一步：修改 `sendChatMessage` 函数签名（约第 1624 行）**

```ts
function sendChatMessage(
  content: string,
  imageDataUrl?: string | null,
  files?: UploadedFile[],
  pacingMs?: number,
  workbenchContext?: any,
  requestId?: string,
  projectContext?: any   // ← 新增
): { success: boolean; error?: string } {
```

**第二步：在 `params` 对象里加入 `projectContext`（约第 1648 行）**

```ts
const params: {
  sessionKey: string;
  idempotencyKey: string;
  message: string;
  attachments?: any[];
  pacingMs?: number;
  workbenchContext?: any;
  canvasContext?: any;
  projectContext?: any;   // ← 新增类型声明
} = {
  sessionKey: currentSessionKey,
  idempotencyKey,
  message: finalMessage,
  pacingMs,
};
if (workbenchContext) {
  params.workbenchContext = workbenchContext;
  params.canvasContext = workbenchContext;
}
// ← 新增：
if (projectContext) {
  params.projectContext = projectContext;
}
```

**第三步：修改 `openclaw-send` IPC handler（约第 4198 行）**

```ts
ipcMain.handle('openclaw-send', (_, payload: string | {
  content: string;
  imageDataUrl?: string | null;
  files?: UploadedFile[];
  pacingMs?: number;
  workbenchContext?: any;
  canvasContext?: any;
  requestId?: string;
  projectContext?: any;   // ← 新增
}) => {
  // ...
  let projectContext: any;   // ← 新增变量声明

  if (typeof payload === 'string') {
    // ...（其余字段赋值不变）
    projectContext = undefined;   // ← 新增
  } else if (payload && typeof payload === 'object') {
    // ...（其余字段赋值不变）
    projectContext = payload.projectContext ?? undefined;   // ← 新增
  } else {
    // ...
    projectContext = undefined;   // ← 新增
  }

  return sendChatMessage(content, imageDataUrl, files, pacingMs, workbenchContext, requestId, projectContext);
  //                                                                                           ↑ 新增最后一个参数
});
```

---

### 11. `oct-gateway/index.js` — 取 `projectContext`

找到 `handleChatRequest` 函数里的 params 解构（约第 281 行）：

```js
// 现有代码
const workbenchContext = params?.workbenchContext || params?.canvasContext || null;

// 在这行之后新增：
const projectContext = params?.projectContext || null;
```

找到调用 `contextBuilder.build(...)` 的地方（约第 376-382 行），加入 `projectContext`：

```js
const { messages, history } = await contextBuilder.build({
  sessionKey,
  userMessage,
  attachments,
  workbenchContext,
  orchestratorResult: orchResult,
  systemPrompt,
  projectContext,   // ← 新增
});
```

---

### 10. `oct-gateway/runtime/contextBuilder.js` — 注入项目上下文到 system prompt

**步骤 A：`build()` 方法接收 `projectContext`**

```js
// 修改 build 方法签名
async build({
  sessionKey,
  userMessage,
  attachments,
  workbenchContext,
  orchestratorResult,
  systemPrompt,
  projectContext,   // ← 新增
}) {
  // ...
  
  // 修改调用 _buildSystemPrompt 的地方（约第 107 行）
  const finalSystemPrompt = await this._buildSystemPrompt({
    systemPrompt,
    userMessage,
    history,
    imageAttachments,
    sessionKey,
    projectContext,   // ← 新增
  });
```

**步骤 B：`_buildSystemPrompt` 生成项目上下文字符串**

```js
// 修改 _buildSystemPrompt 签名
async _buildSystemPrompt({ systemPrompt, userMessage, history, imageAttachments, sessionKey, projectContext }) {
  // ... 现有代码不变 ...
  
  // 在 return 之前新增：
  const projectCtxStr = this._buildProjectContextSection(projectContext);
  
  // 修改 return 语句（原来是：return modelContext + finalSystemPrompt + timeContext + knowledgeContext）
  return modelContext + finalSystemPrompt + timeContext + projectCtxStr + knowledgeContext;
}
```

**步骤 C：新增 `_buildProjectContextSection` 方法**（加在类的末尾，`_injectTaskContext` 之后）

```js
/**
 * 把活跃 Project 的书目信息格式化为 system prompt 注入块。
 * 仅包含结构性元数据（书名/作者/章节列表），不含正文，不占大量 token。
 */
_buildProjectContextSection(projectContext) {
  if (!projectContext || !projectContext.id) return '';

  const { title, author, total_chars, chapter_count, chapters } = projectContext;

  const charsLabel = total_chars >= 10000
    ? `${(total_chars / 10000).toFixed(1)} 万字`
    : `${total_chars} 字`;

  // 章节目录（最多展示 60 章，防止超长）
  const chaptersToShow = (chapters || []).slice(0, 60);
  const chapterLines = chaptersToShow.map((c) => {
    const title = c.title ? c.title : `第 ${c.chapter_index + 1} 章`;
    const chars = c.char_count ? `（${c.char_count} 字）` : '';
    return `  ${c.chapter_index + 1}. ${title}${chars}`;
  });
  if ((chapters || []).length > 60) {
    chapterLines.push(`  ... 共 ${chapter_count} 章（仅展示前 60 章）`);
  }

  return `\n\n[当前项目]\n` +
    `书名：《${title}》\n` +
    `作者：${author || '未知'}\n` +
    `规模：${chapter_count} 章 · ${charsLabel}\n` +
    `目录：\n${chapterLines.join('\n')}\n` +
    `\n注：上方为当前用户正在制作的有声书项目。用户询问书中内容时，基于以上结构进行回答；` +
    `若需要具体章节原文，请告知用户将该章节加载到 Canvas。`;
}
```

---

## 三、冲突分析：Canvas 现有 origin:'user' 文件

**当前状态**：WorkbenchPanel 的 `handleImportScript` 创建的 document 有 `origin: 'user'`，
存在 localStorage（key: `oct-workbench-state-v1`）。

**MVP 处理方式**：不做自动迁移，只做两件事：
1. 移除上传入口（本方案第 1 条）
2. 保持现有 origin:'user' 的 document 能继续正常展示（WorkbenchPanel 渲染逻辑不变）

**不会有冲突**：`origin` 字段目前只用于展示（`canvas-toolbar-meta` 显示 `document.origin`），
没有业务逻辑基于 origin:'user' 做特殊分支。移除上传入口后，已有数据继续展示，
新进来的数据全是 origin:'ai'，功能不受影响。

**若未来要做迁移引导**（Phase 2）：检测 documents 里有 origin:'user' 的文档时，
展示一个 banner："你有 X 个上传的文档，要移到 Project 里吗？"

---

## 四、扩展位（不做，但结构已预留）

| 功能 | 预留位置 |
|------|---------|
| Book Intelligence AI 生成 | `ActiveProject.book_intelligence` 字段 / `api_server.py` 新增 `/generate-intelligence` 端点 |
| Canvas 加载 Project 章节 | `useProject()` 暴露 `loadChapterToCanvas(chapterIndex)` 方法 |
| 迁移引导（origin:'user' 文档） | WorkbenchPanel 检测后展示 banner |
| 团队协作 | `books` 表 `owner` 字段 / `ProjectContext` 支持 members |

---

## 五、执行顺序建议（给 Cursor）

1. 新建 `ProjectContext.tsx`（#2）
2. 修改 `main.tsx` 包裹 Provider（#8）
3. 修改 `gateway.ts` 类型（#3）
4. 修改 `WorkbenchPanel.tsx` 移除上传（#1）
5. 修改 `BookCard.tsx` + `LibraryView.tsx`（#6、#7）
6. 修改 `useWebSocket.ts`（#4）
7. 修改 `useMessages.ts`（#5）
8. **修改 `electron/main.ts`（#9）← 关键，不能漏**
9. 修改 `oct-gateway/index.js`（#10）
10. 修改 `oct-gateway/runtime/contextBuilder.js`（#11）
11. 验证：上传一本书 → 在项目库点"设为当前项目" → 发消息 → 看 Gateway 日志里是否出现 `[当前项目]` 注入块

---

*生成时间：2026-04-27*
