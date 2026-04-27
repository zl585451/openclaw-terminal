import type { LibraryBook } from '../../services/aiLibraryClient';
import styles from '../../styles/scriptAdapter.module.css';

interface BookCardProps {
  book: LibraryBook;
  isActive?: boolean;
  onView: () => void;
  onDelete: () => void;
  onSetActive: () => void;
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
          {isActive ? <span style={{ color: 'var(--accent-primary)', marginRight: '6px' }}>▶</span> : null}
          {book.title}
        </strong>
        <em>{book.author || '佚名'}</em>
        <small>{book.chapter_count} 章 · {charsLabel}</small>
        <small className={styles.bookCardMeta}>
          上传于 {new Date(book.uploaded_at).toLocaleDateString('zh-CN')}
        </small>
      </div>
      <div className={styles.bookCardActions}>
        {!isActive ? (
          <button type="button" className={styles.ghostButton} onClick={onSetActive}>设为当前项目</button>
        ) : (
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
