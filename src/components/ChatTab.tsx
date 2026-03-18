import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// xterm 已完全移除以修复闪退问题
import '../styles/ChatTab.css';
import { parseOptionBox, type OptionItem, type RenderSegment } from '../utils/optionBoxParser';
import OptionBox from './OptionBox';
import TaskList from './TaskList';
import TaskBoard from './TaskBoard';
import QuestionCards from './QuestionCards';
import ThinkModeMenu from './ThinkModeMenu';
import SettingsPanel from './SettingsPanel';
import SocraticPanel from './SocraticPanel';
import {
  detectThinkModeMarker,
  stripThinkModeMarker,
  parseSocraticSections,
  type SocraticRound,
} from '../utils/socraticTemplates';
import CodeBlock from './CodeBlock';
import QuickCommandMenu from './QuickCommandMenu';
import HeartbeatWave from './HeartbeatWave';
import AmyAvatar from './AmyAvatar';
import SetupGuide from './SetupGuide';
import { useSettings } from '../contexts/SettingsContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { checkPermission, getDangerMatch } from '../utils/permissionCheck';
import { playClickSound } from '../utils/clickSound';

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

// DOM 日志级别判断 - 优先解析原始 JSON level 字段
function getLogLevel(rawLine: string): string {
  try {
    const parsed = JSON.parse(rawLine) as { _meta?: { logLevelName?: string }; level?: string };
    const level = (parsed?._meta?.logLevelName ?? parsed?.level)?.toUpperCase?.();
    if (level === 'ERROR') return 'ERROR';
    if (level === 'WARN') return 'WARN';
    if (level === 'INFO') return 'INFO';
    if (level === 'LOG') return 'LOG';
    if (level === 'AGENT') return 'AGENT';
  } catch {}
  // fallback：文本匹配（适配已格式化的日志行）
  if (/error|failed|exception/i.test(rawLine)) return 'ERROR';
  if (/warn|invalid|missing/i.test(rawLine)) return 'WARN';
  if (/\[LOG\]/.test(rawLine)) return 'LOG';
  if (/\[AGENT\]|\[OpenClaw\]/i.test(rawLine)) return 'AGENT';
  return 'INFO';
}

// 日志颜色分类 - 根据关键词判断
function getLogColorClass(rawLine: string): string {
  const lower = rawLine.toLowerCase();
  
  // 记忆相关：蓝色
  if (lower.includes('memory') || lower.includes('记忆') || /\[memory\]/i.test(rawLine)) {
    return 'log-memory';
  }
  
  // 错误：红色
  if (/error|错误|failed|exception/i.test(rawLine)) {
    return 'log-error';
  }
  
  // 调试：灰色
  if (/debug|调试/i.test(rawLine)) {
    return 'log-debug';
  }
  
  // 默认
  return '';
}

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
  base64: string;
}

async function fileToUploadedFile(file: File): Promise<UploadedFile> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const textExts = ['txt', 'md', 'json', 'csv', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'html', 'css', 'sql', 'xml', 'yaml', 'yml'];
  const isText = textExts.includes(ext);
  let content: string | null = null;
  if (isText) {
    content = await file.text();
  }
  const base64 = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result as string;
      res(dataUrl.includes(',') ? dataUrl.split(',')[1]! : '');
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  return {
    name: file.name,
    size: file.size,
    ext,
    mimeType: file.type || 'application/octet-stream',
    isText,
    content,
    base64,
  };
}

/** 判断是否Gateway 直接处理的系统命令（不等AMY 回复*/
function isSystemCommand(text: string): boolean {
  const t = (text || '').trim();
  return /^\/(status|restart|stop|new|think\s+\w+)\s*$/.test(t);
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

const markdownComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href) {
          const openExternal = typeof (window as any).require === 'function'
            ? (window as any).require('electron').shell.openExternal
            : (url: string) => window.open(url, '_blank');
          openExternal(href);
        }
      }}
      style={{ color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer' }}
      title={href}
    >{children}</a>
  ),
  input: ({ type, ...props }) => {
    if (type === 'checkbox') return null;
    return <input type={type} {...props} />;
  },
  table: ({ children }) => <table className="md-table">{children}</table>,
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,
  code: ({ children, className, inline }: { children?: React.ReactNode; className?: string; inline?: boolean }) => {
    // react-markdown v10 提供 inline prop，优先使用它判断
    const isBlock = !inline && (className?.includes('language-') || String(children).includes('\n'));
    if (!isBlock) {
      return (
        <code style={{
          background: 'var(--bg-code)', color: 'var(--text-code)',
          padding: '1px 5px', borderRadius: '3px',
          fontSize: '12px', fontFamily: 'var(--font-mono)',
        }}>{children}</code>
      );
    }
    const code = String(children);
    const CodeBlockWithCopy = () => {
      const [copied, setCopied] = React.useState(false);
      const [expanded, setExpanded] = React.useState(false);
      const lines = code.split('\n').length;
      const isLong = lines > 12;

      const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      };

      return (
        <div style={{ position: 'relative', margin: '8px 0' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--bg-code-header)',
            border: '1px solid var(--border-subtle)',
            borderBottom: 'none',
            borderRadius: '4px 4px 0 0',
            padding: '4px 12px',
          }}>
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'Share Tech Mono', letterSpacing: '1px' }}>
              {(className?.replace('language-', '') || 'code').toUpperCase()} · {lines} lines
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {isLong && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-light)',
                    borderRadius: '3px',
                    color: 'var(--text-secondary)',
                    fontSize: '10px', fontFamily: 'Share Tech Mono',
                    padding: '2px 8px', cursor: 'pointer', letterSpacing: '1px',
                    transition: 'all 0.15s',
                  }}
                >
                  {expanded ? '收起' : '展开'}
                </button>
              )}
              <button
                onClick={handleCopy}
                style={{
                  background: copied ? 'var(--accent-primary-muted)' : 'transparent',
                  border: '1px solid',
                  borderColor: copied ? 'var(--accent-primary)' : 'var(--border-light)',
                  borderRadius: '3px',
                  color: copied ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontSize: '10px', fontFamily: 'Share Tech Mono',
                  padding: '2px 8px', cursor: 'pointer', letterSpacing: '1px',
                  transition: 'all 0.2s',
                }}
              >
      {copied ? '✓' : '⎘'}
              </button>
            </div>
          </div>
          <pre style={{
            background: 'var(--bg-code)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '0 0 4px 4px',
            padding: '12px',
            overflow: 'auto',
            margin: 0,
            maxHeight: expanded ? 'none' : '220px',
            transition: 'max-height 0.3s ease',
            position: 'relative',
          }}>
            <code style={{ color: 'var(--text-code)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
              {code}
            </code>
            {isLong && !expanded && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: '40px',
                background: 'linear-gradient(transparent, var(--bg-code))',
                pointerEvents: 'none',
              }} />
            )}
          </pre>
        </div>
      );
    };
    return <CodeBlockWithCopy />;
  },
  pre: ({ children }) => {
    const child = React.Children.toArray(children)[0] as React.ReactElement | undefined;
    if (child?.type === 'div') return <>{children}</>;
    if (child?.type === 'code') {
      const { className, children: codeChildren } = child.props as { className?: string; children?: React.ReactNode };
      const lang = (className || '').match(/language-(\w+)/)?.[1] || 'text';
      const code = String(codeChildren ?? '').replace(/\n$/, '');
      return <CodeBlock language={lang}>{code}</CodeBlock>;
    }
    return <pre>{children}</pre>;
  },
};

/** 流式输出时：从第一个表格行开始到结尾都当作纯文本，避免表格在逐字更新时反复重排导致跳*/
function splitTableBlockForStreaming(text: string): { before: string; tableAndRest: string } | null {
  const lines = text.split('\n');
  const idx = lines.findIndex((line) => /^\|.+\|/.test(line.trim()));
  if (idx < 0) return null;
  return {
    before: lines.slice(0, idx).join('\n'),
    tableAndRest: lines.slice(idx).join('\n'),
  };
}

/** 打字机光标：单独组件避免随内容重渲染导致闪烁 */
const TypewriterCursor = memo(function TypewriterCursor({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="cursor-blink">▋</span>;
});

const MarkdownContent = memo(
  function MarkdownContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
    const text = content || '';
    const contentRef = React.useRef<HTMLSpanElement>(null);
    

    if (isStreaming) {
      // 流式期间：检测是否有表格
      const tableBlock = splitTableBlockForStreaming(text);
      if (tableBlock) {
        return (
          <span className="msg-content markdown-body msg-content-streaming-root" ref={contentRef}>
            {tableBlock.before && (
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {tableBlock.before}
              </ReactMarkdown>
            )}
            <span style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              color: 'var(--accent-primary)',
              whiteSpace: 'pre',
              lineHeight: 1.6,
              marginTop: '4px',
              opacity: 0.8,
            }}>
              {tableBlock.tableAndRest}
            </span>
          </span>
        );
      }

      // 流式期间无表格：正常 ReactMarkdown 渲染
      return (
        <span className="msg-content markdown-body msg-content-streaming-root" ref={contentRef}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {text}
          </ReactMarkdown>
        </span>
      );
    }

    // 完成后：完整 ReactMarkdown 渲染
    return (
      <span className="msg-content markdown-body" ref={contentRef}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {text}
        </ReactMarkdown>
      </span>
    );
  },
  (prev, next) =>
    prev.content === next.content && prev.isStreaming === next.isStreaming
);

const UI_CTRL_PATTERNS = [/\[上一页\]/, /\[下一页\]/, /\[第\d+\/\d+页\]/, /\[确认导入\]/, /\[取消\]/];

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
        <span style={{ color: 'var(--status-warning)', fontSize: '10px', fontFamily: 'Share Tech Mono', letterSpacing: '2px' }}>
          [ SYSTEM ]
        </span>
        {isLong && (
          <span style={{ color: 'var(--status-warning)', fontSize: '10px', fontFamily: 'Share Tech Mono', opacity: 0.7 }}>
            {collapsed ? '展开' : '收起'}
          </span>
        )}
      </div>
      {collapsed && isLong ? (
        <div style={{ color: 'var(--text-primary)', fontSize: '13px', opacity: 0.8 }}>
          {preview}
          <span style={{ color: 'var(--status-warning)', opacity: 0.5 }}> ···</span>
        </div>
      ) : (
        <div>
          {lines.map((line, i) => (
            <div key={i} style={{
              color: 'var(--text-primary)', fontSize: '13px',
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
  agentPhase: 'idle' | 'thinking' | 'typing';
  speakingMessageId: number | null;
  wsConnected: boolean;
  quickSend: (text: string) => void;
  onContextMenu: (e: React.MouseEvent, msg: ChatMessage, raw: string) => void;
  /** templateId 可选：指定打开哪种思维模式 */
  onOpenSocratic: (templateId?: string) => void;
  /** 点击反思问引用到输入框 */
  onQuoteQuestion: (text: string) => void;
  /** 是否是最后一条助手消息（只有最后一条才显示思维模式按钮*/
  isLastAssistantMsg: boolean;
  /** 成对标签解析出的渲染段（存在时优先渲染） */
  segments?: RenderSegment[];
}

const ChatMessageItem = memo(function ChatMessageItem({
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
  onOpenSocratic,
  onQuoteQuestion,
  isLastAssistantMsg,
  segments,
}: ChatMessageItemProps) {
  const [hoverTime, setHoverTime] = React.useState(false);
  const [thinkMenuOpen, setThinkMenuOpen] = React.useState(false);
  const thinkBtnRef = React.useRef<HTMLButtonElement>(null);
  
  const msgRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const assistantBodyRef = React.useRef<HTMLDivElement>(null);
  
  
  return (
    <div
      ref={msgRef}
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
      <div className="msg-header">
        {msg.role === 'user' ? (
          <span className="msg-label">YOU ▶</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <AmyAvatar isStreaming={!!msg.isStreaming} size={32} />
            <span style={{ color: 'var(--accent)', fontSize: '11px', fontFamily: 'Share Tech Mono', letterSpacing: '2px' }}>AMY</span>
            {isStreamingMsg && agentPhase !== 'idle' && (
              <span className="agent-status-badge">
                {agentPhase === 'thinking' ? '思考中' : '打字中'}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="msg-body" ref={bodyRef}>
        {msg.role === 'assistant' ? (
          msg.isSystemReply ? (
            <SystemMessage text={(textToShow || raw || '').replace(/ · /g, '\n')} />
          ) : (
          <div className="msg-assistant-body" ref={assistantBodyRef}>
            {segments && segments.length > 0 ? (
              <>
                {segments.map((seg, idx) => {
                // 计算 pills 前后的内容长度
                const contentBefore = idx > 0 ? segments.slice(0, idx).reduce((sum, s) => sum + (s.content?.length || 0), 0) : 0;
                const contentAfter = idx < segments.length - 1 ? segments.slice(idx + 1).reduce((sum, s) => sum + (s.content?.length || 0), 0) : 0;
                
                switch (seg.type) {
                  case 'text':
                    return <MarkdownContent key={idx} content={seg.content} isStreaming={isStreamingMsg} />;
                  case 'pills':
                    return seg.options.length > 0 ? (
                      <OptionBox
                        key={idx}
                        messageId={msg.id}
                        options={seg.options}
                        totalPages={undefined}
                        currentPage={1}
                        onPageChange={(page) => onPageChange(msg.id, page)}
                        onSelect={(value) => { if (value && wsConnected) quickSend(value); }}
                        forcePills={true}
                        segmentIndex={idx}
                        contentBefore={contentBefore}
                        contentAfter={contentAfter}
                      />
                    ) : null;
                  case 'checkbox':
                    return seg.options.length > 0 ? (
                      <OptionBox
                        key={idx}
                        messageId={msg.id}
                        options={seg.options}
                        totalPages={undefined}
                        currentPage={1}
                        onPageChange={(page) => onPageChange(msg.id, page)}
                        onSelect={(value) => { if (value && wsConnected) quickSend(value); }}
                        forcePills={false}
                      />
                    ) : null;
                  case 'question':
                    return seg.options.length > 0 ? (
                      <QuestionCards key={idx} questions={seg.options} onQuote={onQuoteQuestion} />
                    ) : null;
                  case 'tasklist':
                    return seg.options.length > 0 ? (
                      <TaskList key={idx} items={seg.options} />
                    ) : null;
                  default:
                    return null;
                }
              })}
                {isStreamingMsg && <TypewriterCursor show />}
              </>
            ) : (
              <>
                {(() => {
                  const cleanedText = filterExpectedEffect(textToShow);
                  const hasInlinePlaceholder = cleanedText.includes('<!--OPTIONS_HERE-->');
                  const showInlineOptions = hasInlinePlaceholder && optionsToShow.length > 0 && !isTaskList && !isReflectiveQuestions;

                  if (showInlineOptions) {
                    const parts = cleanedText.split('<!--OPTIONS_HERE-->');
                    const before = parts[0]?.trim() || '';
                    const after = parts.slice(1).join('').trim();
                    return (
                      <>
                        {before && <MarkdownContent content={before} isStreaming={isStreamingMsg} />}
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
                        {after && <MarkdownContent content={after} isStreaming={isStreamingMsg} />}
                        {isStreamingMsg && <TypewriterCursor show />}
                      </>
                    );
                  }

                  return (
                    <>
                      <MarkdownContent content={cleanedText} isStreaming={isStreamingMsg} />
                      {isStreamingMsg && <TypewriterCursor show />}
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
                {optionsToShow.length > 0 && isTaskList && (
                  <TaskList items={optionsToShow} />
                )}
                {optionsToShow.length > 0 && isReflectiveQuestions && (
                  <QuestionCards
                    questions={optionsToShow}
                    onQuote={onQuoteQuestion}
                  />
                )}
              </>
            )}
            {!isStreamingMsg && !msg.isSystemReply && isLastAssistantMsg && (
              <>
                <button
                  ref={thinkBtnRef}
                  type="button"
                  className="socratic-trigger-btn"
                  onClick={() => setThinkMenuOpen((v) => !v)}
                  title="思维模式：帮你理清思路、做决定、拆解目标"
                >
                  ◈ 思维模式
                </button>
                <ThinkModeMenu
                  anchorRef={thinkBtnRef}
                  visible={thinkMenuOpen}
                  onClose={() => setThinkMenuOpen(false)}
                  onSelect={(templateId) => {
                    setThinkMenuOpen(false);
                    onOpenSocratic(templateId);
                  }}
                />
              </>
            )}
          </div>
          )
        ) : (
          <div className="msg-user-body">
            {msg.imageDataUrl && <img src={msg.imageDataUrl} alt="" className="msg-user-image" />}
            {textToShow && <span className="msg-content msg-user-text">{textToShow}</span>}
          </div>
        )}
      </div>
      <span
        className="msg-timestamp"
        onMouseEnter={() => setHoverTime(true)}
        onMouseLeave={() => setHoverTime(false)}
        style={{
          color: hoverTime ? 'var(--accent)' : 'var(--text-secondary)',
          fontSize: '10px',
          fontFamily: 'Share Tech Mono',
          cursor: 'default',
          transition: 'color 0.2s',
          letterSpacing: '0.5px',
        }}
      >
        {hoverTime ? formatFullTime(msg.timestamp) : formatTime(msg.timestamp)}
      </span>
    </div>
  );
});

function filterExpectedEffect(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .split('\n')
    .filter((line) => {
      if (line.includes('预期效果')) return false;
      return !UI_CTRL_PATTERNS.some((p) => p.test(line.trim()));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

const MAX_VISIBLE_MESSAGES = 50;

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

interface ChatInputAreaProps {
  imagePreview: string | null;
  setImagePreview: React.Dispatch<React.SetStateAction<string | null>>;
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  onSend: (text: string, imageDataUrl: string | null, files?: UploadedFile[]) => void;
  wsConnected: boolean;
  isStreaming: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  injectInputText?: string | null;
  onInjectConsumed?: () => void;
  onClearHistory?: () => void;
}

const ChatInputArea = memo(function ChatInputArea({
  imagePreview,
  setImagePreview,
  uploadedFiles,
  setUploadedFiles,
  onSend,
  wsConnected,
  isStreaming,
  inputRef,
  injectInputText,
  onInjectConsumed,
  onClearHistory,
}: ChatInputAreaProps) {
  const [inputValue, setInputValue] = useState('');
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [inputFocused, setInputFocused] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const quickMenuAnchorRef = useRef<HTMLButtonElement>(null);
  const [inputFlash, setInputFlash] = useState(false);
  const [isRecording] = useState(false);
  const speechRecognitionRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let final = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript;
      }
      if (final) setInputValue((v) => (v ? v + final : final));
    };
    rec.onend = () => {};
    rec.onerror = () => {};
    speechRecognitionRef.current = rec;
    return () => {
      try { rec.abort(); } catch (_) {}
      speechRecognitionRef.current = null;
    };
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text && !imagePreview && uploadedFiles.length === 0) return;
    if (text) {
      setInputHistory((prev) => [text, ...prev.slice(0, 49)]);
      setHistoryIndex(-1);
    }
    setInputFlash(true);
    setTimeout(() => setInputFlash(false), 400);
    onSend(text, imagePreview, uploadedFiles.length > 0 ? uploadedFiles : undefined);
    setInputValue('');
    setImagePreview(null);
    setUploadedFiles([]);
  }, [inputValue, imagePreview, uploadedFiles, wsConnected, onSend, setImagePreview, setUploadedFiles]);

  const handlePickFiles = async () => {
    const r = await ipcRenderer.invoke('open-file-dialog', { allowMultiple: true });
    if (r?.success && r.files) {
      setUploadedFiles((prev) => [...prev, ...r.files]);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleQuickCommand = useCallback((sendText: string) => {
    onSend(sendText, null);
  }, [onSend]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '40px';
    el.style.overflowY = el.scrollHeight > 150 ? 'auto' : 'hidden';
    el.style.height = Math.min(Math.max(el.scrollHeight, 40), 150) + 'px';
  }, [inputValue, inputRef]);

  useEffect(() => {
    if (injectInputText != null) {
      setInputValue(injectInputText);
      setHistoryIndex(-1);
      onInjectConsumed?.();
    }
  }, [injectInputText, onInjectConsumed]);

  return (
    <>
      {imagePreview && (
        <div className="image-preview-wrap">
          <img src={imagePreview} alt="预览" className="image-preview" />
          <button type="button" className="image-remove" onClick={() => setImagePreview(null)}>×</button>
        </div>
      )}
      {uploadedFiles.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px',
          padding: '8px 12px 0 12px',
        }}>
          {uploadedFiles.map((file, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                padding: '8px 10px',
                maxWidth: '200px',
                position: 'relative',
              }}
            >
              <div style={{
                width: '36px', height: '36px',
                background: 'var(--bg-surface)',
                borderRadius: '6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', flexShrink: 0,
                overflow: 'hidden',
              }}>
                {file.mimeType.startsWith('image/') ? (
                  <img
                    src={`data:${file.mimeType};base64,${file.base64}`}
                    alt=""
                    style={{
                      width: '36px', height: '36px',
                      objectFit: 'cover', borderRadius: '6px',
                    }}
                  />
                ) : file.mimeType.includes('pdf') ? '📄' : file.mimeType.includes('audio') ? '🎵' : file.mimeType.includes('video') ? '🎬' : file.name.endsWith('.txt') ? '📝' : '📎'}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{
                  fontSize: '12px', color: 'var(--text-primary)',
                  fontFamily: 'Share Tech Mono, monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  maxWidth: '120px',
                }}>{file.name}</div>
                <div style={{
                  fontSize: '10px', color: 'var(--text-tertiary)',
                  fontFamily: 'Share Tech Mono, monospace',
                }}>{formatFileSize(file.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  width: '16px', height: '16px',
                  background: 'var(--status-error-bg)', border: '1px solid var(--status-error)',
                  borderRadius: '50%', color: 'var(--status-error)',
                  fontSize: '10px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1, padding: 0,
                }}
              >×</button>
            </div>
          ))}
        </div>
      )}
      <div className="chat-input-area">
        <button
          type="button"
          className={`mic-btn-icon mic-btn-disabled ${isRecording ? 'recording' : ''}`}
          disabled
          title="录音功能即将推出"
        >
          {isRecording ? '⏹' : '🎤'}
        </button>
        <button
          ref={quickMenuAnchorRef}
          type="button"
          className="quick-menu-btn"
          onClick={() => setQuickMenuOpen((v) => !v)}
          title="快捷指令"
        >
          ◀        </button>
        <QuickCommandMenu
          anchorRef={quickMenuAnchorRef}
          visible={quickMenuOpen}
          onClose={() => setQuickMenuOpen(false)}
          onSelect={handleQuickCommand}
          onClearHistory={onClearHistory}
        />
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          className={`chat-input chat-input-textarea ${inputFocused ? 'focused' : ''} ${inputFlash ? 'flash' : ''}`}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
          }}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
              return;
            }
            if (e.key === 'ArrowUp' && (inputValue === '' || historyIndex >= 0)) {
              e.preventDefault();
              const newIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
              setHistoryIndex(newIndex);
              setInputValue(inputHistory[newIndex] || '');
              return;
            }
            if (e.key === 'ArrowDown' && historyIndex >= 0) {
              e.preventDefault();
              const newIndex = historyIndex - 1;
              setHistoryIndex(newIndex);
              setInputValue(newIndex >= 0 ? inputHistory[newIndex] : '');
              return;
            }
          }}
          onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
              if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) {
                  const r = new FileReader();
                  r.onload = () => setImagePreview(String(r.result));
                  r.readAsDataURL(file);
                }
                break;
              }
            }
          }}
          placeholder="// INPUT COMMAND OR MESSAGE..."
          rows={1}
        />
        <button type="button" className="attach-btn" title="添加附件（或拖拽文件到此处）" onClick={handlePickFiles}>📎</button>
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={isStreaming || (!inputValue.trim() && !imagePreview && uploadedFiles.length === 0)}
          title={isStreaming ? 'AMY 正在回复...' : !wsConnected ? '连接..' : undefined}
        >
          [ SEND ] →
          </button>
      </div>
    </>
  );
});

interface ChatMessageListProps {
  messages: ChatMessage[];
  displayMessages: ChatMessage[];
  isStreaming: boolean;
  awaitingResponse: boolean;
  streamingContent: string;
  displayedLength: number;
  speakingMessageId: number | null;
  agentPhase: 'idle' | 'thinking' | 'typing';
  wsConnected: boolean;
  quickSend: (text: string) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onMessageContextMenu: (e: React.MouseEvent, msg: ChatMessage, raw: string) => void;
  onOpenSocratic: (templateId?: string) => void;
  onQuoteQuestion: (text: string) => void;
}

const ChatMessageList = function ChatMessageList({
  messages,
  displayMessages,
  isStreaming,
  awaitingResponse,
  streamingContent,
  displayedLength,
  speakingMessageId,
  agentPhase,
  wsConnected,
  quickSend,
  bottomRef,
  onScroll,
  onMessageContextMenu,
  onOpenSocratic,
  onQuoteQuestion,
}: ChatMessageListProps) {
  const [pageByMsgId, setPageByMsgId] = useState<Record<number, number>>({});
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const lastAssistantMsgId = useMemo(() => {
    for (let i = displayMessages.length - 1; i >= 0; i--) {
      const m = displayMessages[i];
      if (m.role === 'assistant' && !m.isStreaming && !m.isSystemReply) {
        return m.id;
      }
    }
    return null;
  }, [displayMessages]);

  const handlePageChange = useCallback((msgId: number, page: number) => {
    setPageByMsgId((prev) => ({ ...prev, [msgId]: page }));
  }, []);

  const showTypingIndicator = (awaitingResponse || isStreaming) && (messages.length === 0 || messages[messages.length - 1]?.role === 'user');

  return (
    <div className="chat-messages" onScroll={onScroll} ref={messagesContainerRef}>
      {messages.length === 0 && (
        <div className="chat-empty">
          <span className="empty-icon">✦</span>
          <span>输入消息开始对..</span>
        </div>
      )}
      {showTypingIndicator && (
        <div className="chat-thinking">
          <span className="msg-label">◆ AMY</span>
          {agentPhase === 'thinking' && <span className="agent-status-badge">思考中</span>}
          <span className="processing-blocks typing-dots">
            <span className="block" />
            <span className="block" />
            <span className="block" />
          </span>
        </div>
      )}
      {displayMessages.map((msg) => {
        const raw = typeof msg.content === 'string'
          ? msg.content
          : String((msg.content as any)?.text ?? (msg.content as any)?.content ?? msg.content ?? '');
        try {
          if (msg.role === 'assistant' && (!raw || raw.trim().length === 0)) {
            console.warn('[ChatTab] render assistant with empty raw content. msg=', {
              id: msg.id,
              role: msg.role,
              isStreaming: msg.isStreaming,
              isSystemReply: msg.isSystemReply,
              ts: msg.timestamp,
            });
          }
        } catch {}
        const isStreamingMsg = msg.role === 'assistant' && msg.isStreaming;
        // 流式消息：用 displayedLength 控制显示进度，实现打字机效果
        const fullContent = isStreamingMsg && streamingContent ? streamingContent : raw;
        // 如果 displayedLength 为 0 但有内容，显示完整内容（避免空白）
        const display = isStreamingMsg && displayedLength > 0 ? fullContent.slice(0, displayedLength) : fullContent;
        const parsed = (msg.role === 'assistant' && !isStreamingMsg)
          ? parseOptionBox(raw)
          : { text: display, options: [] as OptionItem[], totalPages: undefined, isTaskList: false, isReflectiveQuestions: false, forcePills: undefined, segments: undefined };
        const textToShow = msg.role === 'assistant'
          ? (isStreamingMsg && displayedLength > 0 ? display : (parsed.text?.trim() ? parsed.text : raw))
          : display;
        const optionsToShow = parsed.options;
        const totalPages = parsed.totalPages;
        const isTaskList = !!parsed.isTaskList;
        const isReflectiveQuestions = !!parsed.isReflectiveQuestions;
        const forcePills = parsed.forcePills;
        const segmentsToShow = parsed.segments;
        return (
          <ChatMessageItem
            key={msg.id}
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
            onOpenSocratic={onOpenSocratic}
            onQuoteQuestion={onQuoteQuestion}
            isLastAssistantMsg={msg.id === lastAssistantMsgId}
          />
        );
      })}
      <div ref={bottomRef as React.Ref<HTMLDivElement>} />
    </div>
  );
}

const ChatTab: React.FC<ChatTabProps> = ({ messages, setMessages, getNextMessageId, onStatusChange }) => {
  const { settings, setSettings, streamSpeedMs } = useSettings();
  const { permissions } = usePermissions();

  // ===== 所有 useState 集中声明 =====
  const [wsConnected, setWsConnected] = useState(false);
  const [nocturneOnline, setNocturneOnline] = useState(false);
  const [wsReconnecting, setWsReconnecting] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [streamingDisplayContent, setStreamingDisplayContent] = useState('');
  const [modelName, setModelName] = useState('--');
  const [heartbeatPulse, setHeartbeatPulse] = useState(false);
  const [localTime, setLocalTime] = useState('');
  const [localDate, setLocalDate] = useState('');
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
  const [logLines, setLogLines] = useState<string[]>([]);
  const [gatewayRunning, setGatewayRunning] = useState(false);
  const [gatewayManaged, setGatewayManaged] = useState(false);
  const [gatewayPortInUse, setGatewayPortInUse] = useState(false);
  const [windowFocused, setWindowFocused] = useState(true);
  const [speakingMessageId, setSpeakingMessageId] = useState<number | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [isDragging, setDragging] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msgId: number; text: string } | null>(null);
  const [injectInputText, setInjectInputText] = useState<string | null>(null);
  const [showSocratic, setShowSocratic] = useState(false);
  const [agentPhase, setAgentPhase] = useState<'idle' | 'thinking' | 'typing'>('idle');
  const [streak, setStreak] = useState<number>(() => getStreakData().streak);
  const [displayedLength, setDisplayedLength] = useState(0);
  // AI 自动触发的思维引导数据：customRounds（自然格式）templateId（THINK_MODE 标记）
  const [activeSocratic, setActiveSocratic] = useState<{
    rounds?: SocraticRound[];
    templateId?: string;
  } | null>(null);
  // 任务看板显示状态
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // ===== 所有 useRef 集中声明 =====
  const logContainerRef = useRef<HTMLDivElement>(null);
  // xterm 相关 ref 已移除
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingMessageRef = useRef('');
  const typewriterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const displayedLengthRef = useRef(0);
  const userScrolledUp = useRef<boolean>(false);
  const pendingSystemReply = useRef<boolean>(false);
  const streamDoneReceived = useRef<boolean>(false);

  // ===== 所有 useEffect 放在 useState/useRef 之后 =====
  // 通知父组件状态变化
  useEffect(() => {
    onStatusChange?.(wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax);
  }, [wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax, onStatusChange]);


  const handleScreenshot = useCallback(async () => {
    const req = typeof (window as any).require === 'function' ? (window as any).require : null;
    if (!req) return;
    await ipcRenderer.invoke('minimize-for-capture');
    await new Promise((r) => setTimeout(r, 600));
    try {
      const { desktopCapturer } = req('electron');
      const sources = await desktopCapturer.getSources({ types: ['screen'] });
      const source = sources[0];
      if (!source) throw new Error('No screen source');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSourceId: source.id, chromeMediaSource: 'desktop' } } as any,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();
      await new Promise((r) => { video.onloadeddata = r; });
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      stream.getTracks().forEach((t) => t.stop());
      await new Promise<void>((resolve) => {
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            } catch (_) {}
          }
          resolve();
        }, 'image/png');
      });
      const dataUrl = canvas.toDataURL('image/png');
      setImagePreview(dataUrl);
    } catch (e) {
      console.error('Screenshot failed:', e);
    } finally {
      await ipcRenderer.invoke('restore-after-capture');
      setScreenshotFlash(true);
      setTimeout(() => setScreenshotFlash(false), 1500);
    }
  }, []);

  // 周期性检查 Nocturne 记忆系统健康状态
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const checkNocturne = async () => {
      try {
        const result = await ipcRenderer.invoke('nocturne-health');
        setNocturneOnline(result?.ok === true);
      } catch {
        setNocturneOnline(false);
      }
    };
    checkNocturne();
    timer = setInterval(checkNocturne, 30000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        handleScreenshot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleScreenshot]);

  useEffect(() => {
    const onTrigger = () => handleScreenshot();
    ipcRenderer.on('screenshot-trigger', onTrigger);
    return () => { ipcRenderer.removeListener('screenshot-trigger', onTrigger); };
  }, [handleScreenshot]);

  useEffect(() => {
    if (!settings.typingSound && audioRef.current) {
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

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setLocalTime(d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const wd = d.toLocaleDateString('zh-CN', { weekday: 'long' });
      setLocalDate(`${y}.${m}.${day} ${wd}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    ipcRenderer.invoke('openclaw-status').then((r: { connected?: boolean; sessionKey?: string }) => {
      if (r?.connected === true) {
        setWsConnected(true);
      }
      if (r?.sessionKey) setSession(r.sessionKey);
    });

    const handleStatus = (_: any, status: { connected?: boolean; error?: string; model?: string; reconnecting?: boolean }) => {
      try {
        setWsConnected(!!status?.connected);
        setWsReconnecting(status?.reconnecting ?? false);
        setWsError(status?.error ?? null);
        if (status?.model) setModelName(String(status.model));
        if (!status?.connected) {
          setAwaitingResponse(false);
          setAgentPhase('idle');
          userScrolledUp.current = false;
        }
      } catch (e) {
        console.error('[ChatTab] handleStatus error:', e);
      }
    };

    const handleMessage = (_: any, msg: any) => {
      try {
        if (msg && (msg.type === 'status' || msg.connected !== undefined)) {
          const connected = msg.connected === true;
          setWsConnected(connected);
          if (!connected) {
            setAwaitingResponse(false);
            setAgentPhase('idle');
            userScrolledUp.current = false;
          }
        }
        handleIncomingMessage(msg);
      } catch (e) {
        console.error('[ChatTab] handleMessage error:', e);
      }
    };

    ipcRenderer.on('openclaw-status', handleStatus);
    ipcRenderer.on('openclaw-message', handleMessage);

    return () => {
      ipcRenderer.removeListener('openclaw-status', handleStatus);
      ipcRenderer.removeListener('openclaw-message', handleMessage);
    };
  }, []);

  const isDeltaPayload = (data: any): boolean => {
    if (!data) return false;
    const src = data.data ?? data.payload;
    // 检state 字段delta 字段
    if (src?.state === 'delta') return true;
    if (data.delta !== undefined && data.delta !== null) return true;
    return src?.delta !== undefined && src?.delta !== null;
  };

  const extractContent = (data: any): string => {
    if (!data) return '';
    
    // 新格式：{ type: 'event', event: 'chat', payload: { delta: '...', text: '...' } }
    if (data.payload) {
      const payloadContent = data.payload.delta ?? data.payload.text ?? data.payload.content;
      if (typeof payloadContent === 'string') return payloadContent;
    }
    
    // 旧格式兼容
    const raw = data.text ?? data.delta ?? data.content;
    if (typeof raw === 'string') return raw;
    const src = data.data ?? data.payload;
    if (src?.delta !== undefined && src?.delta !== null) return String(src.delta);
    if (src?.text) return String(src.text);
    if (src?.message?.content && Array.isArray(src.message.content)) {
      const parts: string[] = [];
      for (const b of src.message.content) {
        if (!b) continue;
        if (typeof b === 'string') { parts.push(b); continue; }
        const t = (b.type || '').toString().toLowerCase();
        const rawText =
          (typeof b.text === 'string' ? b.text : '') ||
          (typeof b.content === 'string' ? b.content : '') ||
          (typeof b.value === 'string' ? b.value : '') ||
          (typeof b.text?.value === 'string' ? b.text.value : '') ||
          (typeof b.text?.text === 'string' ? b.text.text : '');
        if (!rawText) continue;
        if (!t || t === 'text' || t === 'output_text' || t === 'output-text') {
          parts.push(String(rawText));
        }
      }
      return parts.join('');
    }
    if (typeof src?.message === 'string') return src.message;
    if (src?.message?.text) return String(src.message.text);
    if (src?.message?.content && typeof src.message.content === 'string') return src.message.content;
    if (Array.isArray(src?.blocks)) {
      return src.blocks
        .map((b: any) => String(b?.text ?? b?.content ?? b?.value ?? b?.text?.value ?? ''))
        .filter(Boolean)
        .join('');
    }
    return '';
  };

  const handleIncomingMessage = (
    data: { content?: string; text?: string; delta?: string; done?: boolean; type?: string; phase?: string; event?: string; message?: any; usage?: any; payload?: any; data?: any; connected?: boolean; snapshot?: boolean }
  ) => {
    if (!data || data.type === 'status' || data.connected !== undefined) return;
    if (data.type === 'agent-phase') {
      const phase = data.phase;
      if (phase === 'thinking' || phase === 'typing' || phase === 'idle') setAgentPhase(phase);
      return;
    }
    // 新格式：{type: 'event', event: 'chat', payload: {...}}
    // 旧格式：{type: 'chat', ...}
    if (data.type !== 'chat' && !(data.type === 'event' && data.event === 'chat')) return;

    const u = data.usage;
    if (u) {
      // snapshot=true 时直接覆盖（来自 session.status 查询），否则累加
      const isSnapshot = data.snapshot === true || (data.text === '' && data.done === true && !data.delta);
      if (u.inputTokens != null) {
        if (isSnapshot) setTokenIn(u.inputTokens);
        else setTokenIn((v) => (v ?? 0) + u.inputTokens);
      }
      if (u.outputTokens != null) {
        if (isSnapshot) setTokenOut(u.outputTokens);
        else setTokenOut((v) => (v ?? 0) + u.outputTokens);
      }
      if (u.cost != null) {
        if (isSnapshot) setCost(Number(u.cost));
        else setCost((v) => (v ?? 0) + Number(u.cost));
      }
      if (u.ctxUsed != null) setCtxUsed(u.ctxUsed);
      if (u.ctxMax != null) setCtxMax(u.ctxMax);
      if (u.session != null) setSession(u.session);
      if (u.model != null) setModelName(String(u.model));
    }

    const content = extractContent(data);
    const done = (data.done === true) || (data.payload?.done === true);
    const isDelta = isDeltaPayload(data);

    // DEBUG: 当收到 chat 事件但提取到的文本为空时，打印原始结构（截断）
    try {
      const empty = !content || String(content).trim().length === 0;
      if (empty) {
        const src = data.payload ?? data;
        console.warn('[ChatTab] empty extracted content. type/event=', data.type, data.event);
        console.warn('[ChatTab] empty extracted content. payload keys=', Object.keys(src || {}));
        console.warn('[ChatTab] empty extracted content. raw snippet=', JSON.stringify(data).slice(0, 1200));
      }
    } catch {}

    if (done) {
      setAwaitingResponse(false);
      setAgentPhase('idle');
      userScrolledUp.current = false;
      streamDoneReceived.current = true; // 标记 done 已收
      // 优先streamingMessageRef 里的完整流式内容
      // 只有在流式内容为空时才用 done 消息里的 content
      let finalStreamContent = streamingMessageRef.current || content;
      // 不立刻清空，让打字机跑完
      const systemReply = pendingSystemReply.current;
      pendingSystemReply.current = false;

      // ── 思维引导自动触发检──────────────────────────────────
      if (!systemReply && finalStreamContent) {
        const thinkModeId = detectThinkModeMarker(finalStreamContent);
        if (thinkModeId) {
          // [THINK_MODE:xxx] 标记：剥离标记后显示，延迟弹出面板
          finalStreamContent = stripThinkModeMarker(finalStreamContent);
          setTimeout(() => {
            setActiveSocratic({ templateId: thinkModeId });
            setShowSocratic(true);
          }, 400);
        } else {
          // 检测自然多轮 checkbox 格式（3组及以上）
          const sections = parseSocraticSections(finalStreamContent);
          if (sections) {
            setTimeout(() => {
              setActiveSocratic({ rounds: sections });
              setShowSocratic(true);
            }, 400);
          }
        }
      }
      // ──────────────────────────────────────────────────────────

      // 解析 /status 系统回复，更新状态栏
      const isSystem = systemReply;
      const text = finalStreamContent;
      if (isSystem && text.startsWith('🦞')) {
        const modelMatch = text.match(/Model:\s*(.+)/);
        // 格式1: Tokens: 14.8k / 200k (7%)
        const tokensMatch = text.match(/Tokens:\s*([\d.]+)k?\s*\/\s*([\d.]+)k/i);
        // 格式1: Context: 0/262k (0%)
        const ctxMatch1 = text.match(/Context:\s*([\d.]+)\s*\/\s*([\d.]+)k\s*\((\d+)%\)/i);
        // 格式2: Context: 14.8k tokens
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
          // done 时：保存最终内容，但继续让打字机跑完
          // isStreaming 保持 true，让打字机继续跑
          return prev.map((msg, idx) =>
            idx === prev.length - 1
              ? { ...msg, content: finalStreamContent }
              : msg
          );
        }
        if (finalStreamContent || data.text) {
          const rawText = (finalStreamContent || String(data.text || ''));
          const textContent = rawText.trim();
          // done 包可能只有空白（例如 "\n\n"），此时不新建气泡
          if (!textContent) return prev;
          // 去重：最后一条已是助手消息且内容相同，避免 Gateway 多路转发（如 chat + agent）导致重复
          if (last?.role === 'assistant' && !last.isStreaming && last.content?.trim() === textContent) {
            return prev;
          }
          return [
            ...prev,
            {
              id: getNextMessageId(),
              role: 'assistant' as const,
              content: textContent,
              isStreaming: true, // 保持 true，让打字机跑完
              isSystemReply: systemReply,
              timestamp: Date.now(),
            },
          ];
        }
        return prev;
      });
      // 不立即 setIsStreaming(false)，等打字机跑完再结束
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
      return;
    }

    // delta 阶段：忽略纯空白增量（例如 "\n\n"），避免创建“空白流式消息”导致后续正文合并异常
    const isWhitespaceOnlyDelta = isDelta && typeof content === 'string' && content.trim().length === 0;
    if (isWhitespaceOnlyDelta) return;

    if (content) {
      setAwaitingResponse(false);
      if (isDelta) {
        setAgentPhase('typing');
        streamDoneReceived.current = false; // 开始流式时重置
      }
      
      // delta 模式：追加增量；全量模式：直接替换
      if (isDelta) {
        streamingMessageRef.current += content;
      } else {
        streamingMessageRef.current = content;
      }
      
      const buf = streamingMessageRef.current;
      setStreamingDisplayContent(buf);
      
      if (!buf) return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          return prev.map((msg, idx) =>
            idx === prev.length - 1 ? { ...msg, content: buf } : msg
          );
        }
        if (last?.role === 'assistant' && !last.isStreaming && 
            (last.content ?? '').trim() === buf.trim()) {
          return prev;
        }
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
      setIsStreaming(true);
      if (!userScrolledUp.current) 
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  };

  useEffect(() => {
    const updateFocus = () => setWindowFocused(document.hasFocus());
    window.addEventListener('focus', updateFocus);
    window.addEventListener('blur', updateFocus);
    document.addEventListener('visibilitychange', updateFocus);
    updateFocus();
    return () => {
      window.removeEventListener('focus', updateFocus);
      window.removeEventListener('blur', updateFocus);
      document.removeEventListener('visibilitychange', updateFocus);
    };
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
    if (!settings.typingSound || !msg.content) return;
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

    // 构建消息内容
    let contentToSend = text;
    let fileContent = '';

    if (files && files.length > 0) {
      fileContent = '\n\n[上传的文件]\n' + files.map((f, i) => {
        const size = f.size < 1024 ? `${f.size}B` : f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(1)}KB` : `${(f.size / (1024 * 1024)).toFixed(1)}MB`;
        if (f.isText && f.content) {
          return `\`\`\`${f.ext}\n${f.content}\n\`\`\``;
        } else {
          return `[${i + 1}] ${f.name} (${size}) - 二进制文件`;
        }
      }).join('\n---\n');
    }

    if (imageDataUrl) {
      contentToSend = (text ? `${text}\n` : '') + '[用户发送了一张图片，请根据上下文回复]';
    }

    const fullContent = contentToSend + fileContent;

    // 权限检查与危险命令拦截
    const permCheck = checkPermission(fullContent, permissions);
    if (!permCheck.allowed) {
      window.alert(permCheck.reason || '此操作已被权限设置拦截');
      return;
    }
    const dangerMatch = getDangerMatch(fullContent);
    if (dangerMatch) {
      const ok = window.confirm(
        `危险操作警告\n\n检测到: ${dangerMatch.desc}\n级别: ${dangerMatch.level}\n\n确认仍要发送此消息？`
      );
      if (!ok) return;
    }

    pendingSystemReply.current = !imageDataUrl && !files?.length && isSystemCommand(fullContent);
    const cmdIsSystem = pendingSystemReply.current;
    streamingMessageRef.current = '';
    if (!cmdIsSystem) {
      setAwaitingResponse(true);
      setAgentPhase('thinking');
    }
    userScrolledUp.current = false;
    setStreak(touchStreak());
    setMessages((prev) => [
      ...prev,
      {
        id: getNextMessageId(),
        role: 'user' as const,
        content: fullContent,
        timestamp: Date.now(),
        imageDataUrl: imageDataUrl || undefined,
        files: files,
      },
    ]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 30);

    // 发送到 OpenClaw，包含图片和文件
    const result = await ipcRenderer.invoke('openclaw-send', {
      content: fullContent,
      imageDataUrl: imageDataUrl,
      files: files,
    });
    if (!result?.success && !cmdIsSystem) {
      setAwaitingResponse(false);
      console.warn('[ChatTab] Send failed:', result?.error);
    }
  }, [wsConnected, getNextMessageId, permissions]);

  const handleFileAttach = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    try {
      const converted = await Promise.all(files.map(fileToUploadedFile));
      setUploadedFiles((prev) => [...prev, ...converted]);
    } catch (e) {
      console.error('[ChatTab] File attach failed:', e);
    }
  }, []);

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

    pendingSystemReply.current = isSystemCommand(content.trim());
    streamingMessageRef.current = '';
    if (!pendingSystemReply.current) {
      setAwaitingResponse(true);
      setAgentPhase('thinking');
    }
    userScrolledUp.current = false;
    setMessages((prev) => [
      ...prev,
      { id: getNextMessageId(), role: 'user', content: content.trim(), timestamp: Date.now() },
    ]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 30);
    ipcRenderer.invoke('openclaw-send', content.trim());
  }, [wsConnected, getNextMessageId, permissions]);

  const handleClearHistory = useCallback(() => {
    if (!window.confirm('确认清空所有聊天记录？')) return;
    setMessages([]);
    (window as any).electronAPI?.chatHistorySave?.([]);
  }, []);

  useEffect(() => {
    // 查询 Gateway 初始状态
    ipcRenderer.invoke('gateway-status').then((s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
      setGatewayRunning(s.running);
      setGatewayManaged(s.managed);
      setGatewayPortInUse(s.portInUse ?? false);
    });
    const onGwStatus = (_: any, s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
      setGatewayRunning(s.running);
      setGatewayManaged(s.managed);
      setGatewayPortInUse(s.portInUse ?? false);
    };
    ipcRenderer.on('gateway-status', onGwStatus);
    
    // 监听日志更新（纯 DOM 方式）
    const onLogLines = (_: any, lines: string[]) => {
      setLogLines((prev) => {
        const updated = [...prev, ...lines];
        return updated.slice(-50); // 只保留最新50条
      });
      // 自动滚动到底部
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
    };
    ipcRenderer.on('openclaw-log-lines', onLogLines);
    
    return () => {
      ipcRenderer.removeListener('gateway-status', onGwStatus);
      ipcRenderer.removeListener('openclaw-log-lines', onLogLines);
    };
  }, []);

  const handleChatScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 100);
    userScrolledUp.current = distFromBottom > 200;
  }, []);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg?.isStreaming || lastMsg.role !== 'assistant') {
      if (typewriterTimerRef.current) {
        clearInterval(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
      setDisplayedLength(0);
      displayedLengthRef.current = 0;
      streamDoneReceived.current = false;
      return;
    }

    // 打字机效果已启动，跳过
    if (typewriterTimerRef.current) return;

    typewriterTimerRef.current = setInterval(() => {
      // ref 追踪内容长度
      const fullLen = streamingMessageRef.current.length;
      const current = displayedLengthRef.current;
      
      if (current >= fullLen) {
        // 打字机跑完了
        if (streamDoneReceived.current) {
          // done 已收到，现在可以结束 streaming
          clearInterval(typewriterTimerRef.current!);
          typewriterTimerRef.current = null;
          setDisplayedLength(0);
          displayedLengthRef.current = 0;
          streamingMessageRef.current = '';
          setStreamingDisplayContent('');
          streamDoneReceived.current = false;
          setIsStreaming(false);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant' && last?.isStreaming) {
              return prev.map((msg, idx) =>
                idx === prev.length - 1 ? { ...msg, isStreaming: false } : msg
              );
            }
            return prev;
          });
        }
        return;
      }
      
      // 内容越多、落后越多，每次推进越快，保证能追上
      const CHARS_PER_TICK = Math.max(3, Math.ceil((fullLen - current) / 20));
      const next = Math.min(current + CHARS_PER_TICK, fullLen);
      displayedLengthRef.current = next;
      setDisplayedLength(next);
      
      if (settings.typingSound) playClickSound();
      if (!userScrolledUp.current) {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      }
    }, streamSpeedMs);

    return () => {
      if (typewriterTimerRef.current) {
        clearInterval(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
    };
  }, [messages, streamSpeedMs, settings.typingSound]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          const r = new FileReader();
          r.onload = () => setImagePreview(r.result as string);
          r.readAsDataURL(blob);
        }
        break;
      }
    }
  }, []);

  const socraticContextText = useMemo(() => {
    const recent = messages.slice(-6);
    const lastUser = [...recent].reverse().find((m) => m.role === 'user');
    const lastAI   = [...recent].reverse().find((m) => m.role === 'assistant');
    return [lastUser?.content, lastAI?.content].filter(Boolean).join(' ');
  }, [messages]);

  return (
    <>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setContextMenu(null)} />
          <div
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 100,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-light)',
              borderRadius: '6px',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-lg)',
              minWidth: '160px',
            }}
          >
            {[
              { icon: '⎘', label: '复制消息', action: () => navigator.clipboard.writeText(contextMenu.text), danger: false },
              { icon: '↺', label: '重新发送', action: () => { setInjectInputText(contextMenu.text); setContextMenu(null); }, danger: false },
              { icon: '✕', label: '删除消息', action: () => { setMessages((prev) => prev.filter((m) => m.id !== contextMenu.msgId)); setContextMenu(null); }, danger: true },
            ].map((item) => (
              <div
                key={item.label}
                onClick={() => { item.action(); setContextMenu(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 16px', cursor: 'pointer',
                  color: item.danger ? 'var(--status-error)' : 'var(--text-primary)',
                  fontSize: '12px', fontFamily: 'Share Tech Mono',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? 'var(--status-error-bg)' : 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ fontSize: '14px' }}>{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </>
      )}
    <div
      className="chat-tab"
      onPaste={handlePaste}
      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer?.types?.includes('Files')) setDragging(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length > 0) handleFileAttach(files);
      }}
    >
      <div className={`chat-section ${isDragging ? 'drag-over' : ''}`} style={{ position: 'relative' }}>
        {isDragging && (
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
              fontSize: '16px',
              fontFamily: 'Share Tech Mono, monospace',
              letterSpacing: '3px',
              textShadow: '0 0 10px var(--glow-color)',
            }}>⬇ DROP FILES HERE</span>
          </div>
        )}
        <div className="section-header">
          <div className="header-left">
            <span className="section-title">◆ OpenClaw Chat</span>
            <button
              type="button"
              className={`voice-toggle ${settings.typingSound ? 'on' : 'off'}`}
              onClick={() => setSettings((s) => ({ ...s, typingSound: !s.typingSound }))}
              title={settings.typingSound ? '点击关闭打字音效' : '点击开启打字音效'}
            >
              {settings.typingSound ? '♪ VOICE ON' : '♪ VOICE OFF'}
            </button>
            <button
              type="button"
              className="voice-toggle"
              onClick={() => setShowSettings(true)}
              title="设置"
            >
              ⚙ SETTINGS
            </button>
          </div>
          <span className={`ws-status ${wsConnected ? 'connected' : 'disconnected'}`}>
            {wsConnected && <span className="status-dot" />}
            {wsConnected ? 'CONNECTED' : wsReconnecting ? '重连..' : wsError || 'DISCONNECTED'}
          </span>
        </div>

        <SetupGuide
          wsConnected={wsConnected}
          gatewayRunning={gatewayRunning || gatewayPortInUse}
          onStartGateway={() => {
            ipcRenderer.invoke('start-gateway').then(() => {
              ipcRenderer.invoke('gateway-status').then((s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
                setGatewayRunning(s.running);
                setGatewayManaged(s.managed);
                setGatewayPortInUse(s.portInUse ?? false);
              });
            });
          }}
          onOpenSettings={() => setShowSettings(true)}
        />

        <ChatMessageList
          messages={messages}
          displayMessages={messages.length > MAX_VISIBLE_MESSAGES ? messages.slice(-MAX_VISIBLE_MESSAGES) : messages}
          isStreaming={isStreaming}
          awaitingResponse={awaitingResponse}
          streamingContent={streamingDisplayContent}
          displayedLength={displayedLength}
          speakingMessageId={speakingMessageId}
          agentPhase={agentPhase}
          wsConnected={wsConnected}
          quickSend={quickSend}
          bottomRef={bottomRef}
          onScroll={handleChatScroll}
          onMessageContextMenu={(e, msg, raw) => setContextMenu({ x: e.clientX, y: e.clientY, msgId: msg.id, text: raw })}
          onOpenSocratic={(templateId?: string) => {
            if (templateId) setActiveSocratic({ templateId });
            setShowSocratic(true);
          }}
          onQuoteQuestion={(text: string) => setInjectInputText(text)}
        />
        {showSocratic && (
          <SocraticPanel
            inline
            contextText={socraticContextText}
            customRounds={activeSocratic?.rounds}
            suggestedTemplateId={activeSocratic?.templateId}
            onComplete={(text) => {
              setInjectInputText(text);
              setShowSocratic(false);
              setActiveSocratic(null);
            }}
            onClose={() => {
              setShowSocratic(false);
              setActiveSocratic(null);
            }}
          />
        )}
        {showScrollBtn && (
          <div
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 0',
              cursor: 'pointer',
              gap: '2px',
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
          imagePreview={imagePreview}
          setImagePreview={setImagePreview}
          uploadedFiles={uploadedFiles}
          setUploadedFiles={setUploadedFiles}
          onSend={sendMessage}
          wsConnected={wsConnected}
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
            fontSize: '12px',
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
                background: wsConnected ? 'var(--status-success)' : 'var(--status-error)',
                animation: wsConnected ? 'pulse-green 2s infinite' : 'pulse-red 1s infinite',
              }}
            />
            <span
              style={{
                fontSize: '9px',
                color: 'var(--text-tertiary)',
                fontFamily: 'Share Tech Mono',
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
                background: nocturneOnline ? 'var(--status-info)' : 'var(--status-error)',
                animation: nocturneOnline ? 'pulse-blue 3s infinite' : 'pulse-red 1s infinite',
              }}
            />
            <span
              style={{
                fontSize: '9px',
                color: 'var(--text-tertiary)',
                fontFamily: 'Share Tech Mono',
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
                fontSize: '20px',
                color: 'var(--text-primary)',
                fontFamily: 'Share Tech Mono',
                fontWeight: 500,
                letterSpacing: '1px',
                lineHeight: 1,
              }}
            >
              {localTime || '--:--'}
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
                fontSize: '12px',
                color: 'var(--text-secondary)',
                fontFamily: 'Share Tech Mono',
                letterSpacing: '0.5px',
                lineHeight: 1,
              }}
            >
              {localDate || ''}
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
          <HeartbeatWave connected={wsConnected} pulse={heartbeatPulse} />
        </div>

        {/* 3. 系统信息 */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          padding: '4px 12px',
          borderBottom: '1px solid var(--border-subtle)',
          gap: '8px',
          fontSize: '10px',
          fontFamily: 'Share Tech Mono',
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
              if (gatewayRunning) {
                if (gatewayManaged) {
                  ipcRenderer.invoke('stop-gateway');
                  ipcRenderer.invoke('gateway-status').then((s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
                    setGatewayRunning(s.running);
                    setGatewayManaged(s.managed);
                    setGatewayPortInUse(s.portInUse ?? false);
                  });
                }
              } else {
                ipcRenderer.invoke('start-gateway').then(() => {
                  ipcRenderer.invoke('gateway-status').then((s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
                    setGatewayRunning(s.running);
                    setGatewayManaged(s.managed);
                    setGatewayPortInUse(s.portInUse ?? false);
                  });
                });
              }
            }}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: '10px',
              fontFamily: 'Share Tech Mono',
              background: 'transparent',
              borderRadius: '2px',
              cursor: 'pointer',
              letterSpacing: '1px',
              transition: 'all 0.15s',
              border: `1px solid ${gatewayRunning ? 'var(--status-error)' : 'var(--status-success)'}`,
              color: gatewayRunning ? 'var(--status-error)' : 'var(--status-success)',
            }}
          >
            {gatewayRunning ? '■ 停止' : '▶ 启动'}
          </button>
          <button
            type="button"
            onClick={() => {
              ipcRenderer.invoke('gateway-clear-port-and-start').then(() => {
                ipcRenderer.invoke('gateway-status').then((s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
                  setGatewayRunning(s.running);
                  setGatewayManaged(s.managed);
                  setGatewayPortInUse(s.portInUse ?? false);
                });
              });
            }}
            style={{
              flex: 1,
              padding: '4px 0',
              fontSize: '10px',
              fontFamily: 'Share Tech Mono',
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
              fontSize: '10px',
              fontFamily: 'Share Tech Mono',
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
              fontSize: '10px',
              fontFamily: 'Share Tech Mono',
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
          <div className="section-header gw-log-title-row">
            <span className="section-title">
              Gateway 日志
            </span>
            <div className="gw-controls gw-controls-log">
              <button
                type="button"
                className="terminal-test-btn gw-btn-export"
                onClick={async () => {
                  if (logLines.length === 0) return;
                  const content = logLines.join('\n');
                  const blob = new Blob([content], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `gateway-log-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                title="导出日志"
              >
                导出
              </button>
              <button
                type="button"
                className="terminal-test-btn gw-btn-clear"
                onClick={() => {
                  setLogLines([]);
                }}
                title="清空日志"
              >
                清空
              </button>
            </div>
          </div>
          <div ref={logContainerRef} className="log-terminal-dom" tabIndex={-1}>
            {logLines.length === 0 ? (
              <div className="log-empty">[LOG] 等待 Gateway 日志...</div>
            ) : (
              logLines.map((line, i) => {
                const match = line.match(/^(\[[^\]]+\])(.*)/);
                const colorClass = getLogColorClass(line);
                const levelClass = `log-${getLogLevel(line)}`;
                const combinedClass = `log-line ${levelClass} ${colorClass}`.trim();
                if (match) {
                  return (
                    <div key={i} className={combinedClass}>
                      <strong style={{ color: 'inherit', fontWeight: 900, textShadow: '0 0 8px currentColor' }}>{match[1]}</strong>
                      {match[2]}
                    </div>
                  );
                }
                return (
                  <div key={i} className={combinedClass}>
                    {line}
                  </div>
                );
              })
            )}
          </div>
        </div>
        {/* 内容区域结束 */}
      </div>
      {/* right-panel 结束 */}
      </div>
    {/* chat-tab 结束 */}
    </div>

    {screenshotFlash && (
      <div className="screenshot-flash-overlay">
        <span className="screenshot-flash-text">已截图</span>
      </div>
    )}
  </>
  );
};

export default ChatTab;
