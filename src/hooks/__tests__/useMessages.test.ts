import { describe, expect, it } from 'vitest';
import { preferDoneTextWhenMoreComplete } from '../useMessages';
import { normalizeAssistantTranscriptContent } from '../../utils/cotExtract';

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

describe('normalizeAssistantTranscriptContent integration', () => {
  it('sanitizes mixed content with tool call leaks and JSON status', () => {
    const input = '[THINK_MODE:off] 正文开始\n<|tool_calls_section_begin|>tool call<|tool_calls_section_end|>\n{"status":"completed"}\n继续正文';
    const result = normalizeAssistantTranscriptContent(input);
    expect(result).toContain('正文开始');
    expect(result).toContain('继续正文');
    expect(result).not.toContain('THINK_MODE');
    expect(result).not.toContain('tool_calls_section');
    expect(result).not.toContain('"status"');
  });

  it('cleans waiting_user_reply and raw render_blocks', () => {
    const input = '```render_blocks\n{"blocks":[]}\n```\nwaiting_user_reply\n最终正文';
    const result = normalizeAssistantTranscriptContent(input);
    expect(result).toContain('最终正文');
    expect(result).not.toContain('render_blocks');
    expect(result).not.toContain('waiting_user_reply');
  });

  it('passes clean content through unchanged', () => {
    const input = '这是正常的用户可见正文。\n\n包含多段内容。';
    expect(normalizeAssistantTranscriptContent(input)).toBe(input.trim());
  });

  it('strips [To="tool"] blocks plus JSON status in mixed text', () => {
    const input = '说明 [To="tool"] {"arg":1} 完毕 {"status":"done"} 结束';
    const result = normalizeAssistantTranscriptContent(input);
    expect(result).toContain('说明');
    expect(result).toContain('完毕');
    expect(result).toContain('结束');
    expect(result).not.toContain('[To="tool"]');
    expect(result).not.toContain('"status"');
  });
});
