import { ContentBlock } from './types';
import type { RenderSegment } from '../utils/optionBoxParser';

export function blocksToSegments(blocks: ContentBlock[]): RenderSegment[] {
  return blocks.map((block) => {
    if (block.type === 'text') {
      return {
        type: 'text',
        content: block.text,
        options: [],
      };
    }

    if (block.type === 'code') {
      const lang = block.language || '';
      const normalizedCode = block.code.endsWith('\n') ? block.code : `${block.code}\n`;
      return {
        type: 'text',
        content: `\`\`\`${lang}\n${normalizedCode}\`\`\``,
        options: [],
      };
    }

    return {
      type: 'text',
      content: '',
      options: [],
    };
  });
}
