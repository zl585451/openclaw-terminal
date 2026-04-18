import type { ParsedScript, ScriptLine } from './scriptParser';

function serializeLine(line: ScriptLine): string {
  if (line.raw && line.raw.length > 0) return line.raw;

  if (line.type === 'blank') return '';

  if (line.type === 'dialogue') {
    const character = (line.character || '').trim();
    const content = (line.content || '').trim();
    const emotion = (line.emotion || '').trim();
    if (character && emotion) {
      return `【${character}】（${emotion}）${content}`;
    }
    if (character && content) {
      return `${character}：${content}`;
    }
  }

  if (line.type === 'narrator') {
    const content = (line.content || '').trim();
    return content ? `旁白：${content}` : '旁白：';
  }

  if (line.type === 'direction') {
    if (line.dirTag && line.content) return `【${line.dirTag}】${line.content}`;
    return (line.content || '').trim();
  }

  if (line.type === 'chapter') return (line.content || '').trim();

  return (line.content || '').trim();
}

export function exportScriptToText(script: ParsedScript): string {
  const out: string[] = [];
  const title = (script.title || '').trim();

  if (title) {
    out.push(title);
    out.push('');
  }

  script.chapters.forEach((chapter, chapterIndex) => {
    const chapterTitle = (chapter.title || '').trim();
    const shouldPrintChapterTitle =
      chapterTitle.length > 0 && !(chapterIndex === 0 && chapterTitle === title);

    if (shouldPrintChapterTitle) {
      out.push(chapterTitle);
      out.push('');
    }

    chapter.lines.forEach((line) => {
      out.push(serializeLine(line));
    });

    if (chapterIndex < script.chapters.length - 1) out.push('');
  });

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
