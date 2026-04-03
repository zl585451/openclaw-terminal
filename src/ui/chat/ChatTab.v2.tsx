import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
// xterm 已完全移除以修复闪退问题
import '../../styles/ChatTab.css';
import '../../components/ResponseTray.css';
import { useTypewriter } from '../../hooks/useTypewriter';
import { useGateway } from '../../hooks/useGateway';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useFileAttachment } from '../../hooks/useFileAttachment';
import { useTimers } from '../../hooks/useTimers';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useScrollManager } from '../../hooks/useScrollManager';
import { ContextMenu } from '../../components/ContextMenu';
import TaskBoard from '../../components/TaskBoard';
import SettingsPanel from '../../components/SettingsPanel';
import HeartbeatWave from '../../components/HeartbeatWave';
import SetupGuide from '../../components/SetupGuide';
import LogPanel from '../../components/LogPanel';
import { TurnFSM, deriveLegacyFlags, TurnPhase } from '../../core/turnFSM';
import { StreamRouter, StreamState } from '../../core/streamRouter';
import { BlockIngest } from '../../core/blockIngest';
import { useSettings } from '../../contexts/SettingsContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useCanvas } from '../../contexts/CanvasContext';
import { checkPermission, getDangerMatch } from '../../utils/permissionCheck';
import CanvasPanel from '../../components/CanvasPanel';
// playClickSound, resetSoundCounter 已迁移到 useTypewriter hook
import { stripThinkModeMarker } from '../../utils/socraticTemplates';
import { clearProcessedMarkdownCache } from '../../utils/markdownPreprocess';
import { createMarkdownComponents } from './markdownComponents';
import ChatInputArea from './ChatInput';
import { ChatMessageList } from './MessageList';

/** ChatTab.v2：打字机逻辑已迁移到 useTypewriter hook */
// const OCT_V2_DISABLE_TYPEWRITER = false; // 已不再需要

function recoverOctStreamFromEndFailure(oct: { stream: StreamRouter; fsm: TurnFSM }): void {
  try {
    oct.stream.abortToIdle();
  } catch {
    /* ignore */
  }
  try {
    if (oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
      oct.fsm.onToken();
    }
    if (oct.fsm.getPhase() === TurnPhase.STREAMING) {
      oct.fsm.onStreamEnd();
      oct.fsm.onRenderDone();
    }
    oct.fsm.onTurnFinish();
  } catch (e) {
    console.warn('[ChatTab.v2] recoverOctStreamFromEndFailure', e);
  }
}

const ipcRenderer =
  typeof window !== 'undefined' && typeof (window as any).require === 'function'
    ? (window as any).require('electron').ipcRenderer
    : {
        invoke: () => Promise.resolve(null),
        on: () => {},
        off: () => {},
        removeListener: () => {},
      };
// 日志路径main 进程根据平台提供，前端仅env 未设置时传空
// 已改DOM 渲染，此函数保留供参// function getLogAnsiColor(line: string): string {
//   if (line.startsWith('[ERR]') || /\[ERROR\]/i.test(line)) return '\x1b[38;2;255;68;68m';
//   if (/\[WARN\]/i.test(line)) return '\x1b[38;2;255;170;0m';
//   if (/\[LOG\]/i.test(line)) return '\x1b[38;2;0;204;204m';
//   return '\x1b[32m';
// }

// const LOG_NOISE_PATTERNS = [
//   'typing indicator',
//   'sending 1 card chunks',
//   'sending 2 card chunks',
//   'sending 3 card chunks',
//   'dispatch complete',
//   'card chunks',
// ];

// formatTime / formatFullTime 已迁移到 MessageList.tsx

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  /** 流式阶段仅累积原始文本并用 <pre> 展示，避免每批 token 触发 Markdown 全量解析 */
  isStreamingRaw?: boolean;
  timestamp: string | number;
  imageDataUrl?: string;
  isSystemReply?: boolean;
  files?: UploadedFile[];
}

export interface UploadedFile {
  name: string;
  size: number;
  ext: string;
  mimeType: string;
  isText: boolean;
  content: string | null;
  base64?: string;
  /** 文件绝对路径，AMY 可用 read_file 读取；无 path 时（如拖入的非本地文件）不可用 */
  path?: string;
}


/** 判断是否Gateway 直接处理的系统命令（不等AMY 回复*/
function isSystemCommand(text: string): boolean {
  const t = (text || '').trim();
  return /^\/(status|restart|stop|new|think\s+\w+|model|provider|memory|help)\b/.test(t);
}

// MsgCopyButton / TypewriterCursor / FinalizedMarkdownContent / SystemMessage
// MessageMeta / MessageHeader / UserMessageBody / AssistantMessageBody
// MessageRow / ChatMessageItem / ChatMessageItemProps
// 已全部迁移到 src/ui/chat/MessageList.tsx





function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n{2,}/g, ' ')
    .trim();
}

interface ChatTabProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  getNextMessageId: () => number;
  onStatusChange?: (wsConnected: boolean, isStreaming: boolean, modelName?: string, tokenIn?: number | null, tokenOut?: number | null, ctxUsed?: number | null, ctxMax?: number | null) => void;
}


// ── STREAK 工具函数 ──────────────────────────────────────────────────────
function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getStreakData(): { streak: number; lastActiveDate: string } {
  try {
    const raw = localStorage.getItem('oct_streak');
    if (raw) return JSON.parse(raw) as { streak: number; lastActiveDate: string };
  } catch {}
  return { streak: 0, lastActiveDate: '' };
}

function touchStreak(): number {
  const today = getTodayStr();
  const data = getStreakData();
  if (data.lastActiveDate === today) return data.streak;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newStreak = data.lastActiveDate === yesterday ? data.streak + 1 : 1;
  try {
    localStorage.setItem('oct_streak', JSON.stringify({ streak: newStreak, lastActiveDate: today }));
  } catch {}
  return newStreak;
}
// ────────────────────────────────────────────────────────────────────────

const ChatTab: React.FC<ChatTabProps> = ({ messages, setMessages, getNextMessageId, onStatusChange }) => {
  const { settings, setSettings, streamSpeedMs } = useSettings();
  const { permissions } = usePermissions();
  const canvas = useCanvas();

  const mdComponents = useMemo(
    () => createMarkdownComponents(canvas.openCanvas),
    [canvas.openCanvas]
  );

  const octRuntimeRef = useRef<{ fsm: TurnFSM; stream: StreamRouter; ingest: BlockIngest } | null>(null);
  if (!octRuntimeRef.current) {
    const fsm = new TurnFSM();
    octRuntimeRef.current = { fsm, stream: new StreamRouter(fsm), ingest: new BlockIngest() };
  }
  const oct = octRuntimeRef.current;

  const typewriter = useTypewriter({
    baseDelayMs: streamSpeedMs,
    typingSound: settings.typingSound,
    onFinished: (finalText) => {
      // 已禁用消息内容日志输出
      // console.log('[MSG-FINALIZE] finalText length:', finalText?.length, 'preview:', finalText?.slice(0, 200));
      const finalRaw = stripThinkModeMarker(finalText || '');
      try { oct.fsm.onTurnFinish(); } catch (e) { console.warn('[ChatTab.v2] fsm.onTurnFinish', e); }
      oct.ingest.reset();
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.isStreaming) {
          return prev.map((msg, i) =>
            i === prev.length - 1
              ? { ...msg, content: finalRaw || msg.content, isStreaming: false, isStreamingRaw: false }
              : msg
          );
        }
        return prev;
      });
    },
  });

  const gateway = useGateway();

  const files = useFileAttachment();
  const timers = useTimers();
  const { windowFocused } = timers;
  const ctxMenu = useContextMenu();

  const getToolDisplayName = (tool: string): string => {
    const map: Record<string, string> = {
      'read_file': '📖 读取文件',
      'write_file': '✏️ 写入文件',
      'list_files': '📂 列出文件',
      'run_bash': '💻 执行命令',
      'str_replace_editor': '🔧 编辑文件',
      'create_folder': '📁 创建文件夹',
      'move_file': '🔄 移动文件',
      'search_files': '🔍 搜索文件',
    };
    return map[tool] || tool;
  };

  const ws = useWebSocket({
    onChatDelta: (content, isDelta) => {
      // 保留现有的 delta 处理逻辑
      if (!content) return;
      
      setAwaitingResponse(false);
      if (isDelta) {
        setAgentPhase('typing');
      }

      const pendingSysDelta = pendingSystemReplyMap.current.get(lastSentRequestId.current) ?? false;
      if (pendingSysDelta) {
        if (isDelta) {
          streamingMessageRef.current += content;
          fullTextRef.current += content;
        } else {
          streamingMessageRef.current = content;
          fullTextRef.current = content;
        }
        typewriter.feed(fullTextRef.current);
        scheduleFullTextSync();
      } else {
        // 全文立即追加到 ref（不触发渲染）
        if (isDelta) {
          streamingMessageRef.current += content;
        } else {
          streamingMessageRef.current = content;
        }
        fullTextRef.current = streamingMessageRef.current;

        // FSM 状态推进
        if (isDelta && oct.fsm.getPhase() === TurnPhase.STREAM_OPEN) {
          try { oct.fsm.onToken(); } catch {}
        }

        typewriter.feed(fullTextRef.current);
        scheduleFullTextSync();
      }

      // 更新消息状态
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          // 累积到现有流式消息
          const newContent = (last.content || '') + content;
          return prev.map((msg, idx) =>
            idx === prev.length - 1
              ? { ...msg, content: newContent }
              : msg
          );
        } else {
          // 创建新的流式消息
          return [
            ...prev,
            {
              id: getNextMessageId(),
              role: 'assistant' as const,
              content,
              isStreaming: true,
              timestamp: Date.now(),
            },
          ];
        }
      });
    },
    onChatDone: (content) => {
      // 保留现有的 done 处理逻辑
      setAwaitingResponse(false);
      setAgentPhase('idle');
      // AI 最终回复完成时清空所有工具卡片
      setActiveTools([]);
      const currentRequestId = lastSentRequestId.current;
      const systemReply = pendingSystemReplyMap.current.get(currentRequestId) ?? false;
      pendingSystemReplyMap.current.delete(currentRequestId);

      // OCT v2：普通对话走 StreamRouter.end()，收尾在 COMPLETED + typewriter.finish → onTurnFinish
      if (!systemReply) {
        try {
          oct.stream.end();
        } catch {
          recoverOctStreamFromEndFailure(oct);
          typewriter.finish();
          const fb = String(content || '').trim();
          if (fb) {
            streamingMessageRef.current = fb;
            fullTextRef.current = fb;
            typewriter.feed(fullTextRef.current);
            scheduleFullTextSync();
          }
        }
        return;
      }

      let finalStreamContent = streamingMessageRef.current || content;
      if (finalStreamContent) {
        streamingMessageRef.current = finalStreamContent;
        fullTextRef.current = finalStreamContent;
        typewriter.feed(fullTextRef.current);
        typewriter.finish(); // 结束 typewriter 状态，避免影响后续普通消息
        scheduleFullTextSync();
      }

      // 解析 /status 系统回复，更新状态栏
      const isSystem = systemReply;
      const text = finalStreamContent;
      if (isSystem && text.startsWith('🦞')) {
        const modelMatch = text.match(/Model:\s*(.+)/);
        const tokensMatch = text.match(/Tokens:\s*([\d.]+)k?\s*\/\s*([\d.]+)k/i);
        const ctxMatch1 = text.match(/Context:\s*([\d.]+)\s*\/\s*([\d.]+)k\s*\((\d+)%\)/i);
        const ctxMatch2 = text.match(/Context:\s*([\d.]+)k\s*tokens/i);

        if (modelMatch) setModelName(modelMatch[1].trim());
        if (tokensMatch) {
          setTokenIn(parseFloat(tokensMatch[1]) * 1000);
          setCtxMax(parseFloat(tokensMatch[2]) * 1000);
        }
        if (ctxMatch1) {
          setCtxUsed(parseFloat(ctxMatch1[1]) * 1000);
          setCtxMax(parseFloat(ctxMatch1[2]) * 1000);
        } else if (ctxMatch2) {
          setCtxUsed(parseFloat(ctxMatch2[1]) * 1000);
        }

        const apiKeyMatch = text.match(/api-key\s*\(([^)]+)\)/i);
        const thinkMatch = text.match(/(?:Reasoning|Think):\s*(\S+)/i);
        const runtimeMatch = text.match(/Runtime:\s*(\S+)/i);
        const compactMatch = text.match(/Compactions:\s*(\d+)/i);
        const queueMatch = text.match(/Queue:\s*(.+)/i);

        if (apiKeyMatch) setApiKeyInfo(`api-key (${apiKeyMatch[1]})`);
        if (thinkMatch) setThinkMode(thinkMatch[1]);
        if (runtimeMatch) setRuntimeMode(runtimeMatch[1]);
        if (compactMatch) setCompactions(parseInt(compactMatch[1]));
        if (queueMatch) setQueueInfo(queueMatch[1].trim());
      }

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          // 关闭 isStreaming 并更新 content，停止使用流式 displayedText 切片渲染
          return prev.map((msg, idx) =>
            idx === prev.length - 1
              ? { ...msg, content: finalStreamContent, isStreaming: false }
              : msg
          );
        }
        if (finalStreamContent) {
          const textContent = finalStreamContent.trim();
          if (!textContent) return prev;
          if (last?.role === 'assistant' && !last.isStreaming && last.content?.trim() === textContent) {
            return prev;
          }
          return [
            ...prev,
            {
              id: getNextMessageId(),
              role: 'assistant' as const,
              content: textContent,
              isStreaming: true,
              isSystemReply: systemReply,
              timestamp: Date.now(),
            },
          ];
        }
        return prev;
      });
    },
    onAgentPhase: (phase, elapsed) => {
      setAgentPhase(phase);
      if (phase === 'thinking' && elapsed != null) setThinkingElapsed(elapsed);
      if (phase === 'idle' || phase === 'typing') setThinkingElapsed(0);
    },
    onToolEvent: (payload) => {
      // 处理工具调用事件
      if (payload.type === 'tool_call') {
        setActiveTools((prev) => {
          const next = [
            ...prev,
            {
              callId: payload.callId,
              tool: payload.tool,
              state: 'executing' as const,
            },
          ];
          // 工具卡片首次出现时（prev 为空），显式触发滚动补偿
          // 避免因 isStreaming=true 导致 ResizeObserver reconcile 被跳过，造成页面跳动
          if (prev.length === 0 && next.length > 0) {
            requestAnimationFrame(() => {
              scroll.reconcile();
            });
          }
          return next;
        });
      } else if (payload.type === 'tool_result') {
        const finalState = (payload.state === 'error' ? 'error' : 'done') as 'done' | 'error';
        setActiveTools((prev) =>
          prev.map((t) =>
            t.callId === payload.callId
              ? { ...t, state: finalState, resultPreview: payload.resultPreview }
              : t
          )
        );
      }
    },
    onUsage: (usage, isSnapshot) => {
      // 保留现有的 usage 更新逻辑
      if (usage.inputTokens != null) {
        if (isSnapshot) setTokenIn(usage.inputTokens);
        else setTokenIn((v) => (v ?? 0) + usage.inputTokens);
      }
      if (usage.outputTokens != null) {
        if (isSnapshot) setTokenOut(usage.outputTokens);
        else setTokenOut((v) => (v ?? 0) + usage.outputTokens);
      }
      if (usage.cost != null) {
        if (isSnapshot) setCost(Number(usage.cost));
        else setCost((v) => (v ?? 0) + Number(usage.cost));
      }
      if (usage.ctxUsed != null) setCtxUsed(usage.ctxUsed);
      if (usage.ctxMax != null) setCtxMax(usage.ctxMax);
      if (usage.session != null) setSession(usage.session);
    },
    onModelName: (name) => setModelName(name),
  });

  const [fsmPhase, setFsmPhase] = useState(() => oct.fsm.getPhase());
  const isStreaming = useMemo(() => {
    const lf = deriveLegacyFlags(fsmPhase);
    const last = messages[messages.length - 1];
    return (
      lf.isStreaming ||
      lf.isRendering ||
      (!!last?.isStreaming && last.role === 'assistant')
    );
  }, [fsmPhase, messages]);

  // ===== 所有 useState 集中声明 =====
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // typing scheduler 双状态：fullText（真实流式内容） / displayedText（UI可见）
  // 已迁移到 useTypewriter hook
  const [modelName, setModelName] = useState('--');
  const [heartbeatPulse, setHeartbeatPulse] = useState(false);
  const [tokenIn, setTokenIn] = useState<number | null>(null);
  const [tokenOut, setTokenOut] = useState<number | null>(null);
  const [ctxUsed, setCtxUsed] = useState<number | null>(null);
  const [ctxMax, setCtxMax] = useState<number | null>(null);
  const [, setCost] = useState<number | null>(null);
  const [, setSession] = useState<string | null>(null);
  const [, setApiKeyInfo] = useState<string>('--');
  const [, setThinkMode] = useState<string>('off');
  const [, setRuntimeMode] = useState<string>('direct');
  const [, setCompactions] = useState<number | null>(null);
  const [, setQueueInfo] = useState<string>('--');
  const [, setLogPath] = useState('');
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);
  const [injectInputText, setInjectInputText] = useState<string | null>(null);
  const [agentPhase, setAgentPhase] = useState<'idle' | 'thinking' | 'typing' | 'tool_executing'>('idle');
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  // 工具调用状态
  const [activeTools, setActiveTools] = useState<Array<{
    callId: string;
    tool: string;
    state: 'executing' | 'done' | 'error';
    resultPreview?: string;
  }>>([]);
  const [streak, setStreak] = useState<number>(() => getStreakData().streak);
  const [pendingPills, setPendingPills] = useState<string[] | null>(null);
  // 任务看板显示状态
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const scheduleFullTextSyncRef = useRef<(() => void) | null>(null);
  // ===== 所有 useRef 集中声明 =====
  // xterm 相关 ref 已移除
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingMessageRef = useRef(''); // 仍保留：用于与现有消息 content 合并/落盘，不改 schema
  const streamingDomRef = useRef<HTMLPreElement | null>(null);
  const fullTextRef = useRef<string>('');
  // typingBudgetMsRef, lastTypingTsRef 已迁移到 useTypewriter hook
  const pendingFullTextSyncRafRef = useRef<number | null>(null);
  const pendingSystemReplyMap = useRef<Map<string, boolean>>(new Map());
  const lastSentRequestId = useRef<string>('');
  const streamUiRafRef = useRef<number | null>(null);
  // typewriterStartTsRef, shouldRunTypewriterRef 已迁移到 useTypewriter hook

  const scroll = useScrollManager({
    fsm: oct.fsm,
    isStreaming,
    awaitingResponse,
    messagesLength: messages.length,
  });

  const scheduleFullTextSync = useCallback(() => {
    if (pendingFullTextSyncRafRef.current != null) return;
    pendingFullTextSyncRafRef.current = requestAnimationFrame(() => {
      pendingFullTextSyncRafRef.current = null;
      const buf = fullTextRef.current;
      // 仅同步 message.content（复制/落盘）；可见逐字由 useTypewriter + typewriter.feed 负责
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          // content 保持为完整 fullText 以便复制/最终落盘，但 UI 渲染不直接用它（用 displayedText）
          if (last.content === buf) return prev;
          return prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: buf } : m));
        }
        // 若还没创建 assistant 流式气泡，创建一个（content 先放 fullText）
        if (!buf || !buf.trim()) return prev;
        return [
          ...prev,
          {
            id: getNextMessageId(),
            role: 'assistant' as const,
            content: buf,
            isStreaming: true,
            timestamp: Date.now(),
          },
        ];
      });
    });
  }, [getNextMessageId, setMessages]);

  useLayoutEffect(() => {
    scheduleFullTextSyncRef.current = scheduleFullTextSync;
    // 让外部代码（handleIncomingMessage）可以通过 ref 调用 scroll 的 scheduleScrollAfterLayout
    scroll.scheduleScrollAfterLayoutRef.current = scroll.scheduleScrollAfterLayout;
  });

  useEffect(() => {
    return oct.fsm.subscribe((phase) => {
      setFsmPhase(phase);
    });
  }, [oct.fsm]);

  useEffect(() => {
    const { stream, ingest } = oct;

    // 直接将每次 tokens 事件转化为 setMessages 更新
    // StreamRouter 本身已以 FLUSH_MS=16ms 节流输出，自然提供约 60fps 的增量更新节奏
    const applyRawToMessages = (raw: string) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          if (last.content === raw && last.isStreamingRaw) return prev;
          return prev.map((m, idx) =>
            idx === prev.length - 1 ? { ...m, content: raw, isStreamingRaw: true } : m
          );
        }
        if (!raw.trim()) return prev;
        return [
          ...prev,
          {
            id: getNextMessageId(),
            role: 'assistant' as const,
            content: raw,
            isStreaming: true,
            isStreamingRaw: true,
            timestamp: Date.now(),
          },
        ];
      });
      // 流式期间不调用 reconcile()：AI 内容在用户消息下方自然增长，锚点本身未漂移，
      // 不需要补偿 scrollTop（否则会把视口往上拽，让 AI 内容跑出视窗）
    };

    const unsubscribe = stream.subscribe((event) => {
      if (event.type === 'tokens') {
        ingest.ingest(event.payload.batch);
        const raw = ingest.getAccumulatedRaw();
        streamingMessageRef.current = raw;
        fullTextRef.current = raw;
        // 直接触发 React 状态更新：StreamRouter 已节流（16ms/batch），无需额外批处理
        applyRawToMessages(raw);
        typewriter.feed(raw);
      }
      if (event.type === 'state' && event.payload.state === StreamState.COMPLETED) {
        queueMicrotask(() => {
          typewriter.finish();
          try { stream.close(); } catch (e) { console.warn('[ChatTab.v2] stream.close', e); }
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [oct, getNextMessageId, setMessages]);

  // getNextCharIndex 已迁移到 useTypewriter hook

  // charDelayMs 已迁移到 useTypewriter hook

  // isWordChar 已迁移到 useTypewriter hook

  // computeRangeCostMs 已迁移到 useTypewriter hook

  // pickPreferredNextIndex 已迁移到 useTypewriter hook

  // ===== 所有 useEffect 放在 useState/useRef 之后 =====
  // pendingPills 已停用：pills 现在始终在消息体内渲染，不再需要底部 ResponseTray 重复显示
  useEffect(() => {
    setPendingPills(null);
  }, [messages]);

  // 通知父组件状态变化
  useEffect(() => {
    onStatusChange?.(ws.wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax);
  }, [ws.wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax, onStatusChange]);

  useEffect(() => {
    return () => {
      if (streamUiRafRef.current != null) {
        cancelAnimationFrame(streamUiRafRef.current);
        streamUiRafRef.current = null;
      }
    };
  }, []);





  useEffect(() => {
    if (settings.typingSound === 'off' && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setSpeakingMessageId(null);
    }
  }, [settings.typingSound]);

  useEffect(() => {
    ipcRenderer.invoke('get-env', 'OPENCLAW_LOG_PATH').then((p: string) => {
        if (p) setLogPath(p);
        // 自动启动日志监控
        ipcRenderer.invoke('start-log-watch', p || '');
      });
  }, []);




  const prevStreamingRef = useRef(false);
  const lastAssistantMsgIdRef = useRef(0);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && last.id !== lastAssistantMsgIdRef.current) {
      lastAssistantMsgIdRef.current = last.id;
      setHeartbeatPulse(true);
      const t = setTimeout(() => setHeartbeatPulse(false), 500);
      return () => clearTimeout(t);
    }
  }, [messages]);

  const playTTSForMessage = useCallback(async (msg: ChatMessage) => {
    if (settings.typingSound === 'off' || !msg.content) return;
    const plain = stripMarkdown(msg.content);
    const truncated = plain.length > 200 ? plain.slice(0, 200) + '...详细内容请查看聊天窗口' : plain;
    if (!truncated.trim()) return;
    setSpeakingMessageId(msg.id);
    const result = await ipcRenderer.invoke('tts-speak', { text: truncated });
    if (!result?.success || !result.audioBase64) {
      setSpeakingMessageId(null);
      return;
    }
    const audio = new Audio('data:audio/mp3;base64,' + result.audioBase64);
    audioRef.current = audio;
    audio.onended = () => {
      setSpeakingMessageId(null);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setSpeakingMessageId(null);
      audioRef.current = null;
    };
    audio.play().catch(() => setSpeakingMessageId(null));
  }, [settings.typingSound]);

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.content) {
        if (!windowFocused) {
          const preview = lastMsg.content.slice(0, 30).replace(/\s+/g, ' ') + (lastMsg.content.length > 30 ? '...' : '');
          ipcRenderer.invoke('show-notification', { title: 'AMY 回复', body: preview });
        }
        playTTSForMessage(lastMsg);
      }
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, messages, windowFocused, playTTSForMessage]);

  const sendMessage = useCallback(async (text: string, imageDataUrl: string | null, files?: UploadedFile[]) => {
    if (!text.trim() && !imageDataUrl && !files?.length) return;

    // 构建消息内容：只传文件路径/元数据，不自动填充内容，AMY 用 read_file 按需读取
    let contentToSend = text;
    let fileRefs = '';

    if (files && files.length > 0) {
      fileRefs = '\n\n[附件]' + files.map((f) => {
        const size = f.size < 1024 ? `${f.size}B` : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)}KB` : `${(f.size / (1024 * 1024)).toFixed(1)}MB`;
        if (f.path) return `\n- ${f.name} (${size}): ${f.path}`;
        if (f.isText && f.content) return `\n\`\`\`${f.ext}\n${f.content}\n\`\`\``;
        return `\n- ${f.name} (${size}) [无路径]`;
      }).join('');
    }

    if (imageDataUrl) {
      contentToSend = (text ? `${text}\n` : '') + '[用户发送了一张图片，请根据上下文回复]';
    }

    const fullContentForAMY = contentToSend + fileRefs;
    // 对话框只显示文件名，不显示内容/路径
    const displayContent = contentToSend + (files && files.length > 0 ? '\n\n📎 ' + files.map((f) => f.name).join(', ') : '');

    // 权限检查与危险命令拦截
    const permCheck = checkPermission(fullContentForAMY, permissions);
    if (!permCheck.allowed) {
      window.alert(permCheck.reason || '此操作已被权限设置拦截');
      return;
    }
    const dangerMatch = getDangerMatch(fullContentForAMY);
    if (dangerMatch) {
      const ok = window.confirm(
        `危险操作警告\n\n检测到: ${dangerMatch.desc}\n级别: ${dangerMatch.level}\n\n确认仍要发送此消息？`
      );
      if (!ok) return;
    }

    const newRequestId = Date.now().toString();
    lastSentRequestId.current = newRequestId;
    const cmdIsSystem = !imageDataUrl && !files?.length && isSystemCommand(fullContentForAMY);
    pendingSystemReplyMap.current.set(newRequestId, cmdIsSystem);
    streamingMessageRef.current = '';
    fullTextRef.current = '';
    typewriter.reset();
    oct.ingest.reset();
    if (!cmdIsSystem) {
      setAwaitingResponse(true);
      setAgentPhase('thinking');
    }
    setStreak(touchStreak());
    setPendingPills(null);
    setMessages((prev) => {
      const next: ChatMessage[] = [
        ...prev,
        {
          id: getNextMessageId(),
          role: 'user' as const,
          content: displayContent,
          timestamp: Date.now(),
          imageDataUrl: imageDataUrl || undefined,
          files: files,
        },
      ];
      // Claude-style：不等首 token，立即创建 assistant 占位并开始锚定/留白
      if (!cmdIsSystem) {
        next.push({
          id: getNextMessageId(),
          role: 'assistant' as const,
          content: '',
          isStreaming: true,
          isStreamingRaw: true,
          timestamp: Date.now(),
        });
      }
      return next;
    });
    scroll.scrollAfterUserSend();

    if (!cmdIsSystem) {
      try {
        oct.stream.abortToIdle();
        if (oct.fsm.getPhase() === TurnPhase.IDLE) {
          oct.fsm.onUserTyping();
        }
        oct.fsm.onUserSubmit();
        oct.fsm.onRequestStart();
        oct.ingest.reset();
        oct.stream.open();
      } catch (e) {
        console.warn('[ChatTab.v2] oct runtime (send)', e);
      }
    }

    // 发送到 OpenClaw，包含图片和文件（content 含路径引用，AMY 用 read_file 读取）
    const result = await ws.send(fullContentForAMY, imageDataUrl || undefined, files, streamSpeedMs);
    if (!result?.success && !cmdIsSystem) {
      setAwaitingResponse(false);
      console.warn('[ChatTab] Send failed:', result);
      try {
        oct.stream.abortToIdle();
        recoverOctStreamFromEndFailure(oct);
      } catch (e) {
        console.warn('[ChatTab.v2] send failed cleanup', e);
      }
    }
  }, [ws.wsConnected, getNextMessageId, permissions, scroll.scrollAfterUserSend, oct]);


  const quickSend = useCallback((content: string) => {
    if (!content.trim()) return;

    const permCheck = checkPermission(content.trim(), permissions);
    if (!permCheck.allowed) {
      window.alert(permCheck.reason || '此操作已被权限设置拦截');
      return;
    }
    const dangerMatch = getDangerMatch(content.trim());
    if (dangerMatch) {
      const ok = window.confirm(
        `危险操作警告\n\n检测到: ${dangerMatch.desc}\n级别: ${dangerMatch.level}\n\n确认仍要发送此消息？`
      );
      if (!ok) return;
    }

    const newRequestId = Date.now().toString();
    lastSentRequestId.current = newRequestId;
    const isSystem = isSystemCommand(content.trim());
    pendingSystemReplyMap.current.set(newRequestId, isSystem);
    streamingMessageRef.current = '';
    fullTextRef.current = '';
    typewriter.reset();
    oct.ingest.reset();
    if (!isSystem) {
      setAwaitingResponse(true);
      setAgentPhase('thinking');
    }
    setPendingPills(null);
    setMessages((prev) => {
      const next: ChatMessage[] = [
        ...prev,
        { id: getNextMessageId(), role: 'user', content: content.trim(), timestamp: Date.now() },
      ];
      // Claude-style：不等首 token，立即创建 assistant 占位并开始锚定/留白
      if (!isSystem) {
        next.push({
          id: getNextMessageId(),
          role: 'assistant' as const,
          content: '',
          isStreaming: true,
          isStreamingRaw: true,
          timestamp: Date.now(),
        });
      }
      return next;
    });
    scroll.scrollAfterUserSend();
    if (!isSystem) {
      try {
        oct.stream.abortToIdle();
        if (oct.fsm.getPhase() === TurnPhase.IDLE) {
          oct.fsm.onUserTyping();
        }
        oct.fsm.onUserSubmit();
        oct.fsm.onRequestStart();
        oct.ingest.reset();
        oct.stream.open();
      } catch (e) {
        console.warn('[ChatTab.v2] oct runtime (quickSend)', e);
      }
    }
    ws.send(content.trim(), undefined, undefined, streamSpeedMs).then((result: { success?: boolean } | null) => {
      if (!result?.success && !isSystem) {
        setAwaitingResponse(false);
        try {
          oct.stream.abortToIdle();
          recoverOctStreamFromEndFailure(oct);
        } catch (e) {
          console.warn('[ChatTab.v2] quickSend failed cleanup', e);
        }
      }
    });
  }, [ws.wsConnected, getNextMessageId, permissions, scroll.scrollAfterUserSend, oct]);

  const handleClearHistory = useCallback(() => {
    if (!window.confirm('确认清空所有聊天记录？')) return;
    clearProcessedMarkdownCache();
    setMessages([]);
    (window as any).electronAPI?.chatHistorySave?.([]);
  }, []);


  // scrollManager: handleChatScroll / useLayoutEffects 已迁移到 useScrollManager hook


  return (
    <>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      <ContextMenu
        contextMenu={ctxMenu.contextMenu}
        onClose={() => ctxMenu.setContextMenu(null)}
        onCopy={ctxMenu.onCopy}
        onResend={(text) => { setInjectInputText(text); ctxMenu.setContextMenu(null); }}
        onDelete={(msgId) => setMessages((prev) => prev.filter((m) => m.id !== msgId))}
      />
    <div
      className={`chat-tab${canvas.isOpen ? ' canvas-active' : ''}`}
      onPaste={files.handlePaste}
      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer?.types?.includes('Files')) files.setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) files.setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        files.setDragging(false);
        const droppedFiles = Array.from(e.dataTransfer?.files ?? []);
        if (droppedFiles.length > 0) files.handleFileAttach(droppedFiles);
      }}
    >
      <div className={`chat-section ${files.isDragging ? 'drag-over' : ''}`} style={{ position: 'relative' }}>
        {files.isDragging && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'var(--accent-primary-muted)',
            border: '2px dashed var(--accent-primary)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            pointerEvents: 'none',
          }}>
            <span style={{
              color: 'var(--accent-primary)',
              fontSize: 'var(--text-lg)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '3px',
              textShadow: '0 0 10px var(--glow-color)',
            }}>⬇ DROP FILES HERE</span>
          </div>
        )}
        {/* VOICE / SETTINGS / CONNECTED 通过 portal 渲染到 TabBar 右侧 */}
        {typeof document !== 'undefined' && document.getElementById('chat-header-portal') && createPortal(
          <>
            <button
              type="button"
              className={`voice-toggle ${settings.typingSound !== 'off' ? 'on' : 'off'}`}
              onClick={() => setSettings((s) => ({
                ...s,
                typingSound: s.typingSound === 'off' ? 'typewriter' : 'off'
              }))}
              title={settings.typingSound !== 'off' ? `音效: ${settings.typingSound}（点击关闭）` : '点击开启打字音效'}
            >
              {settings.typingSound !== 'off' ? '♪ VOICE ON' : '♪ VOICE OFF'}
            </button>
            <button
              type="button"
              className="voice-toggle"
              onClick={() => setShowSettings(true)}
              title="设置"
            >
              ⚙ SETTINGS
            </button>
            <span className={`ws-status ${ws.wsConnected ? 'connected' : 'disconnected'}`} style={{ fontSize: '11px' }}>
              {ws.wsConnected && <span className="status-dot" />}
              {ws.wsConnected ? 'CONNECTED' : ws.wsReconnecting ? '重连..' : ws.wsError || 'DISCONNECTED'}
            </span>
          </>,
          document.getElementById('chat-header-portal')!
        )}

        <SetupGuide
          wsConnected={ws.wsConnected}
          gatewayRunning={gateway.gatewayRunning || gateway.gatewayPortInUse}
          onStartGateway={gateway.startGateway}
          onOpenSettings={() => setShowSettings(true)}
        />

        <ChatMessageList
          messages={messages}
          displayMessages={messages.length > scroll.visibleCount ? messages.slice(-scroll.visibleCount) : messages}
          isStreaming={isStreaming}
          awaitingResponse={awaitingResponse}
          streamingContent={fullTextRef.current}
          displayedText={typewriter.displayedText}
          speakingMessageId={speakingMessageId}
          agentPhase={agentPhase}
          thinkingElapsed={thinkingElapsed}
          wsConnected={ws.wsConnected}
          quickSend={quickSend}
          bottomRef={scroll.bottomRef}
          onScroll={scroll.handleChatScroll}
          onMessageContextMenu={(e, msg, raw) => ctxMenu.onContextMenu(e, msg.id, raw)}
          onQuoteQuestion={(text: string) => setInjectInputText(text)}
          pendingPills={pendingPills}
          messagesContainerRef={scroll.messagesContainerRef}
          activeTools={activeTools}
          getToolDisplayName={getToolDisplayName}
          streamingDomRef={streamingDomRef}
          markdownComponents={mdComponents}
        />
        {scroll.showScrollBtn && (
          <div
            onClick={() => {
              scroll.scheduleScrollAfterLayout(true);
            }}
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              bottom: '90px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 0',
              cursor: 'pointer',
              gap: '2px',
              zIndex: 10,
              pointerEvents: 'auto',
            }}
          >
            {[0, 1, 2].map((i) => (
              <svg key={i} width="28" height="16" viewBox="0 0 28 16" style={{
                display: 'block',
                animation: 'chevronGlow 1.4s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
                filter: `drop-shadow(0 0 ${4 + i * 2}px var(--glow-color))`,
              }}>
                <polyline
                  points="2,2 14,13 26,2"
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ))}
          </div>
        )}
        <ChatInputArea
          imagePreview={files.imagePreview}
          setImagePreview={files.setImagePreview}
          uploadedFiles={files.uploadedFiles}
          setUploadedFiles={files.setUploadedFiles}
          onSend={sendMessage}
          wsConnected={ws.wsConnected}
          isStreaming={isStreaming}
          inputRef={inputRef}
          injectInputText={injectInputText}
          onInjectConsumed={() => setInjectInputText(null)}
          onClearHistory={handleClearHistory}
        />
      </div>

      <div className="right-panel" style={{
        width: sidebarCollapsed ? '40px' : '380px',
        transition: 'width 0.2s ease',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* 折叠按钮 */}
        <button
          onClick={() => setSidebarCollapsed(v => !v)}
          style={{
            position: 'absolute',
            left: sidebarCollapsed ? '8px' : '-14px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '24px',
            height: '48px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 'var(--text-sm)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {sidebarCollapsed ? '›' : '‹'}
        </button>
        {/* 内容区域 - 折叠时隐藏 */}
        <div style={{
          display: sidebarCollapsed ? 'none' : 'flex',
          flexDirection: 'column',
          height: '100%',
        }}>
        {/* 1. 顶部状态行：GW/MEM 信号+ 时间 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 12px',
              borderBottom: '1px solid var(--border-subtle)',
            flexShrink: 0,
          }}
        >
          {/* 信号：Gateway 连接状态（绿色*/}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: ws.wsConnected ? 'var(--status-success)' : 'var(--status-error)',
                animation: ws.wsConnected ? 'pulse-green 2s infinite' : 'pulse-red 1s infinite',
              }}
            />
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              GW
            </span>
          </div>

          {/* 信号：Nocturne 记忆系统（青绿） */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: ws.nocturneOnline ? 'var(--status-info)' : 'var(--status-error)',
                animation: ws.nocturneOnline ? 'pulse-blue 3s infinite' : 'pulse-red 1s infinite',
              }}
            />
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              MEM
            </span>
          </div>

          {/* 时间日期靠右对齐 - 同行排列 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '8px',
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-3xl)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-mono)',
                fontWeight: 500,
                letterSpacing: '1px',
                lineHeight: 1,
              }}
            >
              {timers.localTime || '--:--'}
            </div>
            <div
              style={{
                width: '1px',
                height: '16px',
                background: 'var(--border-subtle)',
              }}
            />
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.5px',
                lineHeight: 1,
              }}
            >
              {timers.localDate || ''}
            </div>
          </div>
        </div>

        {/* 2. 心跳- 完整显示 65px */}
        <div style={{ 
          borderBottom: '1px solid var(--border-subtle)', 
          height: '65px',
          padding: '8px 0',
          overflow: 'visible',
          flexShrink: 0,
        }}>
          <HeartbeatWave connected={ws.wsConnected} pulse={heartbeatPulse} />
        </div>

        {/* 3. 系统信息 MODEL/TOK/CTX */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          padding: '4px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          gap: '8px',
          fontSize: 'var(--text-sm)',
          fontFamily: 'var(--font-mono)',
        }}>
          <div style={{ display: 'flex', gap: '4px' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>MODEL</span>
            <span style={{ color: 'var(--accent-primary)' }}>{modelName || '--'}</span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>TOK</span>
            <span style={{ color: 'var(--accent-primary)' }}>
              {tokenIn != null ? `${(tokenIn/1000).toFixed(1)}k` : '0'}/{ctxMax != null ? `${(ctxMax/1000).toFixed(0)}k` : '--'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <span style={{ color: 'var(--text-tertiary)' }}>CTX</span>
            <span style={{ color: ctxUsed != null && ctxMax != null && ctxMax > 0 && (ctxUsed / ctxMax) > 0.8 ? 'var(--status-error)' : 'var(--accent-primary)' }}>
              {ctxUsed != null && ctxMax != null && ctxMax > 0 ? `${(ctxUsed / 1000).toFixed(1)}k (${Math.round((ctxUsed / ctxMax) * 100)}%)` : '0%'}
            </span>
          </div>
          {streak > 0 && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <span style={{ color: 'var(--status-warning)' }}>🔥 STREAK {streak}</span>
            </div>
          )}
        </div>

        {/* 4. 控制按钮*/}
        <div style={{
          display: 'flex',
          gap: '4px',
          padding: '6px 12px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <button
            type="button"
            onClick={() => {
              if (gateway.gatewayRunning) {
                gateway.stopGateway();
              } else {
                gateway.startGateway();
              }
            }}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              background: 'transparent',
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '1px',
              transition: 'all 0.15s',
              border: `1px solid ${gateway.gatewayRunning ? 'var(--status-error)' : 'var(--status-success)'}`,
              color: gateway.gatewayRunning ? 'var(--status-error)' : 'var(--status-success)',
            }}
          >
            {gateway.gatewayRunning ? '■ 停止' : '▶ 启动'}
          </button>
          <button
            type="button"
            onClick={gateway.restartGateway}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              background: 'transparent',
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '1px',
              transition: 'all 0.15s',
              border: '1px solid var(--status-warning)',
              color: 'var(--status-warning)',
            }}
          >
            ↺ 重启
          </button>
          <button
            type="button"
            onClick={() => ipcRenderer.invoke('open-terminal-window')}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              background: 'transparent',
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '1px',
              transition: 'all 0.15s',
              border: '1px solid var(--border-light)',
              color: 'var(--text-secondary)',
            }}
          >
            &gt; 终端
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).electronAPI?.enterFloatingMode) {
                (window as any).electronAPI.enterFloatingMode();
              }
            }}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              background: 'transparent',
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '1px',
              transition: 'all 0.15s',
              border: '1px solid var(--border-light)',
              color: 'var(--text-secondary)',
            }}
          >
            ◎ 悬浮
          </button>
        </div>

        {/* 5. 任务看板 - flex:1 自适应 */}
        <div className="task-board-section">
          <TaskBoard compact />
        </div>

        {/* 6. Gateway 日志 - 固定高度 */}
        <div className="gateway-log-section">
          <LogPanel
            title="Gateway 日志"
            lines={gateway.logLines}
            bodyRef={gateway.logContainerRef}
            emptyText="[LOG] 等待 Gateway 日志..."
            nocturneOnline={ws.nocturneOnline}
            modelName={modelName}
            onExport={gateway.exportLogs}
            onClear={gateway.clearLogs}
          />
        </div>
        {/* 内容区域结束 */}
      </div>
      {/* right-panel 结束 */}
      </div>
    {/* chat-tab 结束 */}
    </div>

    <div
      className={`canvas-drawer${canvas.isOpen ? ' canvas-drawer--open' : ''}`}
    >
      <div className="canvas-drawer-shadow" aria-hidden />
      <CanvasPanel onSendToChat={(text) => sendMessage(text, null)} />
    </div>

    {files.screenshotFlash && (
      <div className="screenshot-flash-overlay">
        <span className="screenshot-flash-text">已截图</span>
      </div>
    )}
  </>
  );
};

export default ChatTab;


