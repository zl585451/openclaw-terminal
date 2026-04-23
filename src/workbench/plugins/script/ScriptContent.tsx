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
  inferredSpeakers,
  structuredLineIndices,
  voiceFragmentSpeakers,
  contentFontSize,
  boundLineRange,
  onMouseUp,
  onKeyUp,
  onContextMenu,
}: {
  contentRef: React.RefObject<HTMLDivElement | null>;
  chapter: ScriptChapter | undefined;
  activeIdx: number;
  visibleLineEntries: Array<{ line: ScriptLine; chapterLineIndex: number }>;
  effectiveColors: Record<string, string>;
  inferredSpeakers: Record<number, string>;
  structuredLineIndices: Set<number>;
  voiceFragmentSpeakers: Record<number, string | undefined>;
  contentFontSize: number;
  boundLineRange: { start: number; end: number } | null;
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
              style={scriptStyles.lineSelectionHighlight(
                !!boundLineRange
                  && chapterLineIndex >= boundLineRange.start
                  && chapterLineIndex <= boundLineRange.end,
              )}
            >
              <ScriptLineView
                line={line}
                colorMap={effectiveColors}
                inferredSpeaker={inferredSpeakers[chapterLineIndex]}
                structuredRecord={structuredLineIndices.has(chapterLineIndex)}
                voiceFragmentSpeaker={voiceFragmentSpeakers[chapterLineIndex]}
                fontSize={contentFontSize}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
