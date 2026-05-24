import { useState, useEffect } from 'react';
import { 
  LibraryBook, 
  LibraryChapter, 
  listBooks, 
  listChapters, 
  getChapterText 
} from '../../../services/aiLibraryClient';
import { CreationRangeMode } from '../index';

export function useWizardSource() {
  const [sourceMode, setSourceMode] = useState<'library' | 'upload' | 'paste'>('library');
  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [libraryChapters, setLibraryChapters] = useState<LibraryChapter[]>([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedChapterIndex, setSelectedChapterIndex] = useState<number | ''>('');
  const [selectedRangeMode, setSelectedRangeMode] = useState<CreationRangeMode>('single');
  const [selectedRangeEndIndex, setSelectedRangeEndIndex] = useState<number | ''>('');
  const [chapterPreview, setChapterPreview] = useState('');
  const [libraryStatus, setLibraryStatus] = useState<'idle' | 'loading-books' | 'loading-chapters' | 'loading-preview'>('idle');
  const [libraryError, setLibraryError] = useState('');
  const [uploadFilePath, setUploadFilePath] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [uploadingBook, setUploadingBook] = useState(false);
  const [pastedText, setPastedText] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadBooks = async () => {
      setLibraryStatus('loading-books');
      setLibraryError('');
      try {
        const books = await listBooks();
        if (cancelled) return;
        setLibraryBooks(books);
        if (books.length > 0) {
          setSelectedBookId((current) => current || books[0].id);
          setSourceMode('library');
        } else {
          setSelectedBookId('');
          setSelectedChapterIndex('');
          setSourceMode('upload');
        }
      } catch (error) {
        if (cancelled) return;
        setLibraryBooks([]);
        setSelectedBookId('');
        setSelectedChapterIndex('');
        setLibraryError(error instanceof Error ? error.message : '项目素材库加载失败');
      } finally {
        if (!cancelled) setLibraryStatus('idle');
      }
    };
    void loadBooks();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedBookId) {
      setLibraryChapters([]);
      setSelectedChapterIndex('');
      setChapterPreview('');
      return;
    }
    let cancelled = false;
    const loadChapters = async () => {
      setLibraryStatus('loading-chapters');
      setLibraryError('');
      try {
        const chapters = await listChapters(selectedBookId);
        if (cancelled) return;
        setLibraryChapters(chapters);
        setSelectedChapterIndex((current) => {
          if (current !== '' && chapters.some((chapter) => chapter.chapter_index === current)) return current;
          return chapters.length > 0 ? chapters[0].chapter_index : '';
        });
        setSelectedRangeEndIndex((current) => {
          if (current !== '' && chapters.some((chapter) => chapter.chapter_index === current)) return current;
          return chapters.length > 0 ? chapters[0].chapter_index : '';
        });
      } catch (error) {
        if (cancelled) return;
        setLibraryChapters([]);
        setSelectedChapterIndex('');
        setLibraryError(error instanceof Error ? error.message : '章节列表加载失败');
      } finally {
        if (!cancelled) setLibraryStatus('idle');
      }
    };
    void loadChapters();
    return () => {
      cancelled = true;
    };
  }, [selectedBookId]);

  useEffect(() => {
    if (!selectedBookId || selectedChapterIndex === '') {
      setChapterPreview('');
      return;
    }
    let cancelled = false;
    const loadPreview = async () => {
      setLibraryStatus('loading-preview');
      setLibraryError('');
      try {
        const { text } = await getChapterText(selectedBookId, Number(selectedChapterIndex));
        if (!cancelled) setChapterPreview(text.slice(0, 220));
      } catch (error) {
        if (!cancelled) {
          setChapterPreview('');
          setLibraryError(error instanceof Error ? error.message : '章节预览加载失败');
        }
      } finally {
        if (!cancelled) setLibraryStatus('idle');
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [selectedBookId, selectedChapterIndex]);

  const selectedBook = libraryBooks.find((book) => book.id === selectedBookId) || null;
  const selectedChapter = libraryChapters.find((chapter) => chapter.chapter_index === selectedChapterIndex) || null;
  const selectedRangeChapters = (() => {
    if (!selectedBook || libraryChapters.length === 0) return [];
    if (selectedRangeMode === 'all') return libraryChapters;
    if (selectedRangeMode === 'range') {
      const start = selectedChapterIndex === '' ? libraryChapters[0]?.chapter_index ?? 0 : Number(selectedChapterIndex);
      const end = selectedRangeEndIndex === '' ? start : Number(selectedRangeEndIndex);
      const [from, to] = [start, end].sort((a, b) => a - b);
      return libraryChapters.filter((chapter) => chapter.chapter_index >= from && chapter.chapter_index <= to);
    }
    return selectedChapter ? [selectedChapter] : [];
  })();
  const selectedRangeTotalChars = selectedRangeChapters.reduce((sum, chapter) => sum + Number(chapter.char_count || 0), 0);
  const selectedRangeLabel = selectedRangeMode === 'all'
    ? `全书规划 · ${selectedRangeChapters.length} 章`
    : selectedRangeChapters.length > 1
      ? `${selectedRangeChapters[0]?.title || `第 ${selectedRangeChapters[0]?.chapter_index + 1} 章`} - ${selectedRangeChapters[selectedRangeChapters.length - 1]?.title || `第 ${selectedRangeChapters[selectedRangeChapters.length - 1]?.chapter_index + 1} 章`}`
      : selectedChapter?.title || (selectedChapter ? `第 ${selectedChapter.chapter_index + 1} 章` : '待选择章节');

  const sourceReady = sourceMode === 'library'
    ? Boolean(selectedBook && selectedRangeChapters.length > 0)
    : sourceMode === 'upload'
      ? false
      : Boolean(pastedText.trim());

  return {
    sourceMode, setSourceMode,
    libraryBooks, setLibraryBooks,
    libraryChapters, setLibraryChapters,
    selectedBookId, setSelectedBookId,
    selectedChapterIndex, setSelectedChapterIndex,
    selectedRangeMode, setSelectedRangeMode,
    selectedRangeEndIndex, setSelectedRangeEndIndex,
    chapterPreview, setChapterPreview,
    libraryStatus, setLibraryStatus,
    libraryError, setLibraryError,
    uploadFilePath, setUploadFilePath,
    uploadTitle, setUploadTitle,
    uploadAuthor, setUploadAuthor,
    uploadingBook, setUploadingBook,
    pastedText, setPastedText,
    selectedBook,
    selectedChapter,
    selectedRangeChapters,
    selectedRangeTotalChars,
    selectedRangeLabel,
    sourceReady
  };
}
