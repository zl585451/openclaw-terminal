import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  listBooks,
  listChapters,
  type LibraryBook,
  type LibraryChapter,
} from '../modules/script-adapter/services/aiLibraryClient';

export interface ActiveProjectChapter {
  chapter_index: number;
  title: string | null;
  char_count: number | null;
}

export interface ActiveProject {
  id: string;
  title: string;
  author: string | null;
  total_chars: number;
  chapter_count: number;
  chapters: ActiveProjectChapter[];
}

interface ProjectContextValue {
  activeProject: ActiveProject | null;
  activeProjectId: string | null;
  setActiveProjectById: (bookId: string | null) => Promise<void>;
  clearActiveProject: () => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const STORAGE_KEY = 'oct.active-project-id';

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [activeProject, setActiveProject] = useState<ActiveProject | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const clearStoredProject = useCallback(() => {
    setActiveProjectId(null);
    setActiveProject(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore localStorage failures
    }
  }, []);

  const loadProject = useCallback(async (bookId: string) => {
    setIsLoading(true);
    try {
      const books = await listBooks();
      const book = books.find((entry: LibraryBook) => entry.id === bookId);
      if (!book) {
        clearStoredProject();
        return;
      }
      const chapters = await listChapters(bookId);
      setActiveProject({
        id: book.id,
        title: book.title,
        author: book.author,
        total_chars: book.total_chars,
        chapter_count: book.chapter_count,
        chapters: chapters.map((chapter: LibraryChapter) => ({
          chapter_index: chapter.chapter_index,
          title: chapter.title,
          char_count: chapter.char_count,
        })),
      });
    } catch (error) {
      console.warn('[ProjectContext] 加载当前项目失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [clearStoredProject]);

  useEffect(() => {
    if (!activeProjectId) return;
    void loadProject(activeProjectId);
  }, [activeProjectId, loadProject]);

  const setActiveProjectById = useCallback(async (bookId: string | null) => {
    if (!bookId) {
      clearStoredProject();
      return;
    }
    setActiveProjectId(bookId);
    try {
      localStorage.setItem(STORAGE_KEY, bookId);
    } catch {
      // ignore localStorage failures
    }
    await loadProject(bookId);
  }, [clearStoredProject, loadProject]);

  const clearActiveProject = useCallback(() => {
    clearStoredProject();
  }, [clearStoredProject]);

  return (
    <ProjectContext.Provider
      value={{
        activeProject,
        activeProjectId,
        setActiveProjectById,
        clearActiveProject,
        isLoading,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within ProjectProvider');
  }
  return context;
}
