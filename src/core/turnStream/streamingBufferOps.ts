import type { ChatMessage, ToolEventItem } from '../../ui/chat/chatTypes';

// ── Util helpers ──────────────────────────────────────────────────────────────
function isSystemCommand(text: string): boolean {
  const t = (text || '').trim();
  return /^\/\w/.test(t);
}

export function shouldSuppressAssistantTextForClarify(pendingClarifyOpen: boolean, doneText: string): boolean {
  return pendingClarifyOpen && !String(doneText || '').trim();
}

// 段协议内部重置：新正文段接管显示时清空最后一个流式 assistant 气泡正文。
// 仍保留气泡本身、工具卡片和段快照，避免上一轮正文与最终答案在同一气泡里累加重复。
export function clearStreamingBubbleContent<T extends { role: string; isStreaming?: boolean; content?: string }>(
  messages: T[],
): T[] {
  const last = messages[messages.length - 1];
  if (last?.role === 'assistant' && last.isStreaming) {
    return messages.map((m, i) =>
      i === messages.length - 1 ? { ...m, content: '' } : m,
    );
  }
  return messages;
}

export function markExecutingToolEventsStopped(events: ToolEventItem[] | undefined, now = Date.now()): ToolEventItem[] | undefined {
  if (!events?.length) return events;
  let changed = false;
  const stopped = events.map((event) => {
    if (event.state !== 'executing') return event;
    changed = true;
    const elapsedMs = event.elapsedMs ?? Math.max(0, now - event.startedAt);
    return {
      ...event,
      state: 'error' as const,
      error: event.error || '任务已停止',
      resultPreview: event.resultPreview || '已停止当前任务。',
      elapsedMs,
    };
  });
  return changed ? stopped : events;
}

function normalizedAssistantText(text: unknown): string {
  return String(text ?? '').trim().replace(/\s+/g, ' ');
}

export function collapseAdjacentDuplicateAssistantMessages<T extends {
  role: string;
  content?: string;
  isStreaming?: boolean;
}>(messages: T[]): T[] {
  let changed = false;
  const collapsed: T[] = [];
  for (const message of messages) {
    const previous = collapsed[collapsed.length - 1];
    if (
      message.role === 'assistant'
      && previous?.role === 'assistant'
      && !message.isStreaming
      && !previous.isStreaming
      && normalizedAssistantText(message.content)
      && normalizedAssistantText(message.content) === normalizedAssistantText(previous.content)
    ) {
      changed = true;
      continue;
    }
    collapsed.push(message);
  }
  return changed ? collapsed : messages;
}

export function finalizeStreamingAssistantBubble<T extends {
  role: string;
  content?: string;
  isStreaming?: boolean;
  isStreamingRaw?: boolean;
}>(messages: T[], finalContent: string): T[] {
  const last = messages[messages.length - 1];
  if (!(last?.role === 'assistant' && last.isStreaming)) return messages;

  const finalText = String(finalContent || last.content || '');
  const previous = messages[messages.length - 2];
  if (
    finalText.trim()
    && previous?.role === 'assistant'
    && !previous.isStreaming
    && normalizedAssistantText(previous.content) === normalizedAssistantText(finalText)
  ) {
    return messages.slice(0, -1);
  }

  return messages.map((msg, idx) =>
    idx === messages.length - 1
      ? { ...msg, content: finalText || msg.content, isStreaming: false, isStreamingRaw: false }
      : msg,
  );
}

export function finalizeStoppedAssistantMessage<T extends {
  role: string;
  content?: string;
  isStreaming?: boolean;
  isStreamingRaw?: boolean;
  toolEvents?: ToolEventItem[];
  turnSegments?: ChatMessage['turnSegments'];
}>(messages: T[], now = Date.now()): T[] {
  const last = messages[messages.length - 1];
  const hasExecutingTool = !!last?.toolEvents?.some((event) => event.state === 'executing');
  const hasOpenSegment = !!last?.turnSegments?.some((segment) => segment.open);
  if (!(last?.role === 'assistant' && (last.isStreaming || hasExecutingTool || hasOpenSegment))) return messages;

  const content = typeof last.content === 'string' && last.content.trim()
    ? last.content
    : '已停止当前任务。';
  const toolEvents = markExecutingToolEventsStopped(last.toolEvents, now);
  const turnSegments = last.turnSegments?.some((segment) => segment.open)
    ? last.turnSegments.map((segment) => (segment.open ? { ...segment, open: false } : segment))
    : last.turnSegments;

  return messages.map((msg, idx) =>
    idx === messages.length - 1
      ? { ...msg, content, isStreaming: false, isStreamingRaw: false, toolEvents, turnSegments }
      : msg,
  );
}

export { isSystemCommand };
