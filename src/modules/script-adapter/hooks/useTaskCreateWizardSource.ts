import { useEffect, useMemo, useState } from 'react';
import {
  getChapterText,
  listBooks,
  listChapters,
  pickLocalFile,
  uploadBook,
  type LibraryBook,
  type LibraryChapter,
} from '../services/aiLibraryClient';

export type TaskWizardSourceMode = 'library' | 'upload' | 'paste';
export type CreationRangeMode = 'single' | 'range' | 'all';
export type TaskWizardLibraryStatus = 'idle' | 'loading-books' | 'loading-chapters' | 'loading-preview';

export function useTaskCreateWizardSource() {
  const [sourceMode, setSourceMode] = useState<TaskWizardSourceMode>('library');
  const [libraryBooks, setLibraryBooks] = useState<LibraryBook[]>([]);
  const [libraryChapters, setLibraryChapters] = useState<LibraryChapter[]>([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedChapterIndex, setSelectedChapterIndex] = useState<number | ''>('');
  const [selectedRangeMode, setSelectedRangeMode] = useState<CreationRangeMode>('single');
  const [selectedRangeEndIndex, setSelectedRangeEndIndex] = useState<number | ''>('');
  const [chapterPreview, setChapterPreview] = useState('');
  const [libraryStatus, setLibraryStatus] = useState<TaskWizardLibraryStatus>('idle');
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

  const refreshLibraryBooks = async () => {
    setLibraryStatus('loading-books');
    setLibraryError('');
    try {
      const books = await listBooks();
      setLibraryBooks(books);
      return books;
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '项目素材库刷新失败');
      return [];
    } finally {
      setLibraryStatus('idle');
    }
  };

  const handlePickUploadFile = async () => {
    const filePath = await pickLocalFile();
    if (!filePath) return;
    setUploadFilePath(filePath);
    if (!uploadTitle.trim()) {
      setUploadTitle((filePath.split(/[\\/]/).pop() || '').replace(/\.(txt|md)$/i, ''));
    }
  };

  const handleUploadIntoLibrary = async () => {
    if (!uploadFilePath) {
      setLibraryError('请先选择一个 .txt 或 .md 文件');
      return;
    }
    if (!uploadTitle.trim()) {
      setLibraryError('请先填写书名');
      return;
    }

    setUploadingBook(true);
    setLibraryError('');
    try {
      const uploaded = await uploadBook({
        filePath: uploadFilePath,
        title: uploadTitle.trim(),
        author: uploadAuthor.trim() || undefined,
      });
      const books = await refreshLibraryBooks();
      const nextBook = books.find((book) => book.id === uploaded.book_id) || books[0];
      if (nextBook) {
        setSelectedBookId(nextBook.id);
        setSourceMode('library');
      }
      setUploadFilePath('');
      setUploadTitle('');
      setUploadAuthor('');
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : '上传到项目素材库失败');
    } finally {
      setUploadingBook(false);
    }
  };

  const selectedBook = useMemo(
    () => libraryBooks.find((book) => book.id === selectedBookId) || null,
    [libraryBooks, selectedBookId],
  );

  const selectedChapter = useMemo(
    () => libraryChapters.find((chapter) => chapter.chapter_index === selectedChapterIndex) || null,
    [libraryChapters, selectedChapterIndex],
  );

  const selectedRangeChapters = useMemo(() => {
    if (!selectedBook || libraryChapters.length === 0) return [];
    if (selectedRangeMode === 'all') return libraryChapters;
    if (selectedRangeMode === 'range') {
      const start = selectedChapterIndex === '' ? libraryChapters[0]?.chapter_index ?? 0 : Number(selectedChapterIndex);
      const end = selectedRangeEndIndex === '' ? start : Number(selectedRangeEndIndex);
      const [from, to] = [start, end].sort((a, b) => a - b);
      return libraryChapters.filter((chapter) => chapter.chapter_index >= from && chapter.chapter_index <= to);
    }
    return selectedChapter ? [selectedChapter] : [];
  }, [libraryChapters, selectedBook, selectedChapter, selectedChapterIndex, selectedRangeEndIndex, selectedRangeMode]);

  const selectedRangeTotalChars = useMemo(
    () => selectedRangeChapters.reduce((sum, chapter) => sum + Number(chapter.char_count || 0), 0),
    [selectedRangeChapters],
  );

  const selectedRangeLabel = useMemo(() => {
    if (selectedRangeMode === 'all') {
      return `全书规划 · ${selectedRangeChapters.length} 章`;
    }
    if (selectedRangeChapters.length > 1) {
      const first = selectedRangeChapters[0];
      const last = selectedRangeChapters[selectedRangeChapters.length - 1];
      return `${first?.title || `第 ${first?.chapter_index != null ? first.chapter_index + 1 : 1} 章`} - ${last?.title || `第 ${last?.chapter_index != null ? last.chapter_index + 1 : 1} 章`}`;
    }
    return selectedChapter?.title || (selectedChapter ? `第 ${selectedChapter.chapter_index + 1} 章` : '待选择章节');
  }, [selectedChapter, selectedRangeChapters, selectedRangeMode]);

  const sourceReady = sourceMode === 'library'
    ? Boolean(selectedBook && selectedRangeChapters.length > 0)
    : sourceMode === 'upload'
      ? false
      : Boolean(pastedText.trim());

  const sourceSummary = selectedBook?.title || uploadTitle.trim() || '待选择素材';
  const sourceTypeLabel = selectedBook?.source_type || (sourceMode === 'paste' ? '临时粘贴文本' : '待识别');
  const sourceWordCountLabel = selectedRangeTotalChars
    ? `约 ${selectedRangeTotalChars.toLocaleString('zh-CN')} 字`
    : sourceMode === 'paste' && pastedText.trim()
      ? `约 ${pastedText.trim().length.toLocaleString('zh-CN')} 字`
      : '待真实解析';

  return {
    sourceMode,
    setSourceMode,
    libraryBooks,
    libraryChapters,
    selectedBookId,
    setSelectedBookId,
    selectedChapterIndex,
    setSelectedChapterIndex,
    selectedRangeMode,
    setSelectedRangeMode,
    selectedRangeEndIndex,
    setSelectedRangeEndIndex,
    chapterPreview,
    libraryStatus,
    libraryError,
    uploadFilePath,
    uploadTitle,
    setUploadTitle,
    uploadAuthor,
    setUploadAuthor,
    uploadingBook,
    pastedText,
    setPastedText,
    handlePickUploadFile,
    handleUploadIntoLibrary,
    selectedBook,
    selectedChapter,
    selectedRangeChapters,
    selectedRangeTotalChars,
    selectedRangeLabel,
    sourceReady,
    sourceSummary,
    sourceTypeLabel,
    sourceWordCountLabel,
  };
}
