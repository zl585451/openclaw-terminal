import { describe, expect, it } from 'vitest';
import {
  clearStreamingBubbleContent,
  collapseAdjacentDuplicateAssistantMessages,
  finalizeStreamingAssistantBubble,
  finalizeStoppedAssistantMessage,
  markExecutingToolEventsStopped,
  shouldSuppressAssistantTextForClarify,
} from '../useMessages';
import { normalizeAssistantTranscriptContent } from '../../utils/cotExtract';

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

  it('场景5: 工具调用前的 preamble 在最终答案段接管时被清空，气泡保留待填充', () => {
    // useTurnSegmentRouter 在新 text/final 段开启且已有 preamble 时调用本原语，
    // 清掉气泡里的 preamble 残留，避免它与最终答案重复展示。
    const input = [
      { role: 'user', content: '帮我查一下' },
      { role: 'assistant', content: '好的，我先搜索一下相关资料……', isStreaming: true, toolEvents: [{ tool: 'web_search' }] },
    ];
    const out = clearStreamingBubbleContent(input as any) as any[];
    expect(out[1].content).toBe(''); // preamble 已清空，等最终答案填充
    expect(out[1].isStreaming).toBe(true); // 气泡仍在，不新建第二个
    expect(out[1].toolEvents).toEqual([{ tool: 'web_search' }]); // 工具卡保留
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

describe('finalizeStreamingAssistantBubble', () => {
  it('removes a streaming assistant tail when it duplicates the previous final assistant', () => {
    const input = [
      { role: 'assistant', content: '最终调研结论\n\n- A', isStreaming: false },
      { role: 'assistant', content: '', isStreaming: true, isStreamingRaw: true },
    ];

    const out = finalizeStreamingAssistantBubble(input, '最终调研结论\n\n- A') as any[];

    expect(out).toHaveLength(1);
    expect(out[0].content).toBe('最终调研结论\n\n- A');
  });

  it('finalizes the streaming assistant tail when content is not a duplicate', () => {
    const input = [
      { role: 'user', content: '帮我调研' },
      { role: 'assistant', content: '', isStreaming: true, isStreamingRaw: true },
    ];

    const out = finalizeStreamingAssistantBubble(input, '新的调研结论') as any[];

    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({
      role: 'assistant',
      content: '新的调研结论',
      isStreaming: false,
      isStreamingRaw: false,
    });
  });

  it('is a no-op (same reference) when the last message is not a streaming assistant', () => {
    const input = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '已定稿', isStreaming: false },
    ];
    // 返回同一引用很关键：避免 setMessages 触发无谓重渲染
    expect(finalizeStreamingAssistantBubble(input, '任意')).toBe(input);
  });

  it('falls back to the existing bubble content when finalContent is empty', () => {
    const input = [
      { role: 'assistant', content: '流式已收到的正文', isStreaming: true, isStreamingRaw: true },
    ];
    const out = finalizeStreamingAssistantBubble(input, '') as any[];
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ content: '流式已收到的正文', isStreaming: false });
  });

  it('does NOT dedup against a previous bubble that is still streaming', () => {
    // 上一条仍在流式时不能当作"已完成的重复"，否则会误删当前定稿
    const input = [
      { role: 'assistant', content: '结论 A', isStreaming: true },
      { role: 'assistant', content: '', isStreaming: true, isStreamingRaw: true },
    ];
    const out = finalizeStreamingAssistantBubble(input, '结论 A') as any[];
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ content: '结论 A', isStreaming: false });
  });
});

describe('collapseAdjacentDuplicateAssistantMessages', () => {
  it('collapses adjacent finalized assistant messages with identical visible text', () => {
    const input = [
      { role: 'user', content: '帮我调研' },
      { role: 'assistant', content: '结论 A', isStreaming: false },
      { role: 'assistant', content: '  结论 A  ', isStreaming: false },
      { role: 'user', content: '继续' },
      { role: 'assistant', content: '结论 A', isStreaming: false },
    ];

    const out = collapseAdjacentDuplicateAssistantMessages(input) as any[];

    expect(out.map((item) => item.content)).toEqual(['帮我调研', '结论 A', '继续', '结论 A']);
  });

  it('does not collapse streaming assistant messages', () => {
    const input = [
      { role: 'assistant', content: '结论 A', isStreaming: false },
      { role: 'assistant', content: '结论 A', isStreaming: true },
    ];

    expect(collapseAdjacentDuplicateAssistantMessages(input)).toBe(input);
  });

  it('does not collapse two empty assistant messages (empty text guard)', () => {
    // 空内容不应被当作"重复"折叠——否则会吞掉合法的空气泡占位
    const input = [
      { role: 'assistant', content: '', isStreaming: false },
      { role: 'assistant', content: '   ', isStreaming: false },
    ];
    expect(collapseAdjacentDuplicateAssistantMessages(input)).toBe(input);
  });

  it('does not collapse identical assistants separated by a user message', () => {
    // 仅折叠"相邻"重复；被用户消息隔开的相同回复是两轮合法回答
    const input = [
      { role: 'assistant', content: '结论 A', isStreaming: false },
      { role: 'user', content: '再说一次' },
      { role: 'assistant', content: '结论 A', isStreaming: false },
    ];
    expect(collapseAdjacentDuplicateAssistantMessages(input)).toBe(input);
  });

  it('returns the same reference when there is nothing to collapse', () => {
    const input = [
      { role: 'assistant', content: '结论 A', isStreaming: false },
      { role: 'assistant', content: '结论 B', isStreaming: false },
    ];
    expect(collapseAdjacentDuplicateAssistantMessages(input)).toBe(input);
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
