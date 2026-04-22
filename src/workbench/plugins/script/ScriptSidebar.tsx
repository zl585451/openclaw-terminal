import type { ScriptChapter } from '../../../utils/scriptParser';
import { scriptStyles } from './styles';

export function ScriptSidebar({
  collapsed,
  chapters,
  activeIdx,
  onToggleCollapsed,
  onSelectChapter,
}: {
  collapsed: boolean;
  chapters: ScriptChapter[];
  activeIdx: number;
  onToggleCollapsed: () => void;
  onSelectChapter: (idx: number) => void;
}) {
  return (
    <div style={scriptStyles.sidebar(collapsed)}>
      <div style={scriptStyles.sidebarTitle}>
        {!collapsed && <span style={scriptStyles.sidebarTitleText}>章节目录</span>}
        <button
          type="button"
          style={scriptStyles.sidebarToggleBtn}
          onClick={onToggleCollapsed}
          title={collapsed ? '展开目录' : '收起目录'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>
      {!collapsed && chapters.map((chapter, idx) => (
        <div
          key={`${idx}-${chapter.title}`}
          style={scriptStyles.chapterItem(idx === activeIdx)}
          onClick={() => onSelectChapter(idx)}
          title={chapter.title}
        >
          {chapter.title}
        </div>
      ))}
    </div>
  );
}
