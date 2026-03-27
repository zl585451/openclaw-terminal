import { ContentBlock } from './types';

let id = 0;
const nextId = () => `block_${id++}`;

export function blockRouter(raw: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeRegex.exec(raw))) {
    const [full, lang, code] = match;

    if (match.index > lastIndex) {
      blocks.push({
        id: nextId(),
        type: 'text',
        text: raw.slice(lastIndex, match.index),
      });
    }

    blocks.push({
      id: nextId(),
      type: 'code',
      language: lang,
      code,
    });

    lastIndex = match.index + full.length;
  }

  if (lastIndex < raw.length) {
    blocks.push({
      id: nextId(),
      type: 'text',
      text: raw.slice(lastIndex),
    });
  }

  return blocks;
}

