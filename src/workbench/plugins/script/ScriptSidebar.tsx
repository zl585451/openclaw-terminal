import { useEffect, useMemo, useRef, useState } from 'react';
import { scriptStyles } from './styles';

const SIDEBAR_ITEM_HEIGHT = 42;
const SIDEBAR_OVERSCAN = 6;

export function ScriptSidebar({
  collapsed,
  chapters,
  activeIdx,
  onToggleCollapsed,
  onSelectChapter,
  statusText,
}: {
  collapsed: boolean;
  chapters: Array<{ title: string }>;
  activeIdx: number;
  onToggleCollapsed: () => void;
  onSelectChapter: (idx: number) => void;
  statusText?: string | null;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (collapsed) return;
    const listEl = listRef.current;
    if (!listEl) return;

    const updateMetrics = () => {
      setViewportHeight(listEl.clientHeight);
      setScrollTop(listEl.scrollTop);
    };

    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(listEl);
    return () => observer.disconnect();
  }, [collapsed, chapters.length]);

  useEffect(() => {
    if (collapsed) return;
    const listEl = listRef.current;
    if (!listEl) return;

    const targetTop = activeIdx * SIDEBAR_ITEM_HEIGHT;
    const targetBottom = targetTop + SIDEBAR_ITEM_HEIGHT;
    const viewTop = listEl.scrollTop;
    const viewBottom = viewTop + listEl.clientHeight;

    if (targetTop < viewTop) {
      listEl.scrollTop = targetTop;
    } else if (targetBottom > viewBottom) {
      listEl.scrollTop = Math.max(0, targetBottom - listEl.clientHeight);
    }
  }, [activeIdx, collapsed]);

  const { startIndex, endIndex, totalHeight } = useMemo(() => {
    const total = chapters.length * SIDEBAR_ITEM_HEIGHT;
    if (collapsed || chapters.length === 0) {
      return {
        startIndex: 0,
        endIndex: -1,
        totalHeight: total,
      };
    }

    const visibleCount = Math.max(1, Math.ceil((viewportHeight || SIDEBAR_ITEM_HEIGHT) / SIDEBAR_ITEM_HEIGHT));
    const start = Math.max(0, Math.floor(scrollTop / SIDEBAR_ITEM_HEIGHT) - SIDEBAR_OVERSCAN);
    const end = Math.min(
      chapters.length - 1,
      start + visibleCount + SIDEBAR_OVERSCAN * 2,
    );

    return {
      startIndex: start,
      endIndex: end,
      totalHeight: total,
    };
  }, [chapters.length, collapsed, scrollTop, viewportHeight]);

  const visibleChapters = !collapsed && endIndex >= startIndex
    ? chapters.slice(startIndex, endIndex + 1)
    : [];

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
      {!collapsed && statusText && (
        <div style={scriptStyles.sidebarStatus}>{statusText}</div>
      )}
      {!collapsed && (
        <div
          ref={listRef}
          style={scriptStyles.sidebarList}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            {visibleChapters.map((chapter, offset) => {
              const idx = startIndex + offset;
              return (
                <div
                  key={`${idx}-${chapter.title}`}
                  style={scriptStyles.virtualChapterItem(idx === activeIdx, idx * SIDEBAR_ITEM_HEIGHT, SIDEBAR_ITEM_HEIGHT)}
                  onClick={() => onSelectChapter(idx)}
                  title={chapter.title}
                >
                  {chapter.title}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
