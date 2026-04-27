import { useEffect, useState } from 'react';
import { deleteBook, listBooks, type LibraryBook } from '../../services/aiLibraryClient';
import { BookCard } from './BookCard';
import { BookDetailDrawer } from './BookDetailDrawer';
import { UploadDialog } from './UploadDialog';
import { useProject } from '../../../../contexts/ProjectContext';
import styles from '../../styles/scriptAdapter.module.css';

export function LibraryView() {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailBookId, setDetailBookId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ bookId: string; title: string } | null>(null);
  const { activeProjectId, setActiveProjectById } = useProject();

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

  const handleDelete = async (bookId: string) => {
    try {
      await deleteBook(bookId);
      if (bookId === activeProjectId) {
        await setActiveProjectById(null);
      }
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
              isActive={book.id === activeProjectId}
              onView={() => setDetailBookId(book.id)}
              onDelete={() => setPendingDelete({ bookId: book.id, title: book.title })}
              onSetActive={() => void setActiveProjectById(book.id)}
            />
          ))}
        </div>
      ) : null}

      {uploadOpen ? (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onSuccess={(result) => {
            setUploadOpen(false);
            void (async () => {
              await refresh();
              await setActiveProjectById(result.book_id);
            })();
          }}
        />
      ) : null}

      {detailBookId ? (
        <BookDetailDrawer
          bookId={detailBookId}
          onClose={() => setDetailBookId(null)}
          onDelete={async (bookId, title) => {
            setPendingDelete({ bookId, title });
          }}
        />
      ) : null}

      {pendingDelete ? (
        <div className={styles.libraryOverlay} onClick={(e) => e.target === e.currentTarget && setPendingDelete(null)}>
          <div className={styles.uploadDialog}>
            <header className={styles.uploadDialogHeader}>
              <div>
                <h3>删除这本书？</h3>
                <p>这会从当前项目素材库中移除书籍、章节目录和对应正文。</p>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setPendingDelete(null)}
              >
                关闭
              </button>
            </header>

            <div className={styles.confirmDialogBody}>
              <strong>《{pendingDelete.title}》</strong>
              <p>删除后无法恢复。如果这本书正被设为当前项目，也会同时取消当前项目绑定。</p>
            </div>

            <footer className={styles.uploadDialogFooter}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setPendingDelete(null)}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={async () => {
                  const { bookId } = pendingDelete;
                  setPendingDelete(null);
                  await handleDelete(bookId);
                  if (detailBookId === bookId) {
                    setDetailBookId(null);
                  }
                }}
              >
                确认删除
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
