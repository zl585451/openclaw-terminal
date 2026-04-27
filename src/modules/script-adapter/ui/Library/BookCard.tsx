import type { LibraryBook } from '../../services/aiLibraryClient';
import styles from '../../styles/scriptAdapter.module.css';

interface BookCardProps {
  book: LibraryBook;
  onView: () => void;
  onDelete: () => void;
}

export function BookCard({ book, onView, onDelete }: BookCardProps) {
  const charsLabel =
    book.total_chars >= 10000 ? `${(book.total_chars / 10000).toFixed(1)} 万字` : `${book.total_chars} 字`;

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
