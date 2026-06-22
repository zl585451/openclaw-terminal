// 纯辅助函数：从 MessageList.tsx 拆出，行为逐字不变
import type { ChatMessage, TurnSegmentLite } from './chatTypes';
import type { ActivityEntry } from '../../hooks/useMessages';
import type { TurnUiPhase } from '../../core/turnUiState';

export function buildFinalizedTimeline(
  msg: ChatMessage,
  cotContent: string | null | undefined,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  if (cotContent) {
    entries.push({
      id: `final_cot_${msg.id}`,
      type: 'cot',
      timestamp: Number(msg.timestamp || 0),
      content: cotContent,
    });
  }

  if (msg.toolEvents && msg.toolEvents.length > 0) {
    for (const event of msg.toolEvents) {
      entries.push({
        id: `final_tc_${event.callId}`,
        type: 'tool_call',
        timestamp: event.startedAt || Number(msg.timestamp || 0),
        toolName: event.tool,
        callId: event.callId,
        argsPreview: event.args
          ? Object.entries(event.args)
              .map(([key, value]) =>
                `${key}: ${typeof value === 'string' ? value.slice(0, 60) : JSON.stringify(value).slice(0, 60)}`
              )
              .join(', ')
              .slice(0, 120)
          : '',
      });
      entries.push({
        id: `final_tr_${event.callId}`,
        type: 'tool_result',
        timestamp: (event.startedAt || 0) + (event.elapsedMs || 0),
        toolName: event.tool,
        callId: event.callId,
        elapsedMs: event.elapsedMs,
        isError: event.state === 'error',
        resultPreview: event.resultPreview,
      });
    }
  }

  return entries;
}

export function getTurnUiBadgeLabel(phase: TurnUiPhase): string | null {
  switch (phase) {
    case 'submitted':
    case 'thinking':
      return '思考中';
    case 'tool_running':
      return '调用工具中';
    case 'waiting_continuation':
    case 'finalizing':
      return '整理中';
    case 'answering':
      return '输出中';
    case 'awaiting_user':
      return '等你回复';
    case 'error':
      return '出错';
    case 'cancelled':
      return '已取消';
    default:
      return null;
  }
}

export function isTurnUiActivityStreaming(phase: TurnUiPhase): boolean {
  return (
    phase === 'submitted' ||
    phase === 'thinking' ||
    phase === 'tool_running' ||
    phase === 'waiting_continuation' ||
    phase === 'answering' ||
    phase === 'finalizing'
  );
}

export function isTurnUiThinking(phase: TurnUiPhase): boolean {
  return phase === 'submitted' || phase === 'thinking';
}

export const CHAT_MERMAID_RENDER_LIMIT = 1;
export const MAX_BOTTOM_SPACER_VIEWPORT_RATIO = 0.6;

export function limitChatMermaidBlocks(text: string, maxBlocks = CHAT_MERMAID_RENDER_LIMIT): string {
  if (!text || typeof text !== 'string') return text;

  const matches = [...text.matchAll(/```mermaid\s*[\r\n]+[\s\S]*?```/gi)];
  if (matches.length <= maxBlocks) return text;

  let result = '';
  let lastIndex = 0;
  let kept = 0;
  let omitted = 0;

  for (const match of matches) {
    const index = match.index ?? 0;
    const block = match[0];
    result += text.slice(lastIndex, index);

    if (kept < maxBlocks) {
      result += block;
      kept += 1;
    } else {
      omitted += 1;
      if (omitted === 1) {
        result += '\n\n> 已省略额外 Mermaid 图，请在 Canvas 中查看完整图集。\n\n';
      }
    }

    lastIndex = index + block.length;
  }

  result += text.slice(lastIndex);
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

export const UI_CTRL_PATTERNS = [/\[上一页\]/, /\[下一页\]/, /\[第\d+\/\d+页\]/, /\[确认导入\]/, /\[取消\]/];

/** 剥离 [RENDER:xxx] 和 [pills]...[/pills] 块（后者已在托盘显示）；isLastAI 时额外清掉 ■ 开头的选项行 */
export function stripRenderAndPillsMarkers(text: string, isLastAI?: boolean): string {
  if (!text || typeof text !== 'string') return text;
  let result = text
    .replace(/\[RENDER:[^\]]+\]/gi, '')
    .replace(/\[pills\][\s\S]*?\[\/pills\]/gi, '');
  if (isLastAI) {
    result = result
      .replace(/^[■●◆○◉▪▸]\s*.+$/gm, '')
      .replace(/\n{3,}/g, '\n\n');
  }
  return result.trim();
}

export function filterExpectedEffect(text: string, isLastAI?: boolean): string {
  if (!text || typeof text !== 'string') return text;
  const stripped = stripRenderAndPillsMarkers(text, isLastAI);
  return stripped
    .split('\n')
    .filter((line) => {
      if (line.includes('预期效果')) return false;
      return !UI_CTRL_PATTERNS.some((p) => p.test(line.trim()));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** B3 工具组：按组内工具类型计数，生成一行中文摘要标题。 */
export function buildToolGroupSummary(
  segs: TurnSegmentLite[],
  getToolDisplayName: (tool: string) => string,
): string {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const s of segs) {
    const name = s.meta?.tool || 'tool';
    if (!counts.has(name)) order.push(name);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const phrase = (name: string, n: number): string => {
    switch (name) {
      case 'time_inject': return '确认时间';
      case 'exec_command': return `执行 ${n} 条命令`;
      case 'read_file': return `读取 ${n} 个文件`;
      case 'web_search': return `搜索 ${n} 次`;
      case 'parallel_web_research': return '并行调研';
      case 'web_fetch': return `抓取 ${n} 个页面`;
      default: return `${getToolDisplayName(name)} ${n} 次`;
    }
  };
  return order.map((name) => phrase(name, counts.get(name) || 1)).join(' · ');
}
