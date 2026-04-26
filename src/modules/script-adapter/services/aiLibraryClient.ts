/**
 * 工作台书库：通过 Electron main IPC 访问 AI.library `/api/library/*`（不经 Gateway）。
 */

export interface LibraryBook {
  id: string;
  title: string;
  author: string | null;
  source_type: string;
  source_format: string;
  total_chars: number;
  chapter_count: number;
  uploaded_at: string;
  metadata?: unknown;
}

export interface LibraryChapter {
  id: string;
  book_id: string;
  chapter_index: number;
  title: string | null;
  start_char: number | null;
  end_char: number | null;
  char_count: number | null;
  preview: string | null;
}

type LibraryListPayload = { success?: boolean; books?: LibraryBook[]; total?: number };
type LibraryChaptersPayload = { success?: boolean; chapters?: LibraryChapter[]; book_id?: string };
type LibraryChapterPayload = {
  success?: boolean;
  chapter: LibraryChapter;
  text: string;
};

type LibraryIpcOk<T> = { success: true; data: T };
type LibraryIpcErr = { success: false; error: string };
type LibraryIpcResult<T> = LibraryIpcOk<T> | LibraryIpcErr;

function api() {
  if (typeof window === 'undefined' || !window.electronAPI?.library) {
    throw new Error('LIBRARY_API_UNAVAILABLE: 当前环境未注入书库 IPC（需 Electron 且 preload 已暴露 library）');
  }
  return window.electronAPI.library;
}

export async function listBooks(limit = 50, offset = 0): Promise<LibraryBook[]> {
  const res = (await api().list({ limit, offset })) as LibraryIpcResult<LibraryListPayload>;
  if (!res.success) throw new Error(res.error);
  const inner = res.data as LibraryListPayload;
  return inner?.books ?? [];
}

export async function listChapters(bookId: string): Promise<LibraryChapter[]> {
  const res = (await api().chapters(bookId)) as LibraryIpcResult<LibraryChaptersPayload>;
  if (!res.success) throw new Error(res.error);
  const inner = res.data as LibraryChaptersPayload;
  return inner?.chapters ?? [];
}

export async function getChapterText(
  bookId: string,
  chapterIndex: number,
): Promise<{ chapter: LibraryChapter; text: string }> {
  const res = (await api().chapter(bookId, chapterIndex)) as LibraryIpcResult<LibraryChapterPayload>;
  if (!res.success) throw new Error(res.error);
  const inner = res.data as LibraryChapterPayload;
  return { chapter: inner.chapter, text: inner.text };
}
