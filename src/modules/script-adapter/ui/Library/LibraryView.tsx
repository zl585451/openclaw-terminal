import { useEffect, useState } from 'react';
import { deleteBook, listBooks, type LibraryBook } from '../../services/aiLibraryClient';
import { BookCard } from './BookCard';
import { BookDetailDrawer } from './BookDetailDrawer';
import { UploadDialog } from './UploadDialog';
import styles from '../../styles/scriptAdapter.module.css';

export function LibraryView() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailBookId, setDetailBookId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setBooks(await listBooks());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '书库连接失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleDelete = async (bookId: string, title: string) => {
    if (!window.confirm(`确定删除《${title}》吗？章节和正文会一起移除。`)) return;
    try {
      await deleteBook(bookId);
      await refresh();
    } catch (e: unknown) {
      window.alert(`删除失败：${e instanceof Error ? e.message : '未知错误'}`);
    }
  };

  return (
    <div className={styles.libraryView}>
      <header className={styles.libraryHeader}>
        <div>
          <h2>📚 我的书库</h2>
          <p>网页里上传、预览章节、删除旧书，不用再开终端。</p>
        </div>
        <div className={styles.libraryActions}>
          <button type="button" className={styles.confirmStartButton} onClick={() => setUploadOpen(true)}>
            + 上传新书
          </button>
          <button type="button" className={styles.ghostButton} onClick={() => void refresh()} disabled={loading}>
            {loading ? '刷新中…' : '刷新'}
          </button>
        </div>
      </header>

      {error ? (
        <div className={styles.libraryError}>
          {error}
          <small>请确认 AI.library 已启动，或在设置里检查书库插件状态。</small>
        </div>
      ) : null}

      {!loading && !error && books.length === 0 ? (
        <div className={styles.libraryEmpty}>
          <strong>📚 还没有藏书</strong>
          <p>拖进一本 `.txt` 或 `.md` 小说，系统会自动按章节切分入库。</p>
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
              onDelete={() => void handleDelete(book.id, book.title)}
            />
          ))}
        </div>
      ) : null}

      {uploadOpen ? (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onSuccess={() => {
            setUploadOpen(false);
            void refresh();
          }}
        />
      ) : null}

      {detailBookId ? (
        <BookDetailDrawer
          bookId={detailBookId}
          onClose={() => setDetailBookId(null)}
          onDelete={async (bookId, title) => {
            await handleDelete(bookId, title);
            setDetailBookId(null);
          }}
        />
      ) : null}
    </div>
  );
}
