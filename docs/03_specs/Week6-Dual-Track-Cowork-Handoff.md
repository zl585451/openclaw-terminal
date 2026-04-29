# Week 6 — OCT 双线收口 Prompt(Cursor / Claude 交接包)

> 状态:Week 5 已完成 — 5 个 Agent 全真、DeliveryPreview 卡片、ArtifactPreview 5 种结构化展示
> 工期:**1.5 - 2 天**
> 核心定调:**让 Zilong 完整自助使用 — 不用 curl 上传、产物能拿走、章节字数不再卡死**
> 双线:Track 1 书库管理 UI + Track 2 导出文件 + 超长章节切片
> 风险等级:中(主要是新前端页面 + 一处真实 Agent 流水线改造)

---

## 〇、Week 6 总目标

Zilong 一句话验收:**"从工作台点开'我的书库',网页里上传一本 5 万字的小说,选第 1 章(8000 字),开工,看到 5 个 Agent 全跑通,然后把改编台本导出成 .md 文件给制作团队"**。

具体:

1. 工作台导航增加第 4 个 tab "📚 我的书库",点开能看见所有藏书
2. 网页上传(拖拽 / 点击选择)→ 不再用 curl
3. 章节超过 4000 字时,**文本改编师自动切片处理**,而不是直接报错
4. 改编台本可一键导出 `.md` 文件(包含所有 segment、speaker、rewriteNote)

---

## 〇.5、Zilong 验收时只做 3 件事

1. **Track 1 完成后**:点工作台导航的"📚 我的书库",拖一个 .txt 进去,看是否能上传 + 列表 + 预览章节 + 删除
2. **Track 2.1 完成后**:跑一次完整流程,在 DeliveryPreview 点"导出 Markdown",在弹出的保存对话框选位置,**用文本编辑器打开**看内容是否完整
3. **Track 2.2 完成后**:挑一个 5000-10000 字的章节,跑文本改编师,**确认不会再报 TOO_LONG**

其他 Cursor 自行完成,**不要让 Zilong 跑终端、装依赖、手改 config**。

---

## 〇.6、Cursor 必须遵守的 4 条铁律

1. **不动已锁基础设施**:`agentRunner.js / mock_execution.js / llmClient.js`、5 个 agents/*.js 不要改文件结构(切片功能在 textRewriterAgent **内部**改,不动外部接口)
2. **不动 AI.library 后端**(Phase 2 接口已稳定)— Track 1 全部用 Week 4 已经做好的 4 个 IPC,**不新增**ai_library 接口
3. **导出文件用 Electron 主进程的 `dialog.showSaveDialog` + `fs.writeFileSync`**,不要在 renderer 里搞 Blob/a.download(那是浏览器的方式,Electron 里别扭)
4. **切片合并逻辑由 textRewriterAgent 内部封装**,对调用方完全透明,Gateway / 前端零感知

---

## 〇.7、保护清单(沿用)

沿用 Week 1-5 全部禁区。本周新增:`oct-gateway/script_adapter/agentRunner.js`、`mock_execution.js` 已锁(Week 3-5 都没动);5 个 `agents/*.js` 中除了 `textRewriterAgent.js`(本周内部改造)外,其他 4 个**不动**。

---

# Track 1 — 书库管理 UI

## 1 总目标

让 Zilong 不用打开终端就能完整管理书库。新增独立"我的书库"页面,作为主导航的第 4 个 tab。

## 1 文件清单

预计:

- 修改:`src/modules/script-adapter/ui/ScriptAdapterLayout.tsx`(主导航加第 4 个 tab)
- 修改:`src/modules/script-adapter/store/scriptAdapterStore.ts`(`ViewMode` 加 `'library'`)
- 新建:`src/modules/script-adapter/ui/Library/LibraryView.tsx`(书库主页面 — 列表)
- 新建:`src/modules/script-adapter/ui/Library/BookCard.tsx`(书的卡片)
- 新建:`src/modules/script-adapter/ui/Library/UploadDialog.tsx`(上传对话框)
- 新建:`src/modules/script-adapter/ui/Library/BookDetailDrawer.tsx`(单本书详情 + 章节列表)
- 修改:`src/modules/script-adapter/services/aiLibraryClient.ts`(新增 `uploadBook` + `deleteBook`)
- 修改:`electron/main.ts`(追加 `library:upload` + `library:delete` IPC)
- 修改:`electron/preload.ts`(`library` 对象加 `upload` + `remove` 方法)
- 修改:`src/modules/script-adapter/styles/scriptAdapter.module.css`(追加书库样式)
- 新建:`docs/05_changelog/2026-04-XX-script-adapter-library-ui.md`

---

## 1.1 — Electron 加 upload + delete IPC

### 文件

修改 `electron/main.ts`(追加,**不动现有 4 个 library:* handler**)

### 实现要点

```typescript
import { dialog } from 'electron';
import * as FormData from 'form-data';   // 如果项目里没有,Cursor 用 native fetch + Blob 替代

ipcMain.handle('library:upload', async (_event, payload: {
  filePath: string;
  title: string;
  author?: string;
}) => {
  if (!payload?.filePath) return { success: false, error: 'filePath required' };
  if (!payload?.title) return { success: false, error: 'title required' };

  try {
    const buffer = await fs.promises.readFile(payload.filePath);
    const filename = path.basename(payload.filePath);

    // 用 FormData (Node 18+ 内置 fetch + FormData)
    const fd = new FormData();
    fd.append('file', new Blob([buffer]), filename);
    fd.append('title', payload.title);
    fd.append('author', payload.author || '');
    fd.append('source_type', 'novel');

    const url = `${getAiLibraryBase()}/api/library/upload`;
    const resp = await fetch(url, { method: 'POST', body: fd });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => '');
      return { success: false, error: `UPLOAD_HTTP_${resp.status}: ${errBody.slice(0, 200)}` };
    }
    const data = await resp.json();
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: `UPLOAD_FAILED: ${error?.message || String(error)}` };
  }
});

ipcMain.handle('library:delete', async (_event, payload: { bookId: string }) => {
  if (!payload?.bookId) return { success: false, error: 'bookId required' };
  return aiLibraryFetch(`/api/library/${encodeURIComponent(payload.bookId)}`, { method: 'DELETE' });
});

// 让 renderer 弹原生文件选择对话框,挑 .txt / .md 文件
ipcMain.handle('library:pickFile', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择小说文件',
    filters: [
      { name: '文本文件', extensions: ['txt', 'md'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return { success: false, error: 'cancelled' };
  return { success: true, filePath: result.filePaths[0] };
});
```

### 容易踩的坑

| 坑 | 怎么处理 |
|----|---------|
| `FormData` / `Blob` 在 Node 主进程不可用(老版本 Electron) | grep package.json 看 Electron 版本,>=22 都 OK;低版本用 `form-data` npm 包(应该已装,grep 一下) |
| 上传大文件主进程阻塞 | Phase 2 接口已经接受 5-10MB,但同步 readFile 大文件会卡 UI;改 `await fs.promises.readFile` 异步读 |
| 用户选了 .docx | 提示"暂不支持 .docx,请用 .txt 或 .md"(在 LibraryView 拦) |

### Done criteria

- 在 DevTools console 跑 `await window.electronAPI.library.pickFile()` 弹出选择对话框
- `await window.electronAPI.library.upload({ filePath, title, author })` 真的能把书入库
- `await window.electronAPI.library.remove(bookId)` 删除成功

### commit

```
feat(electron): library upload / delete / pickFile ipc proxies
```

---

## 1.2 — preload + 前端 wrapper

### 修改 `electron/preload.ts`

`library` 对象内追加(只追加,不动现有 4 个):

```typescript
library: {
  list: ...,        // 已有
  get: ...,         // 已有
  chapters: ...,    // 已有
  chapter: ...,     // 已有
  pickFile: () => ipcRenderer.invoke('library:pickFile'),
  upload: (params: { filePath: string; title: string; author?: string }) =>
    ipcRenderer.invoke('library:upload', params),
  remove: (bookId: string) => ipcRenderer.invoke('library:delete', { bookId }),
},
```

### 修改 `src/modules/script-adapter/services/aiLibraryClient.ts`

追加:

```typescript
export async function pickLocalFile(): Promise<string | null> {
  const res = await api().pickFile();
  if (!res.success) return null;
  return res.filePath as string;
}

export async function uploadBook(params: {
  filePath: string;
  title: string;
  author?: string;
}): Promise<{ book_id: string; chapter_count: number; total_chars: number }> {
  const res = (await api().upload(params)) as { success: true; data: any } | { success: false; error: string };
  if (!res.success) throw new Error(res.error);
  return res.data;
}

export async function deleteBook(bookId: string): Promise<void> {
  const res = (await api().remove(bookId)) as { success: true; data: any } | { success: false; error: string };
  if (!res.success) throw new Error(res.error);
}
```

### Done criteria

`import { pickLocalFile, uploadBook, deleteBook }` 在前端可用,TS 编译通过。

### commit

```
feat(script-adapter): library client uploadBook / deleteBook / pickLocalFile
```

---

## 1.3 — LibraryView 主页面

### 文件

新建 `src/modules/script-adapter/ui/Library/LibraryView.tsx`

### 视觉结构

```
┌─────────────────────────────────────────────────────────┐
│ 📚 我的书库              [+ 上传新书]    [刷新]          │
├─────────────────────────────────────────────────────────┤
│  ┌────────┐  ┌────────┐  ┌────────┐                     │
│  │书名     │  │书名     │  │书名     │                     │
│  │作者     │  │作者     │  │作者     │                     │
│  │N章·M字 │  │N章·M字 │  │N章·M字 │                     │
│  │[查看][删]│  │[查看][删]│  │[查看][删]│                     │
│  └────────┘  └────────┘  └────────┘                     │
│                                                          │
│  (书库为空时)                                            │
│  📚 还没有藏书                                            │
│  上传一本 .txt 或 .md 小说,系统会自动按章节切分入库       │
│  [+ 上传第一本]                                          │
└─────────────────────────────────────────────────────────┘
```

### 实现要点

```tsx
import { useEffect, useState, useCallback } from 'react';
import { listBooks, deleteBook, type LibraryBook } from '../../services/aiLibraryClient';
import { BookCard } from './BookCard';
import { UploadDialog } from './UploadDialog';
import { BookDetailDrawer } from './BookDetailDrawer';
import styles from '../../styles/scriptAdapter.module.css';

export function LibraryView() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailBookId, setDetailBookId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listBooks();
      setBooks(list);
    } catch (e: any) {
      setError(e?.message || '书库连接失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = async (bookId: string, bookTitle: string) => {
    if (!confirm(`确定删除《${bookTitle}》?所有章节数据将一并清除。`)) return;
    try {
      await deleteBook(bookId);
      await refresh();
    } catch (e: any) {
      alert(`删除失败:${e?.message || '未知错误'}`);
    }
  };

  return (
    <div className={styles.libraryView}>
      <header className={styles.libraryHeader}>
        <div>
          <h2>📚 我的书库</h2>
          <p>共 {books.length} 本藏书</p>
        </div>
        <div className={styles.libraryActions}>
          <button type="button" className={styles.confirmStartButton} onClick={() => setUploadOpen(true)}>
            + 上传新书
          </button>
          <button type="button" className={styles.ghostButton} onClick={refresh} disabled={loading}>
            {loading ? '加载中...' : '刷新'}
          </button>
        </div>
      </header>

      {error ? (
        <div className={styles.libraryError}>
          {error}
          <small>请确认 AI.library 已启动(状态栏 📚 ✅)</small>
        </div>
      ) : null}

      {books.length === 0 && !loading && !error ? (
        <div className={styles.libraryEmpty}>
          <strong>📚 还没有藏书</strong>
          <p>上传一本 .txt 或 .md 小说,系统会自动按章节切分入库。</p>
          <button type="button" className={styles.confirmStartButton} onClick={() => setUploadOpen(true)}>
            + 上传第一本
          </button>
        </div>
      ) : null}

      {books.length > 0 ? (
        <div className={styles.libraryGrid}>
          {books.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onView={() => setDetailBookId(book.id)}
              onDelete={() => handleDelete(book.id, book.title)}
            />
          ))}
        </div>
      ) : null}

      {uploadOpen ? (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onSuccess={() => {
            setUploadOpen(false);
            refresh();
          }}
        />
      ) : null}

      {detailBookId ? (
        <BookDetailDrawer
          bookId={detailBookId}
          onClose={() => setDetailBookId(null)}
          onDelete={async (id, title) => {
            await handleDelete(id, title);
            setDetailBookId(null);
          }}
        />
      ) : null}
    </div>
  );
}
```

### CSS(追加到 scriptAdapter.module.css 末尾,所有样式名以 library 开头方便定位)

```css
.libraryView {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  height: 100%;
  overflow-y: auto;
}

.libraryHeader {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  border-bottom: 1px solid rgba(125, 132, 142, 0.20);
  padding-bottom: 14px;
}

.libraryHeader h2 {
  margin: 0;
  font-size: 22px;
  color: #111819;
}

.libraryHeader p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #6b7280;
}

.libraryActions {
  display: flex;
  gap: 10px;
}

.libraryError {
  padding: 14px;
  background: rgba(190, 56, 56, 0.08);
  border: 1px solid rgba(190, 56, 56, 0.32);
  border-radius: 8px;
  color: #be3838;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.libraryError small {
  color: #6b7280;
  font-size: 12px;
}

.libraryEmpty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 20px;
  background: rgba(125, 132, 142, 0.04);
  border: 2px dashed rgba(125, 132, 142, 0.24);
  border-radius: 12px;
  color: #4b5563;
  text-align: center;
}

.libraryEmpty strong {
  font-size: 18px;
}

.libraryEmpty p {
  margin: 0;
  font-size: 13px;
  max-width: 360px;
}

.libraryGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
```

### Done criteria

- 切到"📚 我的书库" tab 看到主页
- 书库为空显示空态卡片
- 有书时显示网格,每张卡片有"查看"和"删除"按钮
- 错误状态(AI.library 离线)显示红框提示

### commit

```
feat(script-adapter): library main view with grid and empty state
```

---

## 1.4 — BookCard、UploadDialog、BookDetailDrawer 组件

### BookCard.tsx(简单卡片,显示书名 / 作者 / 章节数 / 字数)

```tsx
import type { LibraryBook } from '../../services/aiLibraryClient';
import styles from '../../styles/scriptAdapter.module.css';

interface BookCardProps {
  book: LibraryBook;
  onView: () => void;
  onDelete: () => void;
}

export function BookCard({ book, onView, onDelete }: BookCardProps) {
  const charsLabel = book.total_chars > 10000
    ? `${(book.total_chars / 10000).toFixed(1)} 万字`
    : `${book.total_chars} 字`;

  return (
    <article className={styles.bookCard}>
      <div className={styles.bookCardBody}>
        <strong>{book.title}</strong>
        <em>{book.author || '佚名'}</em>
        <small>{book.chapter_count} 章 · {charsLabel}</small>
        <small className={styles.bookCardMeta}>
          上传于 {new Date(book.uploaded_at).toLocaleDateString('zh-CN')}
        </small>
      </div>
      <div className={styles.bookCardActions}>
        <button type="button" className={styles.ghostButton} onClick={onView}>查看</button>
        <button type="button" className={styles.dangerButton} onClick={onDelete}>删除</button>
      </div>
    </article>
  );
}
```

CSS:

```css
.bookCard {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px;
  background: #fff;
  border: 1px solid rgba(125, 132, 142, 0.24);
  border-radius: 10px;
  min-height: 160px;
  transition: border-color 0.2s, transform 0.2s;
}

.bookCard:hover {
  border-color: rgba(38, 99, 209, 0.40);
  transform: translateY(-2px);
}

.bookCardBody {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.bookCardBody strong {
  font-size: 15px;
  color: #111819;
  line-height: 1.4;
}

.bookCardBody em {
  font-style: normal;
  font-size: 12px;
  color: #4b5563;
}

.bookCardBody small {
  font-size: 11px;
  color: #6b7280;
}

.bookCardMeta {
  margin-top: 6px;
  opacity: 0.7;
}

.bookCardActions {
  display: flex;
  gap: 8px;
}

.dangerButton {
  padding: 6px 12px;
  border: 1px solid rgba(190, 56, 56, 0.32);
  background: rgba(190, 56, 56, 0.06);
  color: #be3838;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.dangerButton:hover {
  background: rgba(190, 56, 56, 0.14);
}
```

### UploadDialog.tsx(模态对话框 — 选文件 + 填标题作者)

```tsx
import { useState } from 'react';
import { pickLocalFile, uploadBook } from '../../services/aiLibraryClient';
import styles from '../../styles/scriptAdapter.module.css';

interface UploadDialogProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function UploadDialog({ onClose, onSuccess }: UploadDialogProps) {
  const [filePath, setFilePath] = useState<string>('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePickFile = async () => {
    const path = await pickLocalFile();
    if (path) {
      setFilePath(path);
      // 从文件名预填 title
      if (!title) {
        const filename = path.split(/[\\/]/).pop() || '';
        setTitle(filename.replace(/\.(txt|md)$/i, ''));
      }
    }
  };

  const handleUpload = async () => {
    if (!filePath) { setError('请先选择文件'); return; }
    if (!title.trim()) { setError('请填写书名'); return; }

    setUploading(true);
    setError(null);
    try {
      const result = await uploadBook({ filePath, title: title.trim(), author: author.trim() });
      // 简单成功提示(避免 alert 阻塞)
      console.log('[Library] uploaded', result);
      onSuccess();
    } catch (e: any) {
      setError(e?.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.uploadOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.uploadDialog}>
        <header>
          <h3>📥 上传新书</h3>
          <button type="button" onClick={onClose} className={styles.closeButton}>✕</button>
        </header>

        <div className={styles.uploadField}>
          <label>选择文件 (.txt 或 .md)</label>
          <div className={styles.uploadFileRow}>
            <button type="button" className={styles.ghostButton} onClick={handlePickFile} disabled={uploading}>
              {filePath ? '重新选择' : '选择文件'}
            </button>
            <span className={styles.uploadFilePath}>
              {filePath ? filePath.split(/[\\/]/).pop() : '未选择'}
            </span>
          </div>
        </div>

        <div className={styles.uploadField}>
          <label>书名 <em>(必填)</em></label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={uploading}
            placeholder="例如:长夜未瞑"
            maxLength={100}
          />
        </div>

        <div className={styles.uploadField}>
          <label>作者 (可选)</label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            disabled={uploading}
            placeholder="例如:张三"
            maxLength={50}
          />
        </div>

        {error ? <div className={styles.uploadError}>{error}</div> : null}

        <footer>
          <button type="button" className={styles.ghostButton} onClick={onClose} disabled={uploading}>取消</button>
          <button type="button" className={styles.confirmStartButton} onClick={handleUpload} disabled={uploading || !filePath || !title.trim()}>
            {uploading ? '上传中...' : '上传并入库'}
          </button>
        </footer>
      </div>
    </div>
  );
}
```

CSS:

```css
.uploadOverlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 25, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.uploadDialog {
  background: #fff;
  border-radius: 12px;
  padding: 22px;
  width: 480px;
  max-width: calc(100vw - 40px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18);
}

.uploadDialog header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.uploadDialog h3 {
  margin: 0;
  font-size: 17px;
}

.closeButton {
  border: none;
  background: transparent;
  font-size: 18px;
  color: #6b7280;
  cursor: pointer;
  padding: 4px 8px;
}

.closeButton:hover {
  color: #111819;
}

.uploadField {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.uploadField label {
  font-size: 13px;
  color: #4b5563;
  font-weight: 600;
}

.uploadField label em {
  font-style: normal;
  color: #be3838;
  font-size: 12px;
}

.uploadField input {
  padding: 8px 12px;
  border: 1px solid rgba(125, 132, 142, 0.32);
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
}

.uploadFileRow {
  display: flex;
  gap: 12px;
  align-items: center;
}

.uploadFilePath {
  font-size: 12px;
  color: #6b7280;
  font-family: monospace;
  word-break: break-all;
}

.uploadError {
  padding: 8px 12px;
  background: rgba(190, 56, 56, 0.08);
  border: 1px solid rgba(190, 56, 56, 0.30);
  color: #be3838;
  font-size: 12px;
  border-radius: 6px;
}

.uploadDialog footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(125, 132, 142, 0.16);
}
```

### BookDetailDrawer.tsx(右侧抽屉 — 章节列表 + 单章预览)

```tsx
import { useEffect, useState } from 'react';
import { getChapterText, listChapters, type LibraryChapter } from '../../services/aiLibraryClient';
import styles from '../../styles/scriptAdapter.module.css';

interface BookDetailDrawerProps {
  bookId: string;
  onClose: () => void;
  onDelete: (id: string, title: string) => void;
}

export function BookDetailDrawer({ bookId, onClose, onDelete }: BookDetailDrawerProps) {
  const [chapters, setChapters] = useState<LibraryChapter[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [previewText, setPreviewText] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    listChapters(bookId).then((list) => {
      setChapters(list);
      if (list.length > 0) setSelectedIndex(list[0].chapter_index);
    }).catch((e) => setError(e?.message || '章节加载失败')).finally(() => setLoading(false));
  }, [bookId]);

  useEffect(() => {
    if (selectedIndex === null) { setPreviewText(''); return; }
    setLoading(true);
    getChapterText(bookId, selectedIndex).then((data) => {
      setPreviewText(data.text);
      setPreviewTitle(data.chapter.title || `第 ${data.chapter.chapter_index + 1} 章`);
    }).catch((e) => setError(e?.message || '取章失败')).finally(() => setLoading(false));
  }, [bookId, selectedIndex]);

  return (
    <div className={styles.drawerOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={styles.drawerPanel}>
        <header>
          <h3>📖 {previewTitle || '加载中...'}</h3>
          <button type="button" onClick={onClose} className={styles.closeButton}>✕</button>
        </header>

        <div className={styles.drawerBody}>
          <div className={styles.chapterListPane}>
            <strong>章节列表 ({chapters.length})</strong>
            {chapters.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`${styles.chapterItem} ${selectedIndex === c.chapter_index ? styles.chapterItemActive : ''}`}
                onClick={() => setSelectedIndex(c.chapter_index)}
              >
                <span>{c.title || `第 ${c.chapter_index + 1} 章`}</span>
                <small>{c.char_count ?? '?'} 字</small>
              </button>
            ))}
          </div>

          <div className={styles.chapterPreviewPane}>
            {error ? <div className={styles.uploadError}>{error}</div> : null}
            {loading ? <div>加载中...</div> : <pre>{previewText.slice(0, 5000)}{previewText.length > 5000 ? '...' : ''}</pre>}
          </div>
        </div>

        <footer>
          <button type="button" className={styles.dangerButton} onClick={() => onDelete(bookId, previewTitle)}>删除整本书</button>
          <button type="button" className={styles.ghostButton} onClick={onClose}>关闭</button>
        </footer>
      </aside>
    </div>
  );
}
```

CSS:

```css
.drawerOverlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 25, 0.45);
  z-index: 100;
}

.drawerPanel {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(900px, 95vw);
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.20);
}

.drawerPanel header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 22px;
  border-bottom: 1px solid rgba(125, 132, 142, 0.20);
}

.drawerPanel header h3 {
  margin: 0;
  font-size: 17px;
}

.drawerBody {
  flex: 1;
  display: grid;
  grid-template-columns: 240px 1fr;
  overflow: hidden;
}

.chapterListPane {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  overflow-y: auto;
  border-right: 1px solid rgba(125, 132, 142, 0.16);
  background: rgba(125, 132, 142, 0.04);
}

.chapterListPane strong {
  font-size: 12px;
  color: #4b5563;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 6px 8px;
}

.chapterItem {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  gap: 2px;
}

.chapterItem:hover { background: rgba(38, 99, 209, 0.06); }

.chapterItemActive {
  background: rgba(38, 99, 209, 0.10);
  border-color: rgba(38, 99, 209, 0.32);
  color: #1d4ed8;
  font-weight: 600;
}

.chapterItem small {
  color: #6b7280;
  font-size: 11px;
}

.chapterPreviewPane {
  padding: 18px 22px;
  overflow-y: auto;
}

.chapterPreviewPane pre {
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.7;
  color: #111819;
  margin: 0;
}

.drawerPanel footer {
  display: flex;
  justify-content: space-between;
  padding: 14px 22px;
  border-top: 1px solid rgba(125, 132, 142, 0.16);
}
```

### Done criteria

- 上传对话框能选文件、填表、上传成功后刷新列表
- 抽屉打开后左侧列章节,点击后右侧预览前 5000 字
- 抽屉里删除按钮删完后自动关闭

### commit

```
feat(script-adapter): book card / upload dialog / detail drawer
```

---

## 1.5 — 接入主导航

### 修改 `src/modules/script-adapter/store/scriptAdapterStore.ts`

```typescript
export type ViewMode = 'workbench' | 'pipeline' | 'agents' | 'library';
```

### 修改 `src/modules/script-adapter/ui/ScriptAdapterLayout.tsx`

```tsx
import { LibraryView } from './Library/LibraryView';

const VIEW_LABEL: Record<ViewMode, string> = {
  workbench: '工作台',
  pipeline: '团队流程',
  agents: 'Agent 池',
  library: '📚 我的书库',
};

// 在 viewFrame 内追加:
{viewMode === 'library' && <LibraryView />}
```

### Done criteria

- 主导航看到 4 个 tab,点"📚 我的书库"切到书库主页
- 切到工作台后 LibrarySelector 仍能用,选书逻辑不受影响

### commit

```
feat(script-adapter): library tab in main navigation
```

---

## 1.6 — 文档

### 新建 changelog

`docs/05_changelog/2026-04-XX-script-adapter-library-ui.md`,包含:

1. 新增文件清单(7-8 个)
2. 新增 IPC channel(library:upload / delete / pickFile)
3. 截图:空态 / 列表 / 上传对话框 / 章节抽屉(Cursor 验收时补)
4. 已知限制:
   - 只支持 .txt / .md(.docx 提示用户先转格式)
   - 没有分页(>50 本时性能未验证)
   - 没有标签 / 分组 / 搜索(留 Week 7+)

### 更新接手指南

`docs/03_specs/内容创作工作台/00_项目接手指南.md` 第 3.1 节追加:

```markdown
7. `V2.21`
   主导航新增"📚 我的书库" tab,支持网页上传 / 列表 / 章节预览 / 删除。
```

---

## 1 验收标准(Track 1)

- [ ] 主导航出现 📚 我的书库 tab
- [ ] 空态时显示空态卡片 + 上传引导
- [ ] 上传一份 .txt → 看到入库成功 → 列表自动刷新
- [ ] 点"查看" → 抽屉打开,左侧章节,右侧前 5000 字预览
- [ ] 点"删除" → 弹原生 confirm → 确认后真的从书库消失
- [ ] AI.library 离线 → 主页显示红框错误,不崩
- [ ] `npx tsc --noEmit` 通过
- [ ] LibrarySelector(工作台内的)行为不受影响
- [ ] changelog 已写

---

# Track 2 — 导出文件 + 超长章节切片

## 2 总目标

让 Zilong 能把跑出来的产物**存到本地文件**,以及把**章节字数限制提到 12000+ 字**(覆盖 90% 中文小说章节)。

## 2 文件清单

预计:

- 新建:`src/modules/script-adapter/services/exportClient.ts`(前端导出 wrapper)
- 修改:`electron/main.ts`(追加 `delivery:exportMarkdown` IPC)
- 修改:`electron/preload.ts`(`delivery` 对象)
- 修改:`src/modules/script-adapter/ui/Workbench/DeliveryPreview.tsx`(加"导出 Markdown"按钮)
- 修改:`oct-gateway/script_adapter/agents/textRewriterAgent.js`(**内部加切片逻辑**,对外接口不变)
- 新建:`oct-gateway/test/textRewriterChunking.test.js`(切片单测)
- 新建:`docs/05_changelog/2026-04-XX-script-adapter-export-and-chunking.md`

---

## 2.1 — 导出 Markdown

### Electron main 加 IPC

```typescript
import { dialog } from 'electron';

ipcMain.handle('delivery:exportMarkdown', async (_event, payload: { filename: string; content: string }) => {
  const result = await dialog.showSaveDialog({
    title: '保存交付包',
    defaultPath: payload.filename || 'delivery.md',
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
    ],
  });
  if (result.canceled || !result.filePath) return { success: false, error: 'cancelled' };
  try {
    await fs.promises.writeFile(result.filePath, payload.content, 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (error: any) {
    return { success: false, error: `WRITE_FAILED: ${error?.message}` };
  }
});
```

### preload 暴露

```typescript
delivery: {
  exportMarkdown: (params: { filename: string; content: string }) =>
    ipcRenderer.invoke('delivery:exportMarkdown', params),
},
```

### 前端 wrapper(新建 `services/exportClient.ts`)

```typescript
import type { TaskExecutionSheet } from '../types/execution';

export async function exportDeliveryAsMarkdown(sheet: TaskExecutionSheet): Promise<{ success: boolean; filePath?: string; error?: string }> {
  if (!window.electronAPI?.delivery?.exportMarkdown) {
    return { success: false, error: 'delivery API unavailable' };
  }
  const md = renderDeliveryMarkdown(sheet);
  const filename = `${sanitize(sheet.taskTitle || 'delivery')}.md`;
  return window.electronAPI.delivery.exportMarkdown({ filename, content: md });
}

function renderDeliveryMarkdown(sheet: TaskExecutionSheet): string {
  const artifacts = Object.values(sheet.artifacts);
  const adapted = artifacts.find((a) => a.artifactType === 'adapted_script');
  const voices = artifacts.find((a) => a.artifactType === 'voice_registry');
  const perf = artifacts.find((a) => a.artifactType === 'performance_design');
  const review = artifacts.find((a) => a.artifactType === 'review_report');
  const pack = artifacts.find((a) => a.artifactType === 'final_package');

  const lines: string[] = [];
  lines.push(`# ${sheet.taskTitle}`);
  lines.push(``);
  lines.push(`> 生成时间:${new Date(sheet.createdAt).toLocaleString('zh-CN')}`);
  lines.push(`> 版本:${(pack?.payload as any)?.versionTag || '—'}`);
  lines.push(``);

  // 改编台本
  if (adapted) {
    lines.push(`## 📖 改编台本`);
    lines.push(``);
    const segments = (adapted.payload as any)?.segments || [];
    for (const seg of segments) {
      const speakerLabel = seg.type === 'narration' ? '旁白' : (seg.speaker || '内心');
      const prefix = seg.type === 'inner_monologue' ? '_' : '';
      const suffix = seg.type === 'inner_monologue' ? '_' : '';
      lines.push(`**[${speakerLabel}]** ${prefix}${seg.text}${suffix}`);
      if (seg.rewriteNote) lines.push(`> 改编说明:${seg.rewriteNote}`);
      lines.push(``);
    }
  }

  // 角色音
  if (voices) {
    lines.push(`## 🎭 角色音表`);
    lines.push(``);
    lines.push(`| 角色 | 类别 | 出场 | 声线建议 |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const r of (voices.payload as any)?.registry || []) {
      lines.push(`| ${r.roleName} | ${r.category} | ${r.appearanceCount} | ${r.voiceHint || ''} |`);
    }
    lines.push(``);
  }

  // 演播设计
  if (perf) {
    const p = perf.payload as any;
    lines.push(`## 🎵 演播设计`);
    lines.push(``);
    lines.push(`**BGM**:${p?.bgmTrack?.mood || '—'} — ${p?.bgmTrack?.suggestion || ''}`);
    lines.push(``);
    lines.push(`**音效(SFX)**:`);
    for (const s of p?.sfxList || []) {
      lines.push(`- [${s.atSegmentId}] ${s.sfxType}:${s.description}`);
    }
    lines.push(``);
    lines.push(`**CV 演播指导**:`);
    for (const c of p?.cvDirections || []) {
      lines.push(`- [${c.atSegmentId}] 情绪:${c.emotion} / 节奏:${c.pace}`);
    }
    lines.push(``);
  }

  // 质检
  if (review) {
    const r = review.payload as any;
    const labelMap: Record<string, string> = { pass: '✅ 可直接交付', pass_with_changes: '⚠️ 带条件交付', reject: '❌ 需返工' };
    lines.push(`## ✅ 质检报告`);
    lines.push(``);
    lines.push(`**结论**:${labelMap[r?.conclusion] || r?.conclusion}`);
    lines.push(``);
    for (const issue of r?.issues || []) {
      lines.push(`- **${issue.severity}** [${issue.category}/${issue.location || '全局'}] ${issue.description}`);
      if (issue.suggestion) lines.push(`  - 建议:${issue.suggestion}`);
    }
    lines.push(``);
  }

  // 交付清单
  if (pack) {
    lines.push(`## 📦 交付清单`);
    lines.push(``);
    for (const f of (pack.payload as any)?.manifest || []) {
      lines.push(`- ${f.name}(${f.type}/${f.size})`);
    }
    lines.push(``);
    lines.push(`> ${(pack.payload as any)?.notes || ''}`);
  }

  return lines.join('\n');
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
}
```

### DeliveryPreview 加按钮

在 `<button onClick={handleCopyAll}>复制完整交付包 JSON</button>` 旁追加:

```tsx
import { exportDeliveryAsMarkdown } from '../../services/exportClient';

const handleExportMd = async () => {
  const result = await exportDeliveryAsMarkdown(sheet);
  if (result.success) {
    // 简单 toast(用 alert 兜底)
    alert(`已导出到:${result.filePath}`);
  } else if (result.error !== 'cancelled') {
    alert(`导出失败:${result.error}`);
  }
};

<button type="button" className={styles.confirmStartButton} onClick={handleExportMd}>
  导出 Markdown
</button>
```

### Done criteria

- DeliveryPreview 出现"导出 Markdown"按钮
- 点击 → 弹原生 Save 对话框 → 选位置 → 文件保存成功
- 用记事本打开 .md → 看到完整改编台本 + 角色音表 + 演播设计 + 质检 + 清单
- 取消保存 → 不报错

### commit

```
feat(script-adapter): export delivery as markdown via electron save dialog
```

---

## 2.2 — 文本改编师内部切片

### 文件

修改 `oct-gateway/script_adapter/agents/textRewriterAgent.js`(**对外接口完全不变**,内部加切片逻辑)

### 关键设计

1. 当 `sourceText.length > 4000` 时,切成多个 ~3500 字的片段(用 chunker.js 的 `chunkByChars` 已有能力)
2. 每片**串行**调用 LLM,每片之间传递 200 字 anchor(上一片末尾)给 LLM 维持上下文
3. 合并时:**重新编号 segmentId**(避免每片都从 seg-001 开始)
4. 失败时单片回退占位,继续下一片(不让一片失败拖整章)
5. 上限提到 **12000 字**(覆盖中文 90% 章节),超过仍 throw `TEXT_REWRITER_TOO_LONG`

### 实现要点

```javascript
'use strict';

const { chatCompletion, resolveProviderFor } = require('../../services/llmClient');
const { chunkByChars } = require('../../services/chunker');

const SYSTEM_PROMPT = `...原 prompt 不变...`;

const SOFT_LIMIT = 4000;
const HARD_LIMIT = 12000;
const CHUNK_TARGET = 3500;
const CHUNK_MAX = 4000;

async function runTextRewriterAgent(ctx, options = {}) {
  const sourceText = String(ctx?.sourceText || '').trim();
  if (!sourceText) throw new Error('TEXT_REWRITER_NO_INPUT');
  if (sourceText.length > HARD_LIMIT) throw new Error(`TEXT_REWRITER_TOO_LONG: ${sourceText.length} > ${HARD_LIMIT}`);

  // 短文本走原路径
  if (sourceText.length <= SOFT_LIMIT) {
    return runSinglePass(sourceText, options);
  }

  // 长文本切片处理
  return runChunkedPass(sourceText, options);
}

async function runSinglePass(sourceText, options = {}) {
  const provider = resolveProviderFor('script_adapter');
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `请把下列原文改编成多人演播台本。原文:\n\n${sourceText}` },
  ];
  const result = await chatCompletion({
    provider, messages, maxTokens: 2000, temperature: 0.6, responseJson: true, timeoutMs: 45000,
  });
  return { payload: parseTextRewriterOutput(result.content), latencyMs: result.latencyMs, model: result.model };
}

async function runChunkedPass(sourceText, options = {}) {
  const startedAt = Date.now();
  const chunks = chunkByChars(sourceText, { targetSize: CHUNK_TARGET, maxSize: CHUNK_MAX, overlap: 0 });
  const provider = resolveProviderFor('script_adapter');

  const allSegments = [];
  let lastAnchor = '';
  let chapterTitle = '';
  let modelUsed = '';

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const userPrompt = lastAnchor
      ? `这是第 ${i + 1}/${chunks.length} 段。前一段末尾:"${lastAnchor.slice(-200)}"\n\n请继续改编(保持人物语气和叙事节奏一致):\n\n${chunk.content}`
      : `请把下列原文改编成多人演播台本(共 ${chunks.length} 段,这是第 1 段)。原文:\n\n${chunk.content}`;
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ];

    try {
      const result = await chatCompletion({
        provider, messages, maxTokens: 2000, temperature: 0.6, responseJson: true, timeoutMs: 45000,
      });
      const partialPayload = parseTextRewriterOutput(result.content);
      if (i === 0) chapterTitle = partialPayload.chapterTitle || '';
      modelUsed = result.model;
      // 重新编号 segmentId,合并到全局
      for (const seg of partialPayload.segments) {
        seg.segmentId = `seg-${String(allSegments.length + 1).padStart(3, '0')}`;
        allSegments.push(seg);
      }
      lastAnchor = chunk.content;
    } catch (error) {
      // 单片失败回退占位
      allSegments.push({
        segmentId: `seg-${String(allSegments.length + 1).padStart(3, '0')}`,
        type: 'narration',
        text: `[第 ${i + 1} 片改编失败:${String(error?.message || error).slice(0, 60)}]`,
        rewriteNote: 'chunked fallback',
      });
    }
  }

  return {
    payload: {
      chapterTitle: chapterTitle || '未命名(分批改编)',
      totalCharCount: allSegments.reduce((sum, s) => sum + (String(s.text || '').length), 0),
      segments: allSegments,
    },
    latencyMs: Date.now() - startedAt,
    model: `${modelUsed} (chunked × ${chunks.length})`,
  };
}

// parseTextRewriterOutput 沿用现有
function parseTextRewriterOutput(raw) { /* 沿用现有实现 */ }

module.exports = { runTextRewriterAgent };
```

### 容易踩的坑

| 坑 | 怎么处理 |
|----|---------|
| chunker 的 chunks 边界把对话切断 | chunker 优先在自然边界切(\n\n、。、!、?),实测 95% 章节不会断在对白中 |
| 每片串行总耗时(5 片 × 30s = 2.5 分钟) | UI 已有"整理交付摘要"进度条,Zilong 看到正常进度。如果嫌慢,Cursor 可以让前端提示"长章节,预计 X 分钟",仅文案 |
| segmentId 全局唯一 | 严格 padStart(3, '0') + 全局递增 |
| chapterTitle 跨片不一致 | 只用第 1 片的 chapterTitle,其他片忽略 title 字段 |
| 上下游 Agent(角色音 / 演播 / 质检)对长 segments 列表的处理 | 角色音聚合 speaker 没问题,演播设计前 8 个 segment(不变),质检前 6 个样本(不变),都 OK |

### Done criteria

测试 3 项(默认 SKIP live):

- 200 字 sourceText → 走单 pass(`model` 字段不含 "chunked")
- 8000 字 sourceText → 走 chunked,segments 累计字数 ≈ 8000(±20%),`model` 字段含 "chunked × 3"(预期)
- 13000 字 → throw `TEXT_REWRITER_TOO_LONG: 13000 > 12000`
- 中间某一片故意 throw(测试用) → 该片产生占位 segment,后续片继续

### commit

```
feat(gateway/script_adapter): chunked text rewriter for long chapters (up to 12000 chars)
```

---

## 2.3 — 文档

### 新建 changelog

`docs/05_changelog/2026-04-XX-script-adapter-export-and-chunking.md`,包含:

1. 改动文件清单
2. **使用说明**:导出按钮在哪、超长章节自动切片
3. 已知限制:
   - .docx 导出 Week 7+(目前只 .md)
   - 超过 12000 字的章节仍 throw(留 Week 7 进一步分级)
   - 切片版改编可能跨片对白节奏不稳(Week 7 prompt 精调)

---

## 2 验收标准(Track 2)

- [ ] DeliveryPreview 看到"导出 Markdown"按钮
- [ ] 点击后弹原生 Save 对话框 → 保存成 .md → 用记事本看到完整内容
- [ ] 用 8000 字章节跑文本改编师 → **成功完成**(不再报 TOO_LONG)
- [ ] 改编完成后 segments 数 ≥ 8,segmentId 全局唯一(seg-001, seg-002, ...)
- [ ] 14000 字章节仍报 TOO_LONG(不变)
- [ ] `npx tsc --noEmit` 通过
- [ ] changelog 已写

---

# 整合验收(Zilong 5 分钟跑通)

```
1. 打开 OCT,主导航有"📚 我的书库"tab
2. 点击 → 看到现有书 + 新增"+ 上传新书"按钮
3. 点上传 → 选一本 5-10 万字的小说 .txt → 填书名 → 上传
4. 列表自动刷新,看到新书
5. 点"查看" → 抽屉打开 → 看章节列表 + 第 1 章预览
6. 关闭抽屉 → 切到"工作台" tab
7. 在 LibrarySelector 选刚上传的书 → 选第 1 章(假设 8000 字)
8. 取入测试输入框 → 确认开工
9. 等 1-3 分钟(切片改编 + 5 个 Agent),看到 DeliveryPreview
10. 点"导出 Markdown" → 弹保存框 → 选桌面 → 保存
11. 桌面打开 .md → 看到完整改编 + 角色音 + 演播 + 质检 + 清单
```

---

# 留 Week 7+

1. **执行单持久化**(SQLite + IPC),刷新不丢,可看历史
2. **prompt 微调**(基于真实章节跑出来的 5-10 份产物,集中调优)
3. **超长章节升级**:>12000 字按"先合并改编再质检"两阶段;.docx / .epub 文件解析
4. **切片版改编质量提升**(跨片对白节奏 / 内心独白连贯性)
5. **task.intake_planner / business.content_analyzer 真实化**(创建任务前置链路)
6. **Workspace 隔离 + custom instructions**(Claude Projects 风格)
7. **导出 .docx**(用 Electron 原生或 mammoth 反向)

---

# 给 Cursor 的协作约定

## 时间安排建议

第 1 天:
- 上午:Track 1.1 - 1.4(IPC + 3 个组件 + LibraryView,~5h)
- 下午:Track 1.5 - 1.6(接入主导航 + 文档,~1h)+ Track 2.1 导出(~2h)

第 2 天:
- 上午:Track 2.2 切片(~4h,核心是 chunker 集成 + 测试)
- 下午:整合验收 + changelog

## 必须遵守

1. **Zilong 不开终端**。任何启用配置写在 changelog 里,且要求 Cursor 自测一次
2. **不动已锁基础设施**(agents/* 5 个 Agent 中只动 textRewriterAgent.js,且对外接口不变)
3. **不动 ai_library 后端**(全用现有 6 个 API)
4. **导出走 Electron dialog,不要 Blob/a.download**
5. **切片合并 segmentId 全局唯一**
6. **textRewriterAgent 内部失败必须回退占位,不让 pipeline 中断**(Week 3-5 一直的铁律)

## 卡壳速查

1. **Electron 主进程 fetch + FormData 不工作** → 用 `form-data` npm 包(grep package.json 确认已装)
2. **`navigator.clipboard.writeText` 在 Electron 渲染进程偶发失败** → 加 try/catch,失败时 fallback 用主进程 IPC(已经在 Week 5 设计里说过)
3. **8000 字切片后总耗时太长(>3 分钟)** → 提示用 deepseek-v4(单次 ~10s,3 片 ~30s)
4. **章节预览 5000 字硬截断** → UI 显示"前 5000 字",但工作台用的时候**仍传完整章节文本**(getChapterText 返回完整,展示截断只是 UI 决定)
5. **chunker 切到对话中间** → chunker 已优先自然边界切,实测 OK;如果用户报特定章节断了,Week 7 调 chunker 阈值
6. **dialog.showSaveDialog 在某些 Linux 环境异常** → 退化:返回错误 "save dialog unavailable",不阻塞主流程

## Cursor 完成后回报清单

- [ ] Track 1 + Track 2 commit 列表
- [ ] 录屏 / 连续截图:从上传一本书 → 选章节 → 跑通 → 导出 .md → 打开 md 看内容
- [ ] 一份真实 .md 导出文件粘贴在 changelog 里(证明产物可用)
- [ ] 一次切片改编的日志(chunked × 3)证明长章节工作

---

## 相关文档

- Week 5 计划:`docs/03_specs/Week5-Dual-Track-Cowork-Handoff.md`
- Week 4 计划:`docs/03_specs/Week4-Dual-Track-Cowork-Handoff.md`
- 已锁基础设施:`oct-gateway/services/llmClient.js`、`oct-gateway/services/chunker.js`、`oct-gateway/script_adapter/agentRunner.js`
- AI.library 接口:`docs/02_architecture/AI_LIBRARY_OCT.md`
- 内容创作主线:`docs/03_specs/内容创作工作台/`
