import { documentWorkbenchStyles } from './styles';

export interface DocumentChapterSection {
  id: string;
  title: string;
}

export function DocumentChapterSidebar({
  chapters,
  activeChapterId,
  onSelectChapter,
  collapsed,
  onToggleCollapsed,
}: {
  chapters: DocumentChapterSection[];
  activeChapterId: string | null;
  onSelectChapter: (chapterId: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  if (collapsed) {
    return (
      <aside style={documentWorkbenchStyles.sidebarCollapsed}>
        <button
          type="button"
          style={documentWorkbenchStyles.railButton}
          onClick={onToggleCollapsed}
          title="展开章节目录"
        >
          目录
        </button>
      </aside>
    );
  }

  return (
    <aside style={documentWorkbenchStyles.sidebar}>
      <div style={documentWorkbenchStyles.sidebarTitle}>
        章节目录
      </div>
      <button
        type="button"
        style={documentWorkbenchStyles.railButton}
        onClick={onToggleCollapsed}
        title="收起章节目录"
      >
        收起
      </button>
      {chapters.map((chapter) => (
        <div
          key={chapter.id}
          style={documentWorkbenchStyles.sidebarItem(chapter.id === activeChapterId)}
          onClick={() => onSelectChapter(chapter.id)}
          title={chapter.title}
        >
          {chapter.title}
        </div>
      ))}
    </aside>
  );
}
