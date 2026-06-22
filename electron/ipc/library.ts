import { ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { app } from 'electron';
import type { IpcDeps } from './types';

type NativeLibraryBook = {
  id: string;
  title: string;
  author: string | null;
  source_type: string;
  source_format: string;
  source_path: string;
  total_chars: number;
  chapter_count: number;
  uploaded_at: string;
  metadata: Record<string, unknown>;
};

type NativeLibraryChapter = {
  id: string;
  book_id: string;
  chapter_index: number;
  title: string | null;
  start_char: number;
  end_char: number;
  char_count: number;
  preview: string;
};

type NativeLibraryIndex = {
  version: 1;
  books: NativeLibraryBook[];
  chapters: NativeLibraryChapter[];
};

function getNativeLibraryRoot(): string {
  return path.join(app.getPath('userData'), 'ai_library_data', 'library');
}

function getNativeLibrarySourcesRoot(): string {
  return path.join(getNativeLibraryRoot(), 'sources');
}

function getNativeLibraryIndexPath(): string {
  return path.join(getNativeLibraryRoot(), 'library.json');
}

function ensureNativeLibraryDirs(): void {
  fs.mkdirSync(getNativeLibrarySourcesRoot(), { recursive: true });
}

function readNativeLibraryIndex(): NativeLibraryIndex {
  ensureNativeLibraryDirs();
  const indexPath = getNativeLibraryIndexPath();
  if (!fs.existsSync(indexPath)) {
    return { version: 1, books: [], chapters: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    return {
      version: 1,
      books: Array.isArray(parsed.books) ? parsed.books : [],
      chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
    };
  } catch {
    return { version: 1, books: [], chapters: [] };
  }
}

function writeNativeLibraryIndex(index: NativeLibraryIndex): void {
  ensureNativeLibraryDirs();
  fs.writeFileSync(getNativeLibraryIndexPath(), JSON.stringify(index, null, 2), 'utf-8');
}

function decodeLibraryText(buffer: Buffer): string {
  const utf8 = buffer.toString('utf-8').replace(/^\ufeff/, '');
  const replacementCount = (utf8.match(/\ufffd/g) || []).length;
  if (replacementCount === 0) return utf8;
  try {
    const decoder = new TextDecoder('gb18030');
    const decoded = decoder.decode(buffer).replace(/^\ufeff/, '');
    const decodedReplacementCount = (decoded.match(/\ufffd/g) || []).length;
    return decodedReplacementCount < replacementCount ? decoded : utf8;
  } catch {
    return utf8;
  }
}

function normalizeChapterTitle(title: string): string {
  let normalized = String(title || '').trim();
  const patterns = [/^(第[一二三四五六七八九十百千零\d]+[章回])/, /^(Chapter\s+\d+)\b/i];
  for (const pattern of patterns) {
    while (true) {
      const match = normalized.match(pattern);
      if (!match) break;
      const prefix = match[1];
      const rest = normalized.slice(prefix.length).trimStart();
      if (!rest.startsWith(prefix)) break;
      normalized = `${prefix} ${rest.slice(prefix.length).trimStart()}`.trim();
    }
  }
  return normalized;
}

function bodyTextWithoutTitle(content: string): string {
  const lines = content.replace(/^\ufeff/, '').split(/\r?\n/);
  if (lines.length === 0) return '';
  return lines.slice(1).join('\n').trimStart();
}

function bodySignalChars(content: string): number {
  const body = bodyTextWithoutTitle(content);
  const compact = body.trim();
  if (!compact || /^[\s\-_=~*#·.。…—]+$/.test(compact)) return 0;
  return (body.match(/[\u4e00-\u9fffA-Za-z0-9]/g) || []).length;
}

function splitNativeLibraryChapters(text: string, bookId: string): NativeLibraryChapter[] {
  const cleanText = String(text || '').replace(/^\ufeff/, '');
  if (!cleanText) return [];
  const patterns = [
    /(?:^|\n)\s*(第[一二三四五六七八九十百千零\d]+[章回][^\n]*)/g,
    /(?:^|\n)\s*(Chapter\s+\d+[^\n]*)/gi,
    /(?:^|\n)\s*(#{1,3}\s+[^\n]+)/g,
  ];
  let matches: Array<{ start: number; title: string }> = [];
  for (const pattern of patterns) {
    matches = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(cleanText)) !== null) {
      const title = normalizeChapterTitle(match[1] || '');
      const start = match.index + match[0].lastIndexOf(match[1] || '');
      matches.push({ start, title });
    }
    if (matches.length > 0) break;
  }
  matches.sort((a, b) => a.start - b.start);
  const deduped = matches.filter((entry, index) => index === 0 || entry.start !== matches[index - 1].start);

  if (deduped.length === 0) {
    return [{
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
      book_id: bookId,
      chapter_index: 0,
      title: '全文',
      start_char: 0,
      end_char: cleanText.length,
      char_count: cleanText.length,
      preview: cleanText.slice(0, 200),
    }];
  }

  const candidates = deduped.map((entry, index) => {
    const end = index + 1 < deduped.length ? deduped[index + 1].start : cleanText.length;
    const content = cleanText.slice(entry.start, end);
    return { ...entry, end, content, bodySignal: bodySignalChars(content) };
  });
  let startIndex = 0;
  for (let i = 0; i < Math.min(candidates.length, 24); i += 1) {
    if (candidates[i].bodySignal >= 80) {
      startIndex = i;
      break;
    }
  }
  const filtered = candidates.slice(startIndex).filter((candidate) => candidate.bodySignal > 0);
  const finalCandidates = filtered.length > 0 ? filtered : [{
    start: 0,
    end: cleanText.length,
    title: '全文',
    content: cleanText,
    bodySignal: cleanText.length,
  }];
  return finalCandidates.map((candidate, index) => ({
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 12),
    book_id: bookId,
    chapter_index: index,
    title: candidate.title,
    start_char: candidate.start,
    end_char: candidate.end,
    char_count: candidate.content.length,
    preview: candidate.content.slice(0, 200),
  }));
}

function listNativeLibraryBooks(limit = 50, offset = 0): NativeLibraryBook[] {
  const index = readNativeLibraryIndex();
  return [...index.books]
    .sort((a, b) => String(b.uploaded_at).localeCompare(String(a.uploaded_at)))
    .slice(offset, offset + limit);
}

function getNativeLibraryBook(bookId: string): NativeLibraryBook | null {
  const index = readNativeLibraryIndex();
  return index.books.find((book) => book.id === bookId) || null;
}

function listNativeLibraryChapters(bookId: string): NativeLibraryChapter[] {
  const index = readNativeLibraryIndex();
  return index.chapters
    .filter((chapter) => chapter.book_id === bookId)
    .sort((a, b) => a.chapter_index - b.chapter_index);
}

function getNativeLibraryChapterText(bookId: string, chapterIndex: number): { chapter: NativeLibraryChapter; text: string } | null {
  const book = getNativeLibraryBook(bookId);
  if (!book) return null;
  const chapter = listNativeLibraryChapters(bookId).find((item) => item.chapter_index === chapterIndex);
  if (!chapter) return null;
  const sourcePath = path.join(getNativeLibraryRoot(), book.source_path);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file missing: ${book.source_path}`);
  }
  const text = decodeLibraryText(fs.readFileSync(sourcePath));
  return {
    chapter,
    text: text.slice(chapter.start_char, chapter.end_char),
  };
}

async function updateNativeLibraryChapterText(
  bookId: string,
  chapterIndex: number,
  content: string,
): Promise<{ chapter: NativeLibraryChapter; text: string; book: NativeLibraryBook }> {
  const index = readNativeLibraryIndex();
  const book = index.books.find((item) => item.id === bookId);
  if (!book) throw new Error(`Book ${bookId} not found`);

  const chapters = index.chapters
    .filter((chapter) => chapter.book_id === bookId)
    .sort((a, b) => a.chapter_index - b.chapter_index);
  const chapter = chapters.find((item) => item.chapter_index === chapterIndex);
  if (!chapter) throw new Error(`Chapter ${chapterIndex} not found in book ${bookId}`);

  const sourcePath = path.join(getNativeLibraryRoot(), book.source_path);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file missing: ${book.source_path}`);
  }

  const text = decodeLibraryText(await fs.promises.readFile(sourcePath));
  const start = Number(chapter.start_char);
  const end = Number(chapter.end_char);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > text.length) {
    throw new Error(`Invalid chapter range for ${bookId}:${chapterIndex}`);
  }

  const nextText = `${text.slice(0, start)}${String(content || '')}${text.slice(end)}`;
  await fs.promises.writeFile(sourcePath, nextText, 'utf-8');

  const nextChapters = splitNativeLibraryChapters(nextText, bookId);
  const nextBook: NativeLibraryBook = {
    ...book,
    total_chars: nextText.length,
    chapter_count: nextChapters.length,
    metadata: {
      ...(book.metadata || {}),
      updated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    },
  };

  index.books = index.books.map((item) => (item.id === bookId ? nextBook : item));
  index.chapters = [
    ...index.chapters.filter((item) => item.book_id !== bookId),
    ...nextChapters,
  ];
  writeNativeLibraryIndex(index);

  const updatedChapter =
    nextChapters.find((item) => item.chapter_index === chapterIndex)
    || nextChapters[Math.min(chapterIndex, Math.max(0, nextChapters.length - 1))];

  return {
    chapter: updatedChapter,
    text: content,
    book: nextBook,
  };
}

async function uploadNativeLibraryBook(params: { filePath: string; title: string; author?: string }): Promise<{
  book_id: string;
  chapter_count: number;
  total_chars: number;
}> {
  const filePath = String(params.filePath || '').trim();
  const title = String(params.title || '').trim();
  const author = String(params.author || '').trim();
  if (!filePath) throw new Error('filePath required');
  if (!title) throw new Error('title required');
  const ext = path.extname(filePath).toLowerCase();
  if (!['.txt', '.md'].includes(ext)) {
    throw new Error('暂不支持该格式，请使用 .txt 或 .md 文件');
  }
  const buffer = await fs.promises.readFile(filePath);
  const text = decodeLibraryText(buffer);
  const bookId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const suffix = ext.slice(1);
  const sourceRel = path.join('sources', `${bookId}.${suffix}`).replace(/\\/g, '/');
  const sourceAbs = path.join(getNativeLibraryRoot(), sourceRel);
  ensureNativeLibraryDirs();
  await fs.promises.writeFile(sourceAbs, text, 'utf-8');
  const chapters = splitNativeLibraryChapters(text, bookId);
  const book: NativeLibraryBook = {
    id: bookId,
    title,
    author: author || null,
    source_type: 'novel',
    source_format: suffix,
    source_path: sourceRel,
    total_chars: text.length,
    chapter_count: chapters.length,
    uploaded_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    metadata: {},
  };
  const index = readNativeLibraryIndex();
  index.books = [book, ...index.books.filter((item) => item.id !== bookId)];
  index.chapters = [...index.chapters.filter((item) => item.book_id !== bookId), ...chapters];
  writeNativeLibraryIndex(index);
  return {
    book_id: bookId,
    chapter_count: chapters.length,
    total_chars: text.length,
  };
}

function deleteNativeLibraryBook(bookId: string): boolean {
  const index = readNativeLibraryIndex();
  const book = index.books.find((item) => item.id === bookId);
  if (!book) return false;
  index.books = index.books.filter((item) => item.id !== bookId);
  index.chapters = index.chapters.filter((item) => item.book_id !== bookId);
  writeNativeLibraryIndex(index);
  const sourcePath = path.join(getNativeLibraryRoot(), book.source_path);
  if (fs.existsSync(sourcePath)) {
    try {
      fs.unlinkSync(sourcePath);
    } catch {
      /* ignore orphan source cleanup failures */
    }
  }
  return true;
}

export function registerLibraryHandlers(_deps: IpcDeps) {
  ipcMain.handle('library:list', async (_event, payload: { limit?: number; offset?: number }) => {
    const limit = Number(payload?.limit) > 0 ? Math.floor(Number(payload.limit)) : 50;
    const offset = Number(payload?.offset) >= 0 ? Math.floor(Number(payload.offset)) : 0;
    try {
      const books = listNativeLibraryBooks(limit, offset);
      return { success: true, data: { success: true, books, total: books.length } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LIBRARY_LIST_FAILED: ${msg}` };
    }
  });

  ipcMain.handle('library:get', async (_event, payload: { bookId: string }) => {
    if (!payload?.bookId) return { success: false, error: 'bookId required' };
    try {
      const book = getNativeLibraryBook(payload.bookId);
      if (!book) return { success: false, error: `Book ${payload.bookId} not found` };
      return { success: true, data: { success: true, book } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LIBRARY_GET_FAILED: ${msg}` };
    }
  });

  ipcMain.handle('library:chapters', async (_event, payload: { bookId: string }) => {
    if (!payload?.bookId) return { success: false, error: 'bookId required' };
    try {
      const book = getNativeLibraryBook(payload.bookId);
      if (!book) return { success: false, error: `Book ${payload.bookId} not found` };
      return {
        success: true,
        data: { success: true, book_id: payload.bookId, chapters: listNativeLibraryChapters(payload.bookId) },
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LIBRARY_CHAPTERS_FAILED: ${msg}` };
    }
  });

  ipcMain.handle('library:chapter', async (_event, payload: { bookId: string; chapterIndex: number }) => {
    if (!payload?.bookId) return { success: false, error: 'bookId required' };
    if (typeof payload?.chapterIndex !== 'number' || Number.isNaN(payload.chapterIndex)) {
      return { success: false, error: 'chapterIndex required' };
    }
    try {
      const data = getNativeLibraryChapterText(payload.bookId, payload.chapterIndex);
      if (!data) return { success: false, error: `Chapter ${payload.chapterIndex} not found in book ${payload.bookId}` };
      return { success: true, data: { success: true, book_id: payload.bookId, ...data } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LIBRARY_CHAPTER_FAILED: ${msg}` };
    }
  });

  ipcMain.handle('library:updateChapter', async (_event, payload: { bookId: string; chapterIndex: number; content: string }) => {
    if (!payload?.bookId) return { success: false, error: 'bookId required' };
    if (typeof payload?.chapterIndex !== 'number' || Number.isNaN(payload.chapterIndex)) {
      return { success: false, error: 'chapterIndex required' };
    }
    if (typeof payload?.content !== 'string') return { success: false, error: 'content required' };
    try {
      const data = await updateNativeLibraryChapterText(payload.bookId, payload.chapterIndex, payload.content);
      return { success: true, data: { success: true, book_id: payload.bookId, ...data } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LIBRARY_UPDATE_CHAPTER_FAILED: ${msg}` };
    }
  });

  ipcMain.handle('library:pickFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择小说文件',
        filters: [
          { name: '文本文件', extensions: ['txt', 'md'] },
          { name: '所有文件', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'cancelled' };
      }
      return { success: true, filePath: result.filePaths[0] };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `PICK_FILE_FAILED: ${msg}` };
    }
  });

  ipcMain.handle('library:upload', async (_event, payload: {
    filePath: string;
    title: string;
    author?: string;
  }) => {
    const filePath = String(payload?.filePath || '').trim();
    const title = String(payload?.title || '').trim();
    const author = String(payload?.author || '').trim();

    if (!filePath) return { success: false, error: 'filePath required' };
    if (!title) return { success: false, error: 'title required' };

    try {
      const data = await uploadNativeLibraryBook({ filePath, title, author });
      return { success: true, data };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `UPLOAD_FAILED: ${msg}` };
    }
  });

  ipcMain.handle('library:delete', async (_event, payload: { bookId: string }) => {
    if (!payload?.bookId) return { success: false, error: 'bookId required' };
    try {
      const deleted = deleteNativeLibraryBook(payload.bookId);
      if (!deleted) return { success: false, error: `Book ${payload.bookId} not found` };
      return { success: true, data: { success: true, deleted: payload.bookId } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `LIBRARY_DELETE_FAILED: ${msg}` };
    }
  });
}
