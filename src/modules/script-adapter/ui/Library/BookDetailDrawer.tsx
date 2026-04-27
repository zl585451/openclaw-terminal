import { useEffect, useState } from 'react';
import {
  getChapterText,
  listBooks,
  listChapters,
  type LibraryBook,
  type LibraryChapter,
} from '../../services/aiLibraryClient';
import styles from '../../styles/scriptAdapter.module.css';

interface BookDetailDrawerProps {
  bookId: string;
  onClose: () => void;
  onDelete: (bookId: string, title: string) => Promise<void>;
}

export function BookDetailDrawer({ bookId, onClose, onDelete }: BookDetailDrawerProps) {
  const [book, setBook] = useState<LibraryBook | null>(null);
  const [chapters, setChapters] = useState<LibraryChapter[]>([]);
  const [activeChapter, setActiveChapter] = useState<number | null>(null);
  const [previewText, setPreviewText] = useState('');
  const [loading, setLoading] = useState<'book' | 'chapter' | null>('book');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading('book');
      setError(null);
      try {
        const [books, chapterList] = await Promise.all([listBooks(), listChapters(bookId)]);
        if (cancelled) return;
        setBook(books.find((item) => item.id === bookId) || null);
        setChapters(chapterList);
        const first = chapterList[0];
        if (first) {
          setActiveChapter(first.chapter_index);
        } else {
          setPreviewText('');
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : '书籍详情加载失败');
      } finally {
        if (!cancelled) setLoading(null);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    if (activeChapter === null) return;
    let cancelled = false;

    const loadText = async () => {
      setLoading('chapter');
      setError(null);
      try {
        const { text } = await getChapterText(bookId, activeChapter);
        if (!cancelled) setPreviewText(text.slice(0, 5000));
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : '章节预览失败');
      } finally {
        if (!cancelled) setLoading(null);
      }
    };

    void loadText();
    return () => {
      cancelled = true;
    };
  }, [activeChapter, bookId]);

  return (
    <div className={styles.libraryOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={styles.drawerPanel}>
        <header className={styles.drawerHeader}>
          <div>
            <h3>{book?.title || '书籍详情'}</h3>
            <p>{book?.author || '佚名'} · {chapters.length} 章 · 右侧只预览前 5000 字</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose}>关闭</button>
        </header>

        {error ? <div className={styles.libraryError}>{error}</div> : null}

        <div className={styles.drawerBody}>
          <div className={styles.chapterListPane}>
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                className={`${styles.chapterItem} ${activeChapter === chapter.chapter_index ? styles.chapterItemActive : ''}`}
                onClick={() => setActiveChapter(chapter.chapter_index)}
              >
                <strong>{chapter.title || `第 ${chapter.chapter_index + 1} 章`}</strong>
                <small>{chapter.char_count ?? '?'} 字</small>
              </button>
            ))}
            {chapters.length === 0 && loading !== 'book' ? <small>这本书还没有切出章节。</small> : null}
          </div>

          <div className={styles.chapterPreviewPane}>
            {loading === 'chapter' ? <p>正在加载章节预览…</p> : <pre>{previewText || '选择左侧章节后，这里会展示前 5000 字预览。'}</pre>}
          </div>
        </div>

        <footer className={styles.drawerFooter}>
          <small>工作台里的取章仍会拿完整正文，这里的 5000 字截断只是预览。</small>
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => void onDelete(bookId, book?.title || '未命名书籍')}
          >
            删除这本书
          </button>
        </footer>
      </aside>
    </div>
  );
}
