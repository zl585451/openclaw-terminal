import { useCallback, useMemo, useState } from 'react';
import { useProject } from '../contexts/ProjectContext';
import { getChapterText } from '../modules/script-adapter/services/aiLibraryClient';
import { useWorkbench } from './WorkbenchContext';
import type { WorkbenchDocument } from './types';

export function useProjectChapterLink(document: WorkbenchDocument) {
  const workbench = useWorkbench();
  const { activeProject } = useProject();
  const [isSwitchingChapter, setIsSwitchingChapter] = useState(false);
  const [chapterSwitchError, setChapterSwitchError] = useState<string | null>(null);

  const linkedProject = useMemo(() => {
    if (!document.projectBookId || !activeProject) return null;
    return activeProject.id === document.projectBookId ? activeProject : null;
  }, [activeProject, document.projectBookId]);

  const currentProjectChapterIndex = Number.isInteger(document.projectChapterIndex)
    ? Number(document.projectChapterIndex)
    : null;

  const switchToProjectChapter = useCallback(async (chapterIndex: number) => {
    if (!linkedProject || !Number.isInteger(chapterIndex) || isSwitchingChapter) return;
    if (currentProjectChapterIndex === chapterIndex) return;

    setIsSwitchingChapter(true);
    setChapterSwitchError(null);
    try {
      const { chapter, text } = await getChapterText(linkedProject.id, chapterIndex);
      const title = chapter.title ?? `第 ${chapterIndex + 1} 章`;
      workbench.updateDocument(document.id, {
        title: `${linkedProject.title} · ${title}`,
        content: text,
        projectBookId: linkedProject.id,
        projectChapterIndex: chapterIndex,
      });
    } catch (error) {
      setChapterSwitchError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSwitchingChapter(false);
    }
  }, [
    currentProjectChapterIndex,
    document.id,
    isSwitchingChapter,
    linkedProject,
    workbench,
  ]);

  return {
    linkedProject,
    currentProjectChapterIndex,
    isSwitchingChapter,
    chapterSwitchError,
    switchToProjectChapter,
  };
}
