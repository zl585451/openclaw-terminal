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
  inferredSpeaker,
  structuredRecord,
  voiceFragmentSpeaker,
  fontSize,
}: {
  line: ScriptLine;
  colorMap: Record<string, string>;
  inferredSpeaker?: string;
  structuredRecord?: boolean;
  voiceFragmentSpeaker?: string;
  fontSize: number;
}) {
  if (line.type === 'blank') return <div style={{ height: '8px' }} />;

  if (structuredRecord) {
    return <div style={scriptStyles.text}>{line.raw || line.content || ''}</div>;
  }

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

  const rawText = line.content || line.raw;
  const fragmentColor = voiceFragmentSpeaker
    ? colorMap[voiceFragmentSpeaker] || 'var(--accent-primary, #7EC8E3)'
    : '#E9C46A';
  if (voiceFragmentSpeaker || line.type === 'text') {
    const quoteMatches = Array.from(rawText.matchAll(/“[^”]+”/g));
    if (quoteMatches.length > 0) {
      const segments: Array<{ text: string; isQuote: boolean }> = [];
      let cursor = 0;
      quoteMatches.forEach((match) => {
        const index = match.index ?? 0;
        if (index > cursor) {
          segments.push({ text: rawText.slice(cursor, index), isQuote: false });
        }
        segments.push({ text: match[0], isQuote: true });
        cursor = index + match[0].length;
      });
      if (cursor < rawText.length) {
        segments.push({ text: rawText.slice(cursor), isQuote: false });
      }

      return (
        <div style={scriptStyles.text}>
          {segments.map((segment, index) => (
            <span
              key={`${segment.text}-${index}`}
              style={segment.isQuote ? scriptStyles.inferredQuote(fragmentColor) : undefined}
              title={segment.isQuote ? (voiceFragmentSpeaker || 'OS片段') : undefined}
            >
              {segment.text}
            </span>
          ))}
        </div>
      );
    }
  }

  if (!inferredSpeaker) {
    return <div style={scriptStyles.text}>{rawText}</div>;
  }

  const speakerColor = colorMap[inferredSpeaker] || 'var(--accent-primary, #7EC8E3)';
  const quoteMatches = Array.from(rawText.matchAll(/“[^”]+”/g));
  if (quoteMatches.length === 0) {
    return <div style={scriptStyles.text}>{rawText}</div>;
  }

  const segments: Array<{ text: string; isQuote: boolean }> = [];
  let cursor = 0;
  quoteMatches.forEach((match) => {
    const index = match.index ?? 0;
    if (index > cursor) {
      segments.push({ text: rawText.slice(cursor, index), isQuote: false });
    }
    segments.push({ text: match[0], isQuote: true });
    cursor = index + match[0].length;
  });
  if (cursor < rawText.length) {
    segments.push({ text: rawText.slice(cursor), isQuote: false });
  }

  return (
    <div style={scriptStyles.text}>
      {segments.map((segment, index) => (
        <span
          key={`${segment.text}-${index}`}
          style={segment.isQuote ? scriptStyles.inferredQuote(speakerColor) : undefined}
          title={segment.isQuote ? inferredSpeaker : undefined}
        >
          {segment.text}
        </span>
      ))}
    </div>
  );
}
