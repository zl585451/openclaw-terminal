import { useEffect, useState } from 'react';
import { getChapterText, listBooks, listChapters, type LibraryBook, type LibraryChapter } from '../../services/aiLibraryClient';
import styles from '../../styles/scriptAdapter.module.css';

export interface LibraryPickMeta {
  bookTitle: string;
  chapterTitle: string;
  chars: number;
}

interface LibrarySelectorProps {
  onPick: (text: string, meta: LibraryPickMeta) => void;
  disabled?: boolean;
}

export function LibrarySelector({ onPick, disabled }: LibrarySelectorProps) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [chapters, setChapters] = useState<LibraryChapter[]>([]);
  const [bookId, setBookId] = useState<string>('');
  const [chapterIndex, setChapterIndex] = useState<number | ''>('');
  const [loading, setLoading] = useState<'books' | 'chapters' | 'text' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading('books');
    setError(null);
    listBooks()
      .then((list) => {
        if (cancelled) return;
        setBooks(list);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '书库连接失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!bookId) {
      setChapters([]);
      setChapterIndex('');
      return;
    }
    let cancelled = false;
    setLoading('chapters');
    setError(null);
    listChapters(bookId)
      .then((list) => {
        if (cancelled) return;
        setChapters(list);
        setChapterIndex(list.length > 0 ? list[0].chapter_index : '');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '章节加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(null);
      });
    return () => {
      cancelled = true;
    };
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '取章失败');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={styles.librarySelector}>
      <div className={styles.librarySelectorRow}>
        <span className={styles.librarySelectorLabel}>从书库选章节</span>
        {error ? <em className={styles.librarySelectorError}>{error}</em> : null}
      </div>
      <div className={styles.librarySelectorControls}>
        <select
          value={bookId}
          onChange={(e) => setBookId(e.target.value)}
          disabled={disabled || loading === 'books'}
        >
          <option value="">
            {loading === 'books' ? '加载中…' : books.length === 0 ? '书库为空或离线' : '选一本书'}
          </option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
              {b.author ? ` · ${b.author}` : ''}（{b.chapter_count} 章）
            </option>
          ))}
        </select>
        <select
          value={chapterIndex === '' ? '' : String(chapterIndex)}
          onChange={(e) => {
            const v = e.target.value;
            setChapterIndex(v === '' ? '' : Number(v));
          }}
          disabled={disabled || !bookId || loading === 'chapters'}
        >
          <option value="">{loading === 'chapters' ? '加载中…' : '选一章'}</option>
          {chapters.map((c) => (
            <option key={c.id} value={String(c.chapter_index)}>
              {c.title || `第 ${c.chapter_index + 1} 章`}（{c.char_count ?? '?'} 字）
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.ghostButton}
          onClick={() => void handlePick()}
          disabled={disabled || !bookId || chapterIndex === '' || loading !== null}
        >
          {loading === 'text' ? '取章中…' : '取入测试输入框'}
        </button>
      </div>
    </div>
  );
}
