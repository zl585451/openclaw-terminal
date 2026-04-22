import type { ScriptLine } from '../../../utils/scriptParser';
import { scriptStyles } from './styles';

function splitDialogueContent(
  content: string,
): Array<{ text: string; isAnnotation: boolean }> {
  if (!content) return [];

  const re = /[（(]([^）)\n]+)[）)]/g;
  const segments: Array<{ text: string; isAnnotation: boolean }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index);
      if (before) segments.push({ text: before, isAnnotation: false });
    }
    segments.push({ text: match[0], isAnnotation: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const tail = content.slice(lastIndex);
    if (tail) segments.push({ text: tail, isAnnotation: false });
  }

  if (segments.length === 0) {
    segments.push({ text: content, isAnnotation: false });
  }

  return segments;
}

export function ScriptLineView({
  line,
  colorMap,
  fontSize,
}: {
  line: ScriptLine;
  colorMap: Record<string, string>;
  fontSize: number;
}) {
  if (line.type === 'blank') return <div style={{ height: '8px' }} />;

  if (line.type === 'dialogue' || line.type === 'narrator') {
    const displayName = line.character || '旁白';
    const color = colorMap[displayName] || 'var(--text-primary)';
    const contentToRender = line.content || '';
    const hasExplicitEmotion = !!line.emotion;
    const segments = splitDialogueContent(contentToRender);

    return (
      <div style={scriptStyles.lineParagraph}>
        <div>
          <span style={scriptStyles.charName(color)}>{displayName}：</span>
          {hasExplicitEmotion && (
            <span style={scriptStyles.inlineAnnotation(fontSize)}>（{line.emotion}）</span>
          )}
        </div>
        <div style={scriptStyles.dialogueBody}>
          {segments.map((seg, i) =>
            seg.isAnnotation ? (
              <span key={i} style={scriptStyles.inlineAnnotation(fontSize)}>{seg.text}</span>
            ) : (
              <span key={i} style={scriptStyles.charContent(color)}>{seg.text}</span>
            ),
          )}
        </div>
      </div>
    );
  }

  if (line.type === 'direction') {
    return <div style={scriptStyles.direction(fontSize)}>{line.raw.trim()}</div>;
  }

  if (line.type === 'chapter') {
    return null;
  }

  return <div style={scriptStyles.text}>{line.content || line.raw}</div>;
}
