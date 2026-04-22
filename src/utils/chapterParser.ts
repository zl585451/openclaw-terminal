export interface ChapterBoundary {
  title: string;
  lineIndex: number;
}

export interface ChapterLineRange extends ChapterBoundary {
  endLineIndex: number;
}

const RE_CHAPTER_TITLE = /^(第[零一二三四五六七八九十百千\d]+[幕章集回节]|序幕|尾声|终幕|间幕|番外|前情提要|开场|结局)([\s：:·・\-—]*.*)?$/;

export function isChapterTitle(line: string): boolean {
  return RE_CHAPTER_TITLE.test(String(line || '').trim());
}

export function extractChapterBoundaries(lines: string[]): ChapterBoundary[] {
  const boundaries: ChapterBoundary[] = [];

  lines.forEach((line, index) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) return;
    if (!isChapterTitle(trimmed)) return;
    boundaries.push({
      title: trimmed,
      lineIndex: index,
    });
  });

  return boundaries;
}

export function findChapterLineStarts(lines: string[], chapterTitles: string[]): number[] {
  const normalizedLines = lines.map((line) => String(line || '').trim());
  const trimmedTitles = chapterTitles.map((title) => String(title || '').trim()).filter(Boolean);
  const starts: number[] = [];
  let searchFrom = 0;

  for (const title of trimmedTitles) {
    const idx = normalizedLines.findIndex((line, i) => i >= searchFrom && line === title);
    if (idx < 0) {
      return [];
    }
    starts.push(idx);
    searchFrom = idx + 1;
  }

  return starts;
}

export function buildChapterLineRanges(lines: string[], chapterTitles: string[]): ChapterLineRange[] {
  const starts = findChapterLineStarts(lines, chapterTitles);
  if (starts.length !== chapterTitles.length || starts.length === 0) return [];

  return starts.map((lineIndex, idx) => ({
    title: String(chapterTitles[idx] || '').trim(),
    lineIndex,
    endLineIndex: typeof starts[idx + 1] === 'number' ? starts[idx + 1] - 1 : lines.length - 1,
  }));
}

export function buildChapterLineRangesFromLines(lines: string[]): ChapterLineRange[] {
  const boundaries = extractChapterBoundaries(lines);
  if (boundaries.length === 0) return [];

  return boundaries.map((boundary, idx) => ({
    title: boundary.title,
    lineIndex: boundary.lineIndex,
    endLineIndex: typeof boundaries[idx + 1]?.lineIndex === 'number'
      ? boundaries[idx + 1].lineIndex - 1
      : lines.length - 1,
  }));
}
