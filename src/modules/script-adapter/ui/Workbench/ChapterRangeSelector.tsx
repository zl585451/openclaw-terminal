import { useMemo, useState } from 'react';
import type { LibraryBook, LibraryChapter } from '../../services/aiLibraryClient';
import type { ChapterRangeMode } from '../../types/batch';
import styles from '../../styles/scriptAdapter.module.css';

interface ChapterRangeSelectorProps {
  books: LibraryBook[];
  chapters: LibraryChapter[];
  selectedBookId: string;
  selectedChapterIndices: number[];
  mode: ChapterRangeMode;
  loading: boolean;
  error: string;
  onBookChange: (bookId: string) => void;
  onModeChange: (mode: ChapterRangeMode) => void;
  onSelectionChange: (indices: number[]) => void;
}

const ROW_HEIGHT = 44;
const VIEWPORT_HEIGHT = 264;

export function ChapterRangeSelector({
  books,
  chapters,
  selectedBookId,
  selectedChapterIndices,
  mode,
  loading,
  error,
  onBookChange,
  onModeChange,
  onSelectionChange,
}: ChapterRangeSelectorProps) {
  const [scrollTop, setScrollTop] = useState(0);
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const selectedSet = useMemo(() => new Set(selectedChapterIndices), [selectedChapterIndices]);
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 8;
  const end = Math.min(chapters.length, start + visibleCount);
  const visible = chapters.slice(start, end);

  const selectAll = () => {
    onModeChange('all');
    onSelectionChange(chapters.map((chapter) => chapter.chapter_index));
  };

  const clearAll = () => {
    onSelectionChange([]);
    setLastClickedIndex(null);
  };

  const toggleIndex = (chapterIndex: number, originalIndex: number, withShift: boolean) => {
    if (mode === 'all') onModeChange('discrete');
    if (mode === 'range' && withShift && lastClickedIndex != null) {
      const [from, to] = [lastClickedIndex, originalIndex].sort((a, b) => a - b);
      onSelectionChange(chapters.slice(from, to + 1).map((chapter) => chapter.chapter_index));
      return;
    }
    if (mode === 'range') {
      onSelectionChange([chapterIndex]);
      setLastClickedIndex(originalIndex);
      return;
    }
    const next = new Set(selectedSet);
    if (next.has(chapterIndex)) next.delete(chapterIndex);
    else next.add(chapterIndex);
    onSelectionChange([...next].sort((a, b) => a - b));
    setLastClickedIndex(originalIndex);
  };

  return (
    <div className={`${styles.card} ${styles.batchSelectorCard}`}>
      <div className={styles.batchSelectorTop}>
        <div>
          <div className={styles.sectionTitle}>批次章节范围</div>
          <p>保留单章测试入口，生产批量从这里选书和范围。</p>
        </div>
        <div className={styles.batchSelectorActions}>
          <button type="button" className={styles.ghostButton} onClick={selectAll} disabled={chapters.length === 0}>
            全书
          </button>
          <button type="button" className={styles.ghostButton} onClick={clearAll} disabled={selectedChapterIndices.length === 0}>
            清空
          </button>
        </div>
      </div>

      <div className={styles.batchSelectorControls}>
        <select value={selectedBookId} onChange={(event) => onBookChange(event.target.value)}>
          <option value="">{loading ? '加载书库中…' : books.length === 0 ? '书库为空或离线' : '选择一本书'}</option>
          {books.map((book) => (
            <option key={book.id} value={book.id}>
              {book.title}{book.author ? ` · ${book.author}` : ''}（{book.chapter_count} 章）
            </option>
          ))}
        </select>
        <div className={styles.batchModeTabs}>
          {[
            ['range', '范围'],
            ['discrete', '离散'],
            ['all', '全书'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={mode === value ? styles.batchModeTabActive : styles.batchModeTab}
              onClick={() => onModeChange(value as ChapterRangeMode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className={styles.inlineErrorText}>{error}</div> : null}

      <div
        className={styles.batchChapterViewport}
        style={{ height: VIEWPORT_HEIGHT }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div style={{ height: chapters.length * ROW_HEIGHT, position: 'relative' }}>
          <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
            {visible.map((chapter, visibleIndex) => {
              const originalIndex = start + visibleIndex;
              const chapterIndex = chapter.chapter_index;
              const checked = selectedSet.has(chapterIndex);
              return (
                <button
                  key={chapter.id}
                  type="button"
                  className={checked ? styles.batchChapterRowActive : styles.batchChapterRow}
                  style={{ height: ROW_HEIGHT, top: visibleIndex * ROW_HEIGHT }}
                  onClick={(event) => toggleIndex(chapterIndex, originalIndex, event.shiftKey)}
                >
                  <span>{checked ? '●' : '○'}</span>
                  <strong>{chapter.title || `第 ${chapterIndex + 1} 章`}</strong>
                  <em>{chapter.char_count ?? '?'} 字</em>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
