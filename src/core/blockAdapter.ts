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
      return {
        type: 'text',
        content: `\`\`\`${lang}\n${block.code}\`\`\``,
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
