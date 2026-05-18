import { describe, expect, it } from 'vitest';
import { preferDoneTextWhenMoreComplete } from '../useMessages';
import {
  appendToolCallToStreamingMessage,
  applyStreamingFinalizeFallback,
  applyToolResultToMessage,
  ensureStreamingAssistantMessageState,
  parseSystemReplyStatus,
  reconcileChatDoneMessages,
} from '../useMessages.helpers';

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

describe('useMessages helpers', () => {
  it('appends a streaming assistant shell only when visible content exists', () => {
    const next = ensureStreamingAssistantMessageState([], 7, 123, '这里是正文');
    expect(next).toEqual([
      {
        id: 7,
        role: 'assistant',
        content: '这里是正文',
        isStreaming: true,
        timestamp: 123,
      },
    ]);
    expect(ensureStreamingAssistantMessageState([], 8, 456, '')).toEqual([]);
  });

  it('finalize fallback removes empty streaming placeholder', () => {
    const prev = [
      { id: 1, role: 'user', content: 'hi', timestamp: 1 },
      { id: 2, role: 'assistant', content: '', isStreaming: true, isStreamingRaw: true, timestamp: 2 },
    ] as const;
    expect(applyStreamingFinalizeFallback([...prev], '')).toEqual([prev[0]]);
  });

  it('syncs tool call and result into the inline message card', () => {
    const afterCall = appendToolCallToStreamingMessage([
      { id: 1, role: 'assistant', content: 'streaming', isStreaming: true, timestamp: 1 },
    ], {
      type: 'tool_call',
      callId: 'call-1',
      tool: 'read_file',
      args: { path: '/tmp/a' },
    }, 99);
    expect(afterCall[0].toolEvents).toEqual([
      {
        callId: 'call-1',
        tool: 'read_file',
        args: { path: '/tmp/a' },
        state: 'executing',
        startedAt: 99,
      },
    ]);

    const afterResult = applyToolResultToMessage(afterCall, {
      type: 'tool_result',
      callId: 'call-1',
      tool: 'read_file',
      state: 'done',
      resultPreview: 'ok',
      elapsedMs: 32,
    });
    expect(afterResult[0].toolEvents?.[0]).toMatchObject({
      callId: 'call-1',
      state: 'done',
      resultPreview: 'ok',
      elapsedMs: 32,
    });
  });

  it('deduplicates completed assistant text on chat done', () => {
    const next = reconcileChatDoneMessages([
      { id: 1, role: 'assistant', content: '最终答案', isStreaming: false, timestamp: 1 },
    ], {
      finalStreamContent: '最终答案',
      systemReply: false,
      nextMessageId: 2,
      timestamp: 2,
    });
    expect(next).toHaveLength(1);
    expect(next[0].content).toBe('最终答案');
  });

  it('parses lobster status system replies into structured fields', () => {
    const parsed = parseSystemReplyStatus(
      '🦞 Model: qwen3-max\nTokens: 14.8k / 200k\nContext: 12.0 / 128k (9%)\nRuntime: direct\nThink: high\nCompactions: 2\nQueue: idle\napi-key (models.json)',
    );
    expect(parsed).toMatchObject({
      modelName: 'qwen3-max',
      tokenIn: 14800,
      ctxUsed: 12000,
      ctxMax: 128000,
      runtimeMode: 'direct',
      thinkMode: 'high',
      compactions: 2,
      queueInfo: 'idle',
      apiKeyInfo: 'api-key (models.json)',
    });
  });
});
