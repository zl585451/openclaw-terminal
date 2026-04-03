import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, memo, useMemo } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// xterm 已完全移除以修复闪退问题
import '../../styles/ChatTab.css';
import '../../components/ResponseTray.css';
import { parseOptionBox, type OptionItem, type RenderSegment } from '../../utils/optionBoxParser';
import { extractAssistantCotAndMain, hasAssistantCotMarkers } from '../../utils/cotExtract';
import { useTypewriter } from '../../hooks/useTypewriter';
import { useGateway } from '../../hooks/useGateway';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useFileAttachment } from '../../hooks/useFileAttachment';
import { useTimers } from '../../hooks/useTimers';
import { useContextMenu } from '../../hooks/useContextMenu';
import { useScrollManager } from '../../hooks/useScrollManager';
import { ContextMenu } from '../../components/ContextMenu';
import OptionBox from '../../components/OptionBox';
import TaskList from '../../components/TaskList';
import TaskBoard from '../../components/TaskBoard';
import QuestionCards from '../../components/QuestionCards';
import SettingsPanel from '../../components/SettingsPanel';
import CoTBlock from '../../components/CoTBlock';
import HeartbeatWave from '../../components/HeartbeatWave';
import AmyAvatar from '../../components/AmyAvatar';
import SetupGuide from '../../components/SetupGuide';
import LogPanel from '../../components/LogPanel';
import { blockRouter } from '../../core/blockRouter';
import { blocksToSegments } from '../../core/blockAdapter';
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
import { getCachedPreprocessedMarkdown, clearProcessedMarkdownCache } from '../../utils/markdownPreprocess';
import { createMarkdownComponents } from './markdownComponents';
import ChatInputArea from './ChatInput';

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

const formatTime = (timestamp: string | number | undefined): string => {
  if (timestamp === undefined || timestamp === null) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

const formatFullTime = (timestamp: string | number | undefined): string => {
  if (timestamp === undefined || timestamp === null) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

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

function MsgCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (_) {}
  };
  return (
    <button type="button" className="msg-copy-btn" onClick={handleCopy} title={copied ? '已复制' : '复制'}>
      {copied ? '✓' : '⎘'}
    </button>
  );
}





/** 打字机光标：单独组件避免随内容重渲染导致闪烁 */
const TypewriterCursor = memo(function TypewriterCursor({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="cursor-blink">▋</span>;
});

/** 流式结束后的正文：预处理 + ReactMarkdown，结果按 messageId+段键缓存 */
const FinalizedMarkdownContent = memo(
  function FinalizedMarkdownContent({
    messageId,
    segmentKey,
    content,
    markdownComponents,
    streaming = false,
  }: {
    messageId: number;
    segmentKey?: string;
    content: string;
    markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
    /** 与 segmentKey 解耦：流式时 segmentKey 需与结束后一致，用此标志跳过预处理 */
    streaming?: boolean;
  }) {
    const processedText = useMemo(
      () => {
        // 流式阶段跳过 preprocessMarkdown：
        // 1. 流式内容每帧都变，无法命中缓存，每帧都重算开销高
        // 2. 表格从 |---| 文本变成 <table> DOM 时结构突变，造成跳动
        // 流式阶段 remark-gfm 已能渲染大部分 markdown，不需要预处理
        if (streaming || segmentKey?.includes('stream')) {
          return content || '';
        }
        return getCachedPreprocessedMarkdown(messageId, segmentKey, content || '');
      },
      [messageId, segmentKey, content, streaming]
    );
    return (
      <span className="msg-content markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {processedText}
        </ReactMarkdown>
      </span>
    );
  },
  (prev, next) =>
    prev.messageId === next.messageId &&
    prev.segmentKey === next.segmentKey &&
    prev.content === next.content &&
    prev.streaming === next.streaming &&
    prev.markdownComponents === next.markdownComponents
);

const UI_CTRL_PATTERNS = [/\[上一页\]/, /\[下一页\]/, /\[第\d+\/\d+页\]/, /\[确认导入\]/, /\[取消\]/];

/** 剥离 [RENDER:xxx] 和 [pills]...[/pills] 块（后者已在托盘显示）；isLastAI 时额外清掉 ■ 开头的选项行 */
function stripRenderAndPillsMarkers(text: string, isLastAI?: boolean): string {
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

function filterExpectedEffect(text: string, isLastAI?: boolean): string {
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

const SystemMessage = ({ text }: { text: string }) => {
  const [collapsed, setCollapsed] = React.useState(true);
  const lines = text.split('\n').filter((l) => l.trim());
  const preview = lines[0] || '';
  const isLong = lines.length > 3;

  return (
    <div style={{
      background: 'var(--bg-panel)',
      borderLeft: '3px solid var(--status-warning)',
      borderRadius: '4px',
      padding: '10px 14px',
      maxWidth: '70%',
      margin: '4px 0',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: collapsed && isLong ? 0 : '8px',
        cursor: isLong ? 'pointer' : 'default',
      }} onClick={() => isLong && setCollapsed(!collapsed)}>
        <span style={{ color: 'var(--status-warning)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', letterSpacing: '2px' }}>
          [ SYSTEM ]
        </span>
        {isLong && (
          <span style={{ color: 'var(--status-warning)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', opacity: 0.7 }}>
            {collapsed ? '展开' : '收起'}
          </span>
        )}
      </div>
      {collapsed && isLong ? (
        <div style={{ color: 'var(--text-primary)', fontSize: 'var(--text-code)', opacity: 0.8 }}>
          {preview}
          <span style={{ color: 'var(--status-warning)', opacity: 0.5 }}> ···</span>
        </div>
      ) : (
        <div>
          {lines.map((line, i) => (
            <div key={i} style={{
              color: 'var(--text-primary)', fontSize: 'var(--text-code)',
              marginBottom: '4px', lineHeight: 1.5,
            }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
};

interface ChatMessageItemProps {
  msg: ChatMessage;
  textToShow: string;
  raw: string;
  optionsToShow: OptionItem[];
  isTaskList: boolean;
  isReflectiveQuestions: boolean;
  forcePills?: boolean;
  totalPages: number | undefined;
  currentPage: number;
  onPageChange: (msgId: number, page: number) => void;
  isStreamingMsg: boolean;
  agentPhase: 'idle' | 'thinking' | 'typing' | 'tool_executing';
  speakingMessageId: number | null;
  wsConnected: boolean;
  quickSend: (text: string) => void;
  onContextMenu: (e: React.MouseEvent, msg: ChatMessage, raw: string) => void;
  /** 点击反思问引用到输入框 */
  onQuoteQuestion: (text: string) => void;
  /** 成对标签解析出的渲染段（存在时优先渲染） */
  segments?: RenderSegment[];
  /** 思考耗时（秒） */
  thinkingElapsed?: number;
  /** 是否为最后一条 assistant 消息（是则不渲染 pills，因已在 ResponseTray 显示） */
  isLastAssistant?: boolean;
  /** 打字机 DOM ref，供 AssistantMessageBody 直接写 textContent */
  streamingDomRef?: React.RefObject<HTMLPreElement | null>;
  /** Markdown 组件配置 */
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
  /** 从 [cot]…[/cot] 提取的思维链；null/undefined 表示本条无 CoT */
  cotContent?: string | null;
  /** 思维链是否仍在流式接收 */
  cotStreaming?: boolean;
  /**
   * OCT-LAYOUT-ANCHOR-2026-04-01
   * 网关仍在 thinking、本条 assistant 尚无任何字符时，把「思考中」CoT 占位画在本条消息头旁，
   * 避免与独立 cot-stream-wrapper 双行叠放导致头像/列表在首 token 时跳动。
   * 退回：删此 prop 及相关分支，恢复 ChatMessageList 内独立的 thinking CoT 块（仅改回 TSX 即可）。
   */
  inlineThinkingPlaceholder?: boolean;
}

const MessageMeta = memo(function MessageMeta({ timestamp }: { timestamp: string | number | undefined }) {
  const [hoverTime, setHoverTime] = useState(false);
  return (
    <span
      className="msg-timestamp"
      onMouseEnter={() => setHoverTime(true)}
      onMouseLeave={() => setHoverTime(false)}
      style={{
        color: hoverTime ? 'var(--accent)' : 'var(--text-secondary)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-mono)',
        cursor: 'default',
        transition: 'color 0.2s',
        letterSpacing: '0.5px',
      }}
    >
      {hoverTime ? formatFullTime(timestamp) : formatTime(timestamp)}
    </span>
  );
});

const MessageHeader = memo(
  function MessageHeader({
    msg,
    isStreamingMsg,
    agentPhase,
    suppressPhaseBadge,
  }: {
    msg: ChatMessage;
    isStreamingMsg: boolean;
    agentPhase: 'idle' | 'thinking' | 'typing' | 'tool_executing';
    /** 与头部带内 CoT 并存且 phase 为 thinking 时隐藏，避免与 CoT 标题双「思考中」 */
    suppressPhaseBadge?: boolean;
  }) {
    const showBadge =
      isStreamingMsg &&
      agentPhase !== 'idle' &&
      !(suppressPhaseBadge && agentPhase === 'thinking');
    return (
      <div className="msg-header">
        {msg.role === 'user' ? (
          <span className="msg-label">YOU ▶</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <AmyAvatar isStreaming={!!msg.isStreaming} size={32} />
            <span
              style={{
                color: 'var(--accent)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '2px',
              }}
            >
              AMY
            </span>
            {showBadge && (
              <span className="agent-status-badge">
                {agentPhase === 'thinking' ? '思考中' : agentPhase === 'tool_executing' ? '调用工具中' : '打字中'}
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
  (a, b) =>
    a.msg.id === b.msg.id &&
    a.msg.role === b.msg.role &&
    !!a.msg.isStreaming === !!b.msg.isStreaming &&
    a.isStreamingMsg === b.isStreamingMsg &&
    a.agentPhase === b.agentPhase &&
    !!a.suppressPhaseBadge === !!b.suppressPhaseBadge
);

const UserMessageBody = memo(
  function UserMessageBody({ imageDataUrl, textToShow }: { imageDataUrl?: string; textToShow: string }) {
    return (
      <div className="msg-user-body">
        {imageDataUrl && <img src={imageDataUrl} alt="" className="msg-user-image" />}
        {textToShow && <span className="msg-content msg-user-text">{textToShow}</span>}
      </div>
    );
  },
  (a, b) => a.imageDataUrl === b.imageDataUrl && a.textToShow === b.textToShow
);

type AssistantMessageBodyProps = Pick<
  ChatMessageItemProps,
  | 'msg'
  | 'textToShow'
  | 'raw'
  | 'optionsToShow'
  | 'isTaskList'
  | 'isReflectiveQuestions'
  | 'forcePills'
  | 'totalPages'
  | 'currentPage'
  | 'onPageChange'
  | 'isStreamingMsg'
  | 'wsConnected'
  | 'quickSend'
  | 'onQuoteQuestion'
  | 'segments'
  | 'isLastAssistant'
> & {
  streamingDomRef?: React.RefObject<HTMLPreElement | null>;
};

const AssistantMessageBody = memo(function AssistantMessageBody({
  msg,
  textToShow,
  raw,
  optionsToShow,
  isTaskList,
  isReflectiveQuestions,
  forcePills,
  totalPages,
  currentPage,
  onPageChange,
  isStreamingMsg,
  wsConnected,
  quickSend,
  onQuoteQuestion,
  segments,
  isLastAssistant,
  streamingDomRef: _streamingDomRef,
  markdownComponents,
}: AssistantMessageBodyProps & { markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] }) {
  // Layout Lock：流式开始时记录高度并锁定 minHeight，防止结束时收缩跳动
  const bubbleRef = useRef<HTMLDivElement>(null);
  const lockedHeightRef = useRef<number>(0);

  useEffect(() => {
    if (isStreamingMsg && bubbleRef.current) {
      lockedHeightRef.current = bubbleRef.current.offsetHeight;
      if (lockedHeightRef.current > 0) {
        bubbleRef.current.style.minHeight = `${lockedHeightRef.current}px`;
      }
    }
  }, [isStreamingMsg]);

  useEffect(() => {
    if (!isStreamingMsg && bubbleRef.current) {
      const el = bubbleRef.current;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.minHeight = '';
        });
      });
    }
  }, [isStreamingMsg]);

  if (msg.isSystemReply) {
    return <SystemMessage text={(textToShow || raw || '').replace(/ · /g, '\n')} />;
  }


  return (
    <div
      ref={bubbleRef}
      className="msg-assistant-body"
      style={isStreamingMsg ? { display: 'flex', flexDirection: 'column' } : undefined}
    >
      {segments && segments.length > 0 ? (
        <>
          {(() => {
            let remaining = textToShow || '';
            return segments.map((seg, idx) => {
            const contentBefore =
              idx > 0 ? segments.slice(0, idx).reduce((sum, s) => sum + (s.content?.length || 0), 0) : 0;
            const contentAfter =
              idx < segments.length - 1
                ? segments.slice(idx + 1).reduce((sum, s) => sum + (s.content?.length || 0), 0)
                : 0;

            switch (seg.type) {
              case 'text':
                if (isStreamingMsg) {
                  // 流式：统一用 FinalizedMarkdownContent，与结束后相同的渲染树，消除切换跳动
                  // segmentKey 与结束后保持一致（不加 -stream 后缀），
                  // 避免流式结束时 key 变化导致组件卸载重挂，代码框闪烁
                  const fullSegText = stripRenderAndPillsMarkers(seg.content, isLastAssistant);
                  const take = remaining.slice(0, fullSegText.length);
                  remaining = remaining.slice(take.length);
                  return (
                    <FinalizedMarkdownContent
                      key={idx}
                      messageId={msg.id}
                      segmentKey={`seg-${idx}`}
                      content={take}
                      markdownComponents={markdownComponents}
                      streaming
                    />
                  );
                }
                return (
                  <FinalizedMarkdownContent
                    key={idx}
                    messageId={msg.id}
                    segmentKey={`seg-${idx}`}
                    content={stripRenderAndPillsMarkers(seg.content, isLastAssistant)}
                    markdownComponents={markdownComponents}
                  />
                );
              case 'pills':
                // 流式阶段隐藏 pills，消除换行闪跳；流式结束后自然出现
                if (isStreamingMsg) return null;
                return seg.options.length > 0 ? (
                  <OptionBox
                    key={idx}
                    messageId={msg.id}
                    options={seg.options}
                    totalPages={undefined}
                    currentPage={1}
                    onPageChange={(page) => onPageChange(msg.id, page)}
                    onSelect={(value) => {
                      if (value && wsConnected) quickSend(value);
                    }}
                    forcePills={true}
                    segmentIndex={idx}
                    contentBefore={contentBefore}
                    contentAfter={contentAfter}
                  />
                ) : null;
              case 'checkbox':
                // 流式阶段隐藏 checkbox
                if (isStreamingMsg) return null;
                return seg.options.length > 0 ? (
                  <OptionBox
                    key={idx}
                    messageId={msg.id}
                    options={seg.options}
                    totalPages={undefined}
                    currentPage={1}
                    onPageChange={(page) => onPageChange(msg.id, page)}
                    onSelect={(value) => {
                      if (value && wsConnected) quickSend(value);
                    }}
                    forcePills={false}
                  />
                ) : null;
              case 'question':
                return seg.options.length > 0 ? (
                  <QuestionCards key={idx} questions={seg.options} onQuote={onQuoteQuestion} />
                ) : null;
              case 'tasklist':
                return seg.options.length > 0 ? <TaskList key={idx} items={seg.options} /> : null;
              case 'cot':
                return null; // 统一由外部 CoTBlock 渲染
              default:
                return null;
            }
          });
          })()}
        </>
      ) : (
        <>
          {(() => {
            if (isStreamingMsg) {
              // 流式阶段：统一用 FinalizedMarkdownContent，消除流式结束时的渲染切换跳动
              // 不渲染 pills/options，避免换行闪跳
              return (
                <FinalizedMarkdownContent
                  messageId={msg.id}
                  segmentKey="main"
                  content={textToShow || ''}
                  markdownComponents={markdownComponents}
                  streaming
                />
              );
            }

            const cleanedText = filterExpectedEffect(textToShow, isLastAssistant);
            const hasInlinePlaceholder = cleanedText.includes('<!--OPTIONS_HERE-->');
            const showInlineOptions = hasInlinePlaceholder && optionsToShow.length > 0 && !isTaskList && !isReflectiveQuestions;

            if (showInlineOptions) {
              const parts = cleanedText.split('<!--OPTIONS_HERE-->');
              const before = parts[0]?.trim() || '';
              const after = parts.slice(1).join('').trim();
              const showPillsHere = !isLastAssistant || !forcePills;
              return (
                <>
                  {before && (
                    <FinalizedMarkdownContent messageId={msg.id} segmentKey="opt-before" content={before} markdownComponents={markdownComponents} />
                  )}
                  {showPillsHere && (
                    <OptionBox
                      messageId={msg.id}
                      options={optionsToShow}
                      totalPages={totalPages}
                      currentPage={currentPage}
                      onPageChange={(page) => onPageChange(msg.id, page)}
                      onSelect={(value) => {
                        if (value && wsConnected) quickSend(value);
                      }}
                      forcePills={forcePills}
                    />
                  )}
                  {after && (
                    <FinalizedMarkdownContent messageId={msg.id} segmentKey="opt-after" content={after} markdownComponents={markdownComponents} />
                  )}
                </>
              );
            }

            return (
              <>
                <FinalizedMarkdownContent
                  messageId={msg.id}
                  segmentKey="main"
                  content={cleanedText}
                  markdownComponents={markdownComponents}
                />
                {optionsToShow.length > 0 && !isTaskList && !isReflectiveQuestions && (
                  <OptionBox
                    messageId={msg.id}
                    options={optionsToShow}
                    totalPages={totalPages}
                    currentPage={currentPage}
                    onPageChange={(page) => onPageChange(msg.id, page)}
                    onSelect={(value) => {
                      if (value && wsConnected) quickSend(value);
                    }}
                    forcePills={forcePills}
                  />
                )}
              </>
            );
          })()}
          {optionsToShow.length > 0 && isTaskList && <TaskList items={optionsToShow} />}
          {optionsToShow.length > 0 && isReflectiveQuestions && (
            <QuestionCards questions={optionsToShow} onQuote={onQuoteQuestion} />
          )}
        </>
      )}
      {isStreamingMsg && <TypewriterCursor show />}
    </div>
  );
});

/** 单行消息外壳（不设 memo：子树由 ChatMessageItem 控制） */
function MessageRow({
  msg,
  raw,
  speakingMessageId,
  isStreamingMsg,
  onContextMenu,
  children,
}: {
  msg: ChatMessage;
  raw: string;
  speakingMessageId: number | null;
  isStreamingMsg: boolean;
  onContextMenu: (e: React.MouseEvent, msg: ChatMessage, raw: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      data-msg-id={msg.id}
      className={`chat-message ${msg.role} ${msg.isSystemReply ? 'system-reply' : ''} ${speakingMessageId === msg.id ? 'speaking' : ''} ${isStreamingMsg ? 'streaming' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, msg, raw);
      }}
    >
      {msg.role === 'assistant' && (
        <div className="msg-copy-wrap">
          <MsgCopyButton text={raw} />
        </div>
      )}
      {children}
    </div>
  );
}

const ChatMessageItem = memo(function ChatMessageItem(props: ChatMessageItemProps) {
  const {
    msg,
    textToShow,
    raw,
    optionsToShow,
    isTaskList,
    isReflectiveQuestions,
    forcePills,
    totalPages,
    currentPage,
    onPageChange,
    isStreamingMsg,
    agentPhase,
    speakingMessageId,
    wsConnected,
    quickSend,
    onContextMenu,
    onQuoteQuestion,
    segments,
    isLastAssistant,
    streamingDomRef,
    markdownComponents,
    cotContent,
    cotStreaming,
    inlineThinkingPlaceholder = false,
  } = props;

  const showCotInline = msg.role === 'assistant' && cotContent != null;
  const showHeaderBand = showCotInline || inlineThinkingPlaceholder;

  return (
    <MessageRow
      msg={msg}
      raw={raw}
      speakingMessageId={speakingMessageId}
      isStreamingMsg={isStreamingMsg}
      onContextMenu={onContextMenu}
    >
      {showHeaderBand ? (
        <div className="assistant-header-band assistant-header-band--stable">
          <MessageHeader
            msg={msg}
            isStreamingMsg={isStreamingMsg}
            agentPhase={agentPhase}
            suppressPhaseBadge
          />
          <div className="cot-stream-wrapper cot-stream-wrapper--header-inline">
            <CoTBlock
              content={showCotInline ? (cotContent ?? '') : ''}
              isStreaming={inlineThinkingPlaceholder || !!cotStreaming}
              isPlaceholder={inlineThinkingPlaceholder}
            />
          </div>
        </div>
      ) : (
        <MessageHeader msg={msg} isStreamingMsg={isStreamingMsg} agentPhase={agentPhase} />
      )}
      <div className="msg-body">
        {msg.role === 'assistant' ? (
          <AssistantMessageBody
            msg={msg}
            textToShow={textToShow}
            raw={raw}
            optionsToShow={optionsToShow}
            isTaskList={isTaskList}
            isReflectiveQuestions={isReflectiveQuestions}
            forcePills={forcePills}
            totalPages={totalPages}
            currentPage={currentPage}
            onPageChange={onPageChange}
            isStreamingMsg={isStreamingMsg}
            wsConnected={wsConnected}
            quickSend={quickSend}
            onQuoteQuestion={onQuoteQuestion}
            segments={segments}
            isLastAssistant={isLastAssistant}
            streamingDomRef={streamingDomRef}
            markdownComponents={markdownComponents}
          />
        ) : (
          <UserMessageBody imageDataUrl={msg.imageDataUrl} textToShow={textToShow} />
        )}
      </div>
      <MessageMeta timestamp={msg.timestamp} />
    </MessageRow>
  );
});

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

// ChatInputArea 已迁移到 src/ui/chat/ChatInput.tsx

/** 列表渲染用稳定引用，避免每条 user 消息因新对象触发无意义子树更新 */
const STABLE_EMPTY_OPTIONS: OptionItem[] = [];
const USER_ROW_PARSE_PLACEHOLDER = {
  text: '',
  options: STABLE_EMPTY_OPTIONS,
  totalPages: undefined as number | undefined,
  isTaskList: false,
  isReflectiveQuestions: false,
  forcePills: undefined as boolean | undefined,
  segments: undefined as RenderSegment[] | undefined,
};

interface ChatMessageListProps {
  messages: ChatMessage[];
  displayMessages: ChatMessage[];
  isStreaming: boolean;
  awaitingResponse: boolean;
  streamingContent: string;
  displayedText: string;
  speakingMessageId: number | null;
  agentPhase: 'idle' | 'thinking' | 'typing' | 'tool_executing';
  thinkingElapsed: number;
  wsConnected: boolean;
  quickSend: (text: string) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onMessageContextMenu: (e: React.MouseEvent, msg: ChatMessage, raw: string) => void;
  onQuoteQuestion: (text: string) => void;
  pendingPills?: string[] | null;
  messagesContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  activeTools?: Array<{
    callId: string;
    tool: string;
    state: 'executing' | 'done' | 'error';
    resultPreview?: string;
  }>;
  getToolDisplayName?: (tool: string) => string;
  streamingDomRef?: React.RefObject<HTMLPreElement | null>;
  markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'];
}

const ChatMessageList = function ChatMessageList({
  messages,
  displayMessages,
  isStreaming,
  awaitingResponse,
  streamingContent,
  displayedText,
  speakingMessageId,
  agentPhase,
  thinkingElapsed: _thinkingElapsed, // 不再使用，因为 CoTBlock 有自己的计时器
  wsConnected,
  quickSend,
  bottomRef,
  onScroll,
  onMessageContextMenu,
  onQuoteQuestion,
  pendingPills,
  messagesContainerRef,
  activeTools = [],
  getToolDisplayName = (t) => t,
  streamingDomRef,
  markdownComponents,
}: ChatMessageListProps) {
  const [pageByMsgId, setPageByMsgId] = useState<Record<number, number>>({});
  const streamingParseCacheRef = useRef<{ input: string; output: ReturnType<typeof parseOptionBox> } | null>(null);

  const handlePageChange = useCallback((msgId: number, page: number) => {
    setPageByMsgId((prev) => ({ ...prev, [msgId]: page }));
  }, []);

  // 检查任何来源的思维链标记：streamingContent 或 最后一条 assistant 消息的 content
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
  const msgContentHasCot = lastAssistantMsg?.isStreaming &&
    typeof lastAssistantMsg.content === 'string' &&
    hasAssistantCotMarkers(lastAssistantMsg.content);
  const streamingHasCot = typeof streamingContent === 'string' && hasAssistantCotMarkers(streamingContent);
  const hasCotAnywhere = streamingHasCot || msgContentHasCot;

  // 当 AI 已经开始输出内容（非空 assistant 消息存在）时，不再显示占位 indicator
  // 真正的状态徽章会显示在消息头部
  const assistantHasContent = lastAssistantMsg?.isStreaming &&
    (lastAssistantMsg.content as string)?.trim().length > 0;

  /** 已有任意 assistant 行（含空占位）时不再画列表顶独立指示器，避免与行内 CoT/徽章双「思考中」 */
  const hasAnyAssistant = messages.some((m) => m.role === 'assistant');

  const showTypingIndicator = (awaitingResponse || isStreaming) &&
    !hasAnyAssistant &&
    !hasCotAnywhere &&
    !assistantHasContent;
  const lastAssistantId = [...messages].reverse().find(m => m.role === 'assistant')?.id;

  /* OCT-LAYOUT-ANCHOR-2026-04-01：末条已是「空内容的流式 assistant」时，不再画独立的思考/typing 条，避免与该行双叠。退回：删此变量及下方 !emptyStreamingAssistantTail 条件。 */
  const tailMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const emptyStreamingAssistantTail =
    !!tailMsg &&
    tailMsg.role === 'assistant' &&
    !!tailMsg.isStreaming &&
    !(typeof tailMsg.content === 'string' ? tailMsg.content : '').trim();

  return (
    <div
      className="chat-messages-wrap"
      style={{ overflowAnchor: 'none' }}
      onScroll={onScroll}
      ref={messagesContainerRef}
    >
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <span className="empty-icon">✦</span>
            <span>输入消息开始对..</span>
          </div>
        )}
        {showTypingIndicator && !emptyStreamingAssistantTail && (
          agentPhase === 'thinking' ? (
            // 思考阶段：用 CoTBlock 占位面板替代 chat-thinking 条（无末条空 assistant 时）
            <div className="cot-stream-wrapper">
              <CoTBlock
                content=""
                isStreaming={true}
                isPlaceholder={true}
              />
            </div>
          ) : (
            // 其他等待阶段（typing / tool_executing）：保持原有样式
            <div className="chat-thinking">
              <span className="msg-label">◆ AMY</span>
              {agentPhase === 'typing' && <span className="agent-status-badge">打字中</span>}
              {agentPhase === 'tool_executing' && <span className="agent-status-badge">正在调用工具...</span>}
              <span className="processing-blocks typing-dots">
                <span className="block" />
                <span className="block" />
                <span className="block" />
              </span>
            </div>
          )
        )}
        {displayMessages.map((msg) => {
        const raw = typeof msg.content === 'string'
          ? msg.content
          : String((msg.content as any)?.text ?? (msg.content as any)?.content ?? msg.content ?? '');
        // 占位消息（isStreamingRaw + 空内容）：不跳过，让 streamingDomRef 能 attach
        // 打字机依赖 DOM 节点存在才能直接写 textContent
        const isStreamingMsg = msg.role === 'assistant' && msg.isStreaming;
        const fullContent =
          isStreamingMsg && msg.isStreamingRaw
            ? raw
            : isStreamingMsg && streamingContent
              ? streamingContent
              : raw;
        const displayedLength = displayedText.length;

        // ═══ CoT 分离：支持 [cot]…[/cot] 和 <think>…</think> 两种格式 ═══
        const { cotContent: streamingCotContent, cotDone: streamingCotDone, mainContent: mainTextFull } =
          msg.role === 'assistant' && fullContent
            ? extractAssistantCotAndMain(fullContent)
            : { cotContent: null, cotDone: true, mainContent: fullContent };
        const display = isStreamingMsg ? mainTextFull.slice(0, displayedLength) : mainTextFull;
        const parsed =
          msg.role === 'user'
            ? USER_ROW_PARSE_PLACEHOLDER
            : msg.role === 'assistant'
              ? (() => {
                  const fc = typeof fullContent === 'string' ? fullContent : '';
                  // 如果已经通过 streamingCotContent 提取了 CoT 内容，
                  // 就把剥离了 [cot]...[/cot] 的纯正文传给 blockRouter，
                  // 避免 blockRouter 再次把 [cot] 解析成 segment 造成双重渲染
                  const cotStrippedContent = streamingCotContent !== null
                    ? mainTextFull
                    : fc;
                  // 流式阶段（非 raw）：缓存解析结果，避免每帧重跑解析器
                  if (isStreamingMsg) {
                    const cached = streamingParseCacheRef.current;
                    if (cached && cached.input === cotStrippedContent) return cached.output;
                    const blocks = blockRouter(cotStrippedContent);
                    const bridgedText = blocksToSegments(blocks).map((s) => s.content).join('');
                    const result = parseOptionBox(bridgedText);
                    streamingParseCacheRef.current = { input: cotStrippedContent, output: result };
                    return result;
                  }
                  // 非流式（最终渲染）
                  // 同样使用剥离 CoT 的内容，避免 parseOptionBox 重复解析 [cot]
                  // CoT 统一由消息循环外部的 CoTBlock 渲染（使用通用提取器）
                  const { mainContent: nonStreamingCotStripped } = extractAssistantCotAndMain(fc);
                  const blocks = blockRouter(nonStreamingCotStripped);
                  const bridgedText = blocksToSegments(blocks).map((s) => s.content).join('');
                  const finalParsed = parseOptionBox(bridgedText);

                  // DEBUG：已禁用对话内容日志输出
                  /*
                  const parseDebugMultiTable =
                    fc.includes('|---') && (fc.match(/\|---/g) || []).length >= 2;
                  if (import.meta.env.DEV || parseDebugMultiTable) {
                    console.log('[PARSE-FINAL] fc length:', fc.length);
                    console.log('[PARSE-FINAL] bridgedText length:', bridgedText.length);
                    console.log('[PARSE-FINAL] bridgedText preview:', bridgedText.slice(0, 500));
                    console.log('[PARSE-FINAL] segments count:', finalParsed.segments?.length ?? 0);
                    console.log(
                      '[PARSE-FINAL] segments:',
                      JSON.stringify(
                        finalParsed.segments?.map((s) => ({
                          type: s.type,
                          contentLen: s.content?.length ?? 0,
                          contentPreview: s.content?.slice(0, 100) ?? '',
                          optionsCount: s.options?.length ?? 0,
                        })),
                        null,
                        2
                      )
                    );
                    console.log('[PARSE-FINAL] text length:', finalParsed.text?.length ?? 0);
                    console.log('[PARSE-FINAL] text preview:', finalParsed.text?.slice(0, 500));
                  }
                  */

                  return finalParsed;
                })()
              : {
                  text: display,
                  options: STABLE_EMPTY_OPTIONS,
                  totalPages: undefined,
                  isTaskList: false,
                  isReflectiveQuestions: false,
                  forcePills: undefined,
                  segments: undefined,
                };
        const textToShow = msg.role === 'assistant'
          ? isStreamingMsg
            ? (display as string)
            : parsed.text?.trim()
              ? parsed.text
              : raw
          : (display as string);
        const optionsToShow = parsed.options;
        const totalPages = parsed.totalPages;
        const isTaskList = !!parsed.isTaskList;
        const isReflectiveQuestions = !!parsed.isReflectiveQuestions;
        const forcePills = parsed.forcePills;
        const segmentsToShow = parsed.segments;
        const inlineThinkingPlaceholder =
          msg.role === 'assistant' &&
          msg.id === lastAssistantId &&
          isStreamingMsg &&
          !raw.trim() &&
          agentPhase === 'thinking';
        return (
          <React.Fragment key={msg.id}>
            <ChatMessageItem
              key={`item-${msg.id}`}
              msg={msg}
              raw={raw}
              textToShow={textToShow}
              optionsToShow={optionsToShow}
              isTaskList={isTaskList}
              isReflectiveQuestions={isReflectiveQuestions}
              forcePills={forcePills}
              totalPages={totalPages}
              segments={segmentsToShow}
              currentPage={pageByMsgId[msg.id] ?? 1}
              onPageChange={handlePageChange}
              isStreamingMsg={!!msg.isStreaming}
              agentPhase={agentPhase}
              speakingMessageId={speakingMessageId}
              wsConnected={wsConnected}
              quickSend={quickSend}
              onContextMenu={onMessageContextMenu}
              onQuoteQuestion={onQuoteQuestion}
              isLastAssistant={msg.role === 'assistant' && msg.id === lastAssistantId}
              streamingDomRef={msg.isStreaming ? streamingDomRef : undefined}
              markdownComponents={markdownComponents}
              cotContent={msg.role === 'assistant' ? streamingCotContent : undefined}
              cotStreaming={
                msg.role === 'assistant' && streamingCotContent != null ? !streamingCotDone : false
              }
              inlineThinkingPlaceholder={inlineThinkingPlaceholder}
            />
            {/* 工具调用卡片：紧跟当前 streaming assistant 消息之后 */}
            {isStreamingMsg && activeTools.length > 0 && (
              <div className="tool-calls-container">
                {activeTools.map((tool) => (
                  <div
                    key={tool.callId}
                    className={`tool-call-card tool-call-card--${tool.state}`}
                  >
                    <div className="tool-call-card__icon">
                      {tool.state === 'executing' && <span className="tool-call-card__spinner" />}
                      {tool.state === 'done' && <span>✅</span>}
                      {tool.state === 'error' && <span>❌</span>}
                    </div>
                    <div className="tool-call-card__content">
                      <span className="tool-call-card__text">
                        {tool.state === 'executing' && <>🔧 正在调用 {getToolDisplayName(tool.tool)}...</>}
                        {tool.state === 'done' && <>✅ {getToolDisplayName(tool.tool)} 完成</>}
                        {tool.state === 'error' && <>❌ {getToolDisplayName(tool.tool)} 失败</>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </React.Fragment>
        );
        })}
        {pendingPills && pendingPills.length > 0 && (
          <div className="response-tray-inline">
            <div className="response-tray-inline__pills">
              {pendingPills.map((pill: string, i: number) => (
                <button
                  key={i}
                  className="response-tray-inline__pill"
                  title={pill}
                  onClick={() => quickSend(pill)}
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef as React.Ref<HTMLDivElement>} style={{ height: 0, margin: 0, padding: 0 }} />
        {/* 底部 spacer：始终保持固定高度，不随 isStreaming 变化，避免开始/结束时跳变 */}
        <div style={{ height: '60vh', flexShrink: 0, pointerEvents: 'none' }} aria-hidden />
      </div>
    </div>
  );
}

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


