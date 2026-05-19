import { describe, expect, it } from 'vitest';
import { renderBlocksCacheKey, renderBlocksToParsedContent } from './renderBlocksAdapter';
import type { RenderBlock } from './chatTypes';

describe('renderBlocksAdapter', () => {
  it('maps tasklist and pills into ordered render segments', () => {
    const blocks: RenderBlock[] = [
      { type: 'markdown', content: '下面是执行计划。' },
      {
        type: 'tasklist',
        items: [
          { id: 'inspect', label: '检查当前状态' },
          { id: 'verify', label: '运行回归测试' },
        ],
      },
      {
        type: 'pills',
        prompt: '下一步怎么做？',
        items: [
          { label: '继续修复', value: '继续修复' },
          { label: '先暂停', value: '先暂停' },
        ],
      },
    ];

    const parsed = renderBlocksToParsedContent(blocks);

    expect(parsed.text).toBe('');
    expect(parsed.options).toEqual([]);
    expect(parsed.segments?.map((segment) => segment.type)).toEqual(['text', 'tasklist', 'pills']);
    expect(parsed.segments?.[0]).toEqual({ type: 'text', content: '下面是执行计划。', options: [] });
    expect(parsed.segments?.[1].options).toEqual([
      { num: 1, label: '检查当前状态', value: '检查当前状态' },
      { num: 2, label: '运行回归测试', value: '运行回归测试' },
    ]);
    expect(parsed.segments?.[2].options[0]).toEqual({ num: 1, label: '继续修复', value: '继续修复' });
  });

  it('keeps cache keys separate when structured blocks change', () => {
    const first: RenderBlock[] = [{ type: 'markdown', content: 'A' }];
    const second: RenderBlock[] = [{ type: 'markdown', content: 'B' }];

    expect(renderBlocksCacheKey('same content', first)).not.toEqual(renderBlocksCacheKey('same content', second));
    expect(renderBlocksCacheKey('same content')).toBe('same content');
  });
});
