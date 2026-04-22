import type React from 'react';
import type { ScriptChapter, ScriptLine } from '../../../utils/scriptParser';
import { scriptStyles } from './styles';
import { ScriptLineView } from './ScriptLineView';

export function ScriptContent({
  contentRef,
  chapter,
  activeIdx,
  visibleLineEntries,
  effectiveColors,
  contentFontSize,
  onMouseUp,
  onKeyUp,
  onContextMenu,
}: {
  contentRef: React.RefObject<HTMLDivElement | null>;
  chapter: ScriptChapter | undefined;
  activeIdx: number;
  visibleLineEntries: Array<{ line: ScriptLine; chapterLineIndex: number }>;
  effectiveColors: Record<string, string>;
  contentFontSize: number;
  onMouseUp: () => void;
  onKeyUp: () => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      ref={contentRef as React.RefObject<HTMLDivElement>}
      style={scriptStyles.content(contentFontSize)}
      onMouseUp={onMouseUp}
      onKeyUp={onKeyUp}
      onContextMenu={onContextMenu}
    >
      {chapter && (
        <>
          <div style={scriptStyles.chapterTitle(contentFontSize)}>{chapter.title}</div>
          {visibleLineEntries.map(({ line, chapterLineIndex }, i) => (
            <div
              key={`${activeIdx}-${i}-${line.raw}`}
              data-script-line-index={chapterLineIndex}
            >
              <ScriptLineView
                line={line}
                colorMap={effectiveColors}
                fontSize={contentFontSize}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
