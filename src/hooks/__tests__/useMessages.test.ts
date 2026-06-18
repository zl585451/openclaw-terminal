import { describe, expect, it } from 'vitest';
import {
  clearStreamingBubbleContent,
  finalizeStoppedAssistantMessage,
  markExecutingToolEventsStopped,
  preferDoneTextWhenMoreComplete,
  shouldSuppressAssistantTextForClarify,
} from '../useMessages';
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

describe('shouldSuppressAssistantTextForClarify', () => {
  it('suppresses residual streamed text when clarify card already opened and done text is empty', () => {
    expect(shouldSuppressAssistantTextForClarify(true, '')).toBe(true);
  });

  it('does not suppress when clarify was not opened', () => {
    expect(shouldSuppressAssistantTextForClarify(false, '')).toBe(false);
  });

  it('does not suppress when a visible done text exists', () => {
    expect(shouldSuppressAssistantTextForClarify(true, '最终正文')).toBe(false);
  });
});

describe('clearStreamingBubbleContent', () => {
  it('clears the last streaming assistant bubble content but keeps the bubble and tool cards', () => {
    const input = [
      { role: 'user', content: '帮我调研一下' },
      { role: 'assistant', content: '上一轮残留的初稿正文', isStreaming: true, toolEvents: [{ tool: 'web_search' }] },
    ];
    const out = clearStreamingBubbleContent(input as any) as any[];
    expect(out[1].content).toBe('');
    expect(out[1].isStreaming).toBe(true);
    expect(out[1].toolEvents).toEqual([{ tool: 'web_search' }]);
    expect(out[0]).toBe(input[0]); // 其他消息引用不变
  });

  it('does nothing when the last message is not a streaming assistant bubble', () => {
    const input = [
      { role: 'assistant', content: '已完成的回复', isStreaming: false },
    ];
    const out = clearStreamingBubbleContent(input as any);
    expect(out).toBe(input);
  });
});

describe('markExecutingToolEventsStopped', () => {
  it('turns orphaned executing tool events into a stopped terminal state', () => {
    const out = markExecutingToolEventsStopped([
      {
        callId: 'call_1',
        tool: 'web_search',
        state: 'executing',
        args: { query: 'brave search api' },
        startedAt: 1_000,
      },
      {
        callId: 'call_2',
        tool: 'web_search',
        state: 'done',
        startedAt: 1_500,
        resultPreview: 'ok',
      },
    ], 2_250);

    expect(out?.[0]).toMatchObject({
      callId: 'call_1',
      state: 'error',
      error: '任务已停止',
      resultPreview: '已停止当前任务。',
      elapsedMs: 1_250,
    });
    expect(out?.[1]).toMatchObject({ callId: 'call_2', state: 'done', resultPreview: 'ok' });
  });
});

describe('finalizeStoppedAssistantMessage', () => {
  it('stops streaming and closes inline tool segments on cancel', () => {
    const input = [
      { role: 'user', content: '查一下 brave' },
      {
        role: 'assistant',
        content: '',
        isStreaming: true,
        isStreamingRaw: true,
        toolEvents: [{
          callId: 'call_1',
          tool: 'web_search',
          state: 'executing' as const,
          startedAt: 1_000,
        }],
        turnSegments: [{
          segId: 'seg_tool_1',
          index: 0,
          type: 'tool_use' as const,
          content: '',
          open: true,
          meta: { tool: 'web_search', callId: 'call_1' },
        }],
      },
    ];

    const out = finalizeStoppedAssistantMessage(input, 1_500) as any[];
    expect(out[1].content).toBe('已停止当前任务。');
    expect(out[1].isStreaming).toBe(false);
    expect(out[1].isStreamingRaw).toBe(false);
    expect(out[1].toolEvents[0].state).toBe('error');
    expect(out[1].turnSegments[0].open).toBe(false);
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
