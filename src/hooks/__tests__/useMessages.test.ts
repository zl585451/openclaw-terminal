import { describe, expect, it } from 'vitest';
import { preferDoneTextWhenMoreComplete } from '../useMessages';

describe('preferDoneTextWhenMoreComplete', () => {
  it('uses done text to recover when streamed delta stopped early', () => {
    expect(preferDoneTextWhenMoreComplete('现在换个做法，先找到', '现在换个做法，先找到标签渲染的逻辑。')).toBe(
      '现在换个做法，先找到标签渲染的逻辑。',
    );
  });

  it('keeps current text when done text is empty', () => {
    expect(preferDoneTextWhenMoreComplete('已经流式收到的正文', '')).toBe('已经流式收到的正文');
  });
});
