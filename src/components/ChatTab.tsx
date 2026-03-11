import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// xterm 已完全移除以修复闪退问题
import '../styles/ChatTab.css';
import { parseOptionBox, type OptionItem } from '../utils/optionBoxParser';
import OptionBox from './OptionBox';
import SettingsPanel from './SettingsPanel';
import CodeBlock from './CodeBlock';
import QuickCommandMenu from './QuickCommandMenu';
import HeartbeatWave from './HeartbeatWave';
import AmyAvatar from './AmyAvatar';
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
const DEFAULT_LOG_PATH = 'C:\\Users\\zilong_wu\\.openclaw\\logs\\gateway.log';

// 已改用 DOM 渲染，此函数保留供参考
// function getLogAnsiColor(line: string): string {
//   if (line.startsWith('[ERR]') || /\[ERROR\]/i.test(line)) return '\x1b[38;2;255;68;68m';
//   if (/\[WARN\]/i.test(line)) return '\x1b[38;2;255;170;0m';
//   if (/\[LOG\]/i.test(line)) return '\x1b[38;2;0;204;204m';
//   return '\x1b[32m';
// }

// DOM 日志级别判断 - 优先解析原始 JSON 的 level 字段
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

/** 判断是否为 Gateway 直接处理的系统命令（不等待 AMY 回复） */
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
  table: ({ children }) => (
    <table style={{
      borderCollapse: 'collapse',
      width: '100%',
      margin: '8px 0',
      fontSize: '13px',
    }}>{children}</table>
  ),
  th: ({ children }) => (
    <th style={{
      border: '1px solid #1a4d2a',
      padding: '6px 10px',
      background: '#0a1f0a',
      color: '#00ff88',
      textAlign: 'left',
    }}>{children}</th>
  ),
  td: ({ children }) => (
    <td style={{
      border: '1px solid #0d2d0d',
      padding: '5px 10px',
      color: '#00cc66',
    }}>{children}</td>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-') || String(children).includes('\n');
    if (!isBlock) {
      return (
        <code style={{
          background: '#0a1a0a', color: '#00ff88',
          padding: '1px 5px', borderRadius: '3px',
          fontSize: '12px', fontFamily: 'Share Tech Mono',
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
            background: '#050f05',
            border: '1px solid #0d2d0d',
            borderBottom: 'none',
            borderRadius: '4px 4px 0 0',
            padding: '4px 12px',
          }}>
            <span style={{ fontSize: '10px', color: '#00aa44', fontFamily: 'Share Tech Mono', letterSpacing: '1px' }}>
              {(className?.replace('language-', '') || 'code').toUpperCase()} · {lines} lines
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {isLong && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #00662a',
                    borderRadius: '3px',
                    color: '#00cc55',
                    fontSize: '10px', fontFamily: 'Share Tech Mono',
                    padding: '2px 8px', cursor: 'pointer', letterSpacing: '1px',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00ff41'; e.currentTarget.style.color = '#00ff41'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#00662a'; e.currentTarget.style.color = '#00cc55'; }}
                >
                  {expanded ? '▲ 收起' : '▼ 展开'}
                </button>
              )}
              <button
                onClick={handleCopy}
                style={{
                  background: copied ? 'rgba(0,255,136,0.1)' : 'transparent',
                  border: '1px solid',
                  borderColor: copied ? '#00ff88' : '#00662a',
                  borderRadius: '3px',
                  color: copied ? '#00ff88' : '#00cc55',
                  fontSize: '10px', fontFamily: 'Share Tech Mono',
                  padding: '2px 8px', cursor: 'pointer', letterSpacing: '1px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { if (!copied) { e.currentTarget.style.borderColor = '#00ff41'; e.currentTarget.style.color = '#00ff41'; } }}
                onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.borderColor = '#00662a'; e.currentTarget.style.color = '#00cc55'; } }}
              >
                {copied ? '✓ COPIED' : 'COPY'}
              </button>
            </div>
          </div>
          <pre style={{
            background: '#050f05',
            border: '1px solid #0d2d0d',
            borderRadius: '0 0 4px 4px',
            padding: '12px',
            overflow: 'auto',
            margin: 0,
            maxHeight: expanded ? 'none' : '220px',
            transition: 'max-height 0.3s ease',
            position: 'relative',
          }}>
            <code style={{ color: '#00ff41', fontSize: '12px', fontFamily: 'Share Tech Mono' }}>
              {code}
            </code>
            {isLong && !expanded && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: '40px',
                background: 'linear-gradient(transparent, #050f05)',
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

const MarkdownContent = memo(function MarkdownContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const text = content || '';
  const isDone = !isStreaming;

  // 流式输出时，未完成的表格用纯文本显示
  if (!isDone) {
    const lines = text.split('\n');
    const hasIncompleteTable = lines.some((l) => l.trim().startsWith('|'))
      && !lines.some((l) => l.trim().match(/^\|[-|]+\|$/));
    if (hasIncompleteTable) {
      return (
        <span className="msg-content markdown-body">
          <span style={{ color: '#00cc66', whiteSpace: 'pre-wrap' }}>{text}</span>
          <span className="cursor-blink">▋</span>
        </span>
      );
    }
  }

  return (
    <span className="msg-content markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </ReactMarkdown>
      {isStreaming && <span className="cursor-blink">▋</span>}
    </span>
  );
});

const UI_CTRL_PATTERNS = [/\[上一页\]/, /\[下一页\]/, /\[第\d+\/\d+页\]/, /\[确认导入\]/, /\[取消\]/];

const SystemMessage = ({ text }: { text: string }) => {
  const [collapsed, setCollapsed] = React.useState(true);
  const lines = text.split('\n').filter((l) => l.trim());
  const preview = lines[0] || '';
  const isLong = lines.length > 3;

  return (
    <div style={{
      background: '#001a00',
      borderLeft: '3px solid #ffaa00',
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
        <span style={{ color: '#ffaa00', fontSize: '10px', fontFamily: 'Share Tech Mono', letterSpacing: '2px' }}>
          [ SYSTEM ]
        </span>
        {isLong && (
          <span style={{ color: '#ffaa00', fontSize: '10px', fontFamily: 'Share Tech Mono', opacity: 0.7 }}>
            {collapsed ? '▼ 展开' : '▲ 收起'}
          </span>
        )}
      </div>
      {collapsed && isLong ? (
        <div style={{ color: '#00cc66', fontSize: '13px', opacity: 0.8 }}>
          {preview}
          <span style={{ color: '#ffaa00', opacity: 0.5 }}> ···</span>
        </div>
      ) : (
        <div>
          {lines.map((line, i) => (
            <div key={i} style={{
              color: '#00cc66', fontSize: '13px',
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
  totalPages: number | undefined;
  currentPage: number;
  onPageChange: (msgId: number, page: number) => void;
  isStreamingMsg: boolean;
  speakingMessageId: number | null;
  wsConnected: boolean;
  quickSend: (text: string) => void;
  onContextMenu: (e: React.MouseEvent, msg: ChatMessage, raw: string) => void;
}

const ChatMessageItem = memo(function ChatMessageItem({
  msg,
  textToShow,
  raw,
  optionsToShow,
  totalPages,
  currentPage,
  onPageChange,
  isStreamingMsg,
  speakingMessageId,
  wsConnected,
  quickSend,
  onContextMenu,
}: ChatMessageItemProps) {
  const [hoverTime, setHoverTime] = React.useState(false);
  return (
    <div
      className={`chat-message ${msg.role} ${msg.isSystemReply ? 'system-reply' : ''} ${speakingMessageId === msg.id ? 'speaking' : ''}`}
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
          <span className="msg-label">YOU ◈</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <AmyAvatar isStreaming={!!msg.isStreaming} size={32} />
            <span style={{ color: '#00ff88', fontSize: '11px', fontFamily: 'Share Tech Mono', letterSpacing: '2px' }}>AMY</span>
          </div>
        )}
      </div>
      <div className="msg-body">
        {msg.role === 'assistant' ? (
          msg.isSystemReply ? (
            <SystemMessage text={(textToShow || raw || '').replace(/ · /g, '\n')} />
          ) : (
          <div className="msg-assistant-body">
            <MarkdownContent content={filterExpectedEffect(textToShow)} isStreaming={isStreamingMsg} />
            {optionsToShow.length > 0 && (
              <OptionBox
                messageId={msg.id}
                options={optionsToShow}
                totalPages={totalPages}
                currentPage={currentPage}
                onPageChange={(page) => onPageChange(msg.id, page)}
                onSelect={(value) => {
                  if (value && wsConnected) quickSend(value);
                }}
              />
            )}
          </div>
          )
        ) : (
          <div className="msg-user-body">
            {msg.imageDataUrl && <img src={msg.imageDataUrl} alt="" className="msg-user-image" />}
            {textToShow && <span className="msg-content msg-user-text">{textToShow}</span>}
          </div>
        )}
        {msg.isStreaming && msg.role === 'assistant' && <span className="cursor-blink">▋</span>}
      </div>
      <span
        className="msg-timestamp"
        onMouseEnter={() => setHoverTime(true)}
        onMouseLeave={() => setHoverTime(false)}
        style={{
          color: hoverTime ? '#00ff88' : '#00772a',
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
  isAlwaysOnTop?: boolean;
  onToggleAlwaysOnTop?: () => void;
  onStatusChange?: (wsConnected: boolean, isStreaming: boolean, modelName?: string, tokenIn?: number | null, tokenOut?: number | null, ctxUsed?: number | null, ctxMax?: number | null) => void;
}

const MAX_VISIBLE_MESSAGES = 50;

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
    if ((!text && !imagePreview && uploadedFiles.length === 0) || !wsConnected) return;
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
                background: '#0a1a0a',
                border: '1px solid #1a4d2a',
                borderRadius: '8px',
                padding: '8px 10px',
                maxWidth: '200px',
                position: 'relative',
              }}
            >
              <div style={{
                width: '36px', height: '36px',
                background: '#0d2d0d',
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
                  fontSize: '12px', color: '#00ff88',
                  fontFamily: 'Share Tech Mono, monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  maxWidth: '120px',
                }}>{file.name}</div>
                <div style={{
                  fontSize: '10px', color: '#006620',
                  fontFamily: 'Share Tech Mono, monospace',
                }}>{formatFileSize(file.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => removeFile(i)}
                style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  width: '16px', height: '16px',
                  background: '#1a0000', border: '1px solid #440000',
                  borderRadius: '50%', color: '#ff4444',
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
          {isRecording ? '●' : '🎤'}
        </button>
        <button
          ref={quickMenuAnchorRef}
          type="button"
          className="quick-menu-btn"
          onClick={() => setQuickMenuOpen((v) => !v)}
          title="快捷指令"
        >
          ⚡
        </button>
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
          disabled={!wsConnected || isStreaming || (!inputValue.trim() && !imagePreview && uploadedFiles.length === 0)}
          title={isStreaming ? 'AMY 正在回复...' : undefined}
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
  displayedStreamingLength: number;
  speakingMessageId: number | null;
  wsConnected: boolean;
  quickSend: (text: string) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onMessageContextMenu: (e: React.MouseEvent, msg: ChatMessage, raw: string) => void;
}

const ChatMessageList = memo(function ChatMessageList({
  messages,
  displayMessages,
  isStreaming,
  awaitingResponse,
  displayedStreamingLength,
  speakingMessageId,
  wsConnected,
  quickSend,
  bottomRef,
  onScroll,
  onMessageContextMenu,
}: ChatMessageListProps) {
  const [pageByMsgId, setPageByMsgId] = useState<Record<number, number>>({});

  const handlePageChange = useCallback((msgId: number, page: number) => {
    setPageByMsgId((prev) => ({ ...prev, [msgId]: page }));
  }, []);

  const showTypingIndicator = (awaitingResponse || isStreaming) && (messages.length === 0 || messages[messages.length - 1]?.role === 'user');

  return (
    <div className="chat-messages" onScroll={onScroll}>
      {messages.length === 0 && (
        <div className="chat-empty">
          <span className="empty-icon">◈</span>
          <span>输入消息开始对话...</span>
        </div>
      )}
      {showTypingIndicator && (
        <div className="chat-thinking">
          <span className="msg-label">◈ AMY</span>
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
        const isStreamingMsg = msg.role === 'assistant' && msg.isStreaming;
        const display = isStreamingMsg
          ? raw.slice(0, displayedStreamingLength)
          : raw;
        const parsed = msg.role === 'assistant' && !msg.isStreaming ? parseOptionBox(raw) : { text: display, options: [], totalPages: undefined };
        const textToShow = msg.role === 'assistant' && !msg.isStreaming ? parsed.text : display;
        const optionsToShow = parsed.options;
        const totalPages = parsed.totalPages;
        return (
          <ChatMessageItem
            key={msg.id}
            msg={msg}
            raw={raw}
            textToShow={textToShow}
            optionsToShow={optionsToShow}
            totalPages={totalPages}
            currentPage={pageByMsgId[msg.id] ?? 1}
            onPageChange={handlePageChange}
            isStreamingMsg={!!msg.isStreaming}
            speakingMessageId={speakingMessageId}
            wsConnected={wsConnected}
            quickSend={quickSend}
            onContextMenu={onMessageContextMenu}
          />
        );
      })}
      <div ref={bottomRef as React.Ref<HTMLDivElement>} />
    </div>
  );
});

const ChatTab: React.FC<ChatTabProps> = ({ messages, setMessages, getNextMessageId, isAlwaysOnTop = false, onToggleAlwaysOnTop, onStatusChange }) => {
  const { settings, setSettings, streamSpeedMs } = useSettings();
  const { permissions } = usePermissions();

  // ===== 所有 useState 集中声明 =====
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReconnecting, setWsReconnecting] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [displayedStreamingLength, setDisplayedStreamingLength] = useState(0);
  const [modelName, setModelName] = useState('--');
  const [heartbeatPulse, setHeartbeatPulse] = useState(false);
  const [localTime, setLocalTime] = useState('');
  const [localDate, setLocalDate] = useState('');
  const [tokenIn, setTokenIn] = useState<number | null>(null);
  const [tokenOut, setTokenOut] = useState<number | null>(null);
  const [ctxUsed, setCtxUsed] = useState<number | null>(null);
  const [ctxMax, setCtxMax] = useState<number | null>(null);
  const [, setCost] = useState<number | null>(null);
  const [session, setSession] = useState<string | null>(null);
  const [apiKeyInfo, setApiKeyInfo] = useState<string>('--');
  const [thinkMode, setThinkMode] = useState<string>('off');
  const [runtimeMode, setRuntimeMode] = useState<string>('direct');
  const [compactions, setCompactions] = useState<number | null>(null);
  const [queueInfo, setQueueInfo] = useState<string>('--');
  const [, setLogPath] = useState(DEFAULT_LOG_PATH);
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

  // ===== 所有 useRef 集中声明 =====
  const logContainerRef = useRef<HTMLDivElement>(null);
  // xterm 相关 ref 已移除
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamingMessageRef = useRef('');
  const typewriterTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userScrolledUp = useRef<boolean>(false);
  const pendingSystemReply = useRef<boolean>(false);

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
        ipcRenderer.invoke('start-log-watch', p || DEFAULT_LOG_PATH);
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
        console.log('[ChatTab] Initial status: connected');
        setWsConnected(true);
      }
      if (r?.sessionKey) setSession(r.sessionKey);
    });

    const handleStatus = (_: any, status: { connected?: boolean; error?: string; model?: string; reconnecting?: boolean }) => {
      try {
        console.log('[CTX DEBUG] openclaw-status event:', JSON.stringify(status));
        setWsConnected(!!status?.connected);
        setWsReconnecting(status?.reconnecting ?? false);
        setWsError(status?.error ?? null);
        if (status?.model) setModelName(String(status.model));
        if (!status?.connected) {
          setAwaitingResponse(false);
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
          console.log('[ChatTab] Status from message:', { connected, msg });
          setWsConnected(connected);
          if (!connected) {
            setAwaitingResponse(false);
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
    if (data.delta !== undefined && data.delta !== null) return true;
    const src = data.data ?? data.payload;
    return src?.delta !== undefined && src?.delta !== null;
  };

  const extractContent = (data: any): string => {
    if (!data) return '';
    const raw = data.text ?? data.delta ?? data.content;
    if (typeof raw === 'string') return raw;
    const src = data.data ?? data.payload;
    if (src?.delta !== undefined && src?.delta !== null) return String(src.delta);
    if (src?.text) return String(src.text);
    if (src?.message?.content && Array.isArray(src.message.content)) {
      return src.message.content
        .filter((b: any) => b?.type === 'text' && b?.text)
        .map((b: any) => String(b.text))
        .join('');
    }
    if (typeof src?.message === 'string') return src.message;
    if (src?.message?.text) return String(src.message.text);
    if (src?.message?.content && typeof src.message.content === 'string') return src.message.content;
    if (Array.isArray(src?.blocks)) {
      return src.blocks.map((b: any) => String(b?.text ?? b?.content ?? '')).filter(Boolean).join('');
    }
    return '';
  };

  const handleIncomingMessage = (
    data: { content?: string; text?: string; delta?: string; done?: boolean; type?: string; event?: string; message?: any; usage?: any; payload?: any; data?: any; connected?: boolean; snapshot?: boolean }
  ) => {
    if (!data || data.type === 'status' || data.connected !== undefined) return;
    if (data.type !== 'chat') return;

    const u = data.usage;
    if (u) {
      console.log('[CTX DEBUG] usage payload:', JSON.stringify(u));
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
    const done = data.done === true;
    const isDelta = isDeltaPayload(data);

    if (done) {
      setAwaitingResponse(false);
      userScrolledUp.current = false;

      // 先捕获后清空，防止 React 批处理时回调读到已清空的 ref
      const finalStreamContent = content || streamingMessageRef.current;
      streamingMessageRef.current = '';
      const systemReply = pendingSystemReply.current;
      pendingSystemReply.current = false;

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
          return prev.map((msg, idx) =>
            idx === prev.length - 1
              ? { ...msg, content: finalStreamContent, isStreaming: false }
              : msg
          );
        }
        if (finalStreamContent || data.text) {
          const textContent = finalStreamContent || String(data.text || '');
          return [
            ...prev,
            {
              id: getNextMessageId(),
              role: 'assistant' as const,
              content: textContent,
              isStreaming: false,
              isSystemReply: systemReply,
              timestamp: Date.now(),
            },
          ];
        }
        return prev;
      });
      setIsStreaming(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50);
      return;
    }

    if (content) {
      setAwaitingResponse(false);
      // 仅对 delta 增量追加；Gateway 用 text 字段时每次为全量，应替换
      if (isDelta) {
        streamingMessageRef.current += content;
      } else {
        streamingMessageRef.current = content;
      }
      const buf = streamingMessageRef.current;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          return prev.map((msg, idx) =>
            idx === prev.length - 1 ? { ...msg, content: buf } : msg
          );
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
      if (!userScrolledUp.current) bottomRef.current?.scrollIntoView({ behavior: 'instant' });
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
    if ((!text.trim() && !imageDataUrl && !files?.length) || !wsConnected) return;

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
      window.alert(permCheck.reason || '此操作已被权限设置拦截。');
      return;
    }
    const dangerMatch = getDangerMatch(fullContent);
    if (dangerMatch) {
      const ok = window.confirm(
        `⚠ 危险操作警告\n\n检测到: ${dangerMatch.desc}\n级别: ${dangerMatch.level}\n\n确认仍要发送此消息？`
      );
      if (!ok) return;
    }

    pendingSystemReply.current = !imageDataUrl && !files?.length && isSystemCommand(fullContent);
    const cmdIsSystem = pendingSystemReply.current;
    streamingMessageRef.current = '';
    if (!cmdIsSystem) {
      setAwaitingResponse(true);
    }
    userScrolledUp.current = false;
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
    if (!content.trim() || !wsConnected) return;

    const permCheck = checkPermission(content.trim(), permissions);
    if (!permCheck.allowed) {
      window.alert(permCheck.reason || '此操作已被权限设置拦截。');
      return;
    }
    const dangerMatch = getDangerMatch(content.trim());
    if (dangerMatch) {
      const ok = window.confirm(
        `⚠ 危险操作警告\n\n检测到: ${dangerMatch.desc}\n级别: ${dangerMatch.level}\n\n确认仍要发送此消息？`
      );
      if (!ok) return;
    }

    pendingSystemReply.current = isSystemCommand(content.trim());
    streamingMessageRef.current = '';
    if (!pendingSystemReply.current) setAwaitingResponse(true);
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

  const lastAmyContent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === 'assistant' && !messages[i].isStreaming && messages[i].content) {
        return typeof messages[i].content === 'string' ? messages[i].content : String(messages[i].content);
      }
    }
    return '';
  }, [messages]);

  const copyLastAmyReply = useCallback(async () => {
    const raw = stripMarkdown(lastAmyContent);
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
    } catch (_) {}
  }, [lastAmyContent]);

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
        return updated.slice(-50); // 只保留最近 50 行
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
      setDisplayedStreamingLength(0);
      return;
    }

    const target = streamingMessageRef.current.length;
    if (displayedStreamingLength >= target) return;

    typewriterTimerRef.current = setInterval(() => {
      const current = streamingMessageRef.current.length;
      setDisplayedStreamingLength((prev) => {
        const next = prev + 1;
        if (settings.typingSound && next <= current) playClickSound();
        return Math.min(next, current);
      });
    }, streamSpeedMs);

    return () => {
      if (typewriterTimerRef.current) {
        clearInterval(typewriterTimerRef.current);
        typewriterTimerRef.current = null;
      }
    };
  }, [messages, displayedStreamingLength, streamSpeedMs, settings.typingSound]);

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
              background: '#060f06',
              border: '1px solid #1a4d2a',
              borderRadius: '6px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0,0,0,0.6), 0 0 12px rgba(0,255,65,0.1)',
              minWidth: '160px',
            }}
          >
            {[
              { icon: '⎘', label: '复制消息', action: () => navigator.clipboard.writeText(contextMenu.text), danger: false },
              { icon: '↩', label: '重新发送', action: () => { setInjectInputText(contextMenu.text); setContextMenu(null); }, danger: false },
              { icon: '✕', label: '删除消息', action: () => { setMessages((prev) => prev.filter((m) => m.id !== contextMenu.msgId)); setContextMenu(null); }, danger: true },
            ].map((item) => (
              <div
                key={item.label}
                onClick={() => { item.action(); setContextMenu(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 16px', cursor: 'pointer',
                  color: item.danger ? '#ff4444' : '#00cc66',
                  fontSize: '12px', fontFamily: 'Share Tech Mono',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? 'rgba(255,68,68,0.08)' : 'rgba(0,255,65,0.06)'; }}
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
            background: 'rgba(0, 255, 65, 0.05)',
            border: '2px dashed #00ff41',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            pointerEvents: 'none',
          }}>
            <span style={{
              color: '#00ff41',
              fontSize: '16px',
              fontFamily: 'Share Tech Mono, monospace',
              letterSpacing: '3px',
              textShadow: '0 0 10px rgba(0,255,65,0.8)',
            }}>⬇ DROP FILES HERE</span>
          </div>
        )}
        <div className="section-header">
          <div className="header-left">
            <span className="section-title">◈ OpenClaw Chat</span>
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
            {wsConnected ? 'CONNECTED' : wsReconnecting ? '重连中...' : wsError || 'DISCONNECTED'}
          </span>
        </div>

        <ChatMessageList
          messages={messages}
          displayMessages={messages.length > MAX_VISIBLE_MESSAGES ? messages.slice(-MAX_VISIBLE_MESSAGES) : messages}
          isStreaming={isStreaming}
          awaitingResponse={awaitingResponse}
          displayedStreamingLength={displayedStreamingLength}
          speakingMessageId={speakingMessageId}
          wsConnected={wsConnected}
          quickSend={quickSend}
          bottomRef={bottomRef}
          onScroll={handleChatScroll}
          onMessageContextMenu={(e, msg, raw) => setContextMenu({ x: e.clientX, y: e.clientY, msgId: msg.id, text: raw })}
        />
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
                filter: `drop-shadow(0 0 ${4 + i * 2}px rgba(0,255,65,${0.4 + i * 0.2}))`,
              }}>
                <polyline
                  points="2,2 14,13 26,2"
                  fill="none"
                  stroke="#00ff41"
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

      <div className="right-panel">
        {/* 上区：预留终端 - 状态栏+心跳+日志终端 flex:4 */}
        <div className="right-panel-upper">
          <div className="amy-status-bar">
            {/* 大时钟 */}
            <div style={{
              textAlign: 'center',
              padding: '12px 0 8px 0',
              borderBottom: '1px solid #0d2d0d',
              position: 'relative'
            }}>
              <div style={{
                fontSize: '11px',
                color: '#006620',
                letterSpacing: '4px',
                marginBottom: '4px',
                fontFamily: 'Share Tech Mono, monospace'
              }}>◈ SYSTEM CLOCK ◈</div>
              <span style={{
                fontSize: '36px',
                fontFamily: 'Share Tech Mono, monospace',
                color: '#00ff88',
                letterSpacing: '6px',
                textShadow: '0 0 20px rgba(0,255,136,0.6), 0 0 40px rgba(0,255,136,0.2)',
                display: 'block',
                lineHeight: 1
              }}>{localTime || '--:--'}</span>
              <div style={{
                fontSize: '11px',
                color: '#00ff88',
                letterSpacing: '1px',
                marginTop: '4px',
                fontFamily: 'Share Tech Mono, monospace',
                textAlign: 'center',
              }}>{localDate || ''}</div>
              <div style={{
                fontSize: '9px',
                color: '#004d1a',
                letterSpacing: '2px',
                marginTop: '4px',
                fontFamily: 'Share Tech Mono, monospace'
              }}>
                {wsConnected
                  ? '● CONNECTED'
                  : wsReconnecting
                    ? '◌ RECONNECTING'
                    : '○ DISCONNECTED'}
              </div>
            </div>

            {/* 心跳线 */}
            <div className="amy-status-line amy-status-line-3">
              <HeartbeatWave connected={wsConnected} pulse={heartbeatPulse} />
            </div>

            {/* 区块2：AGENT 状态 */}
            <div className="amy-status-section">
              <div className="amy-status-section-title">AGENT</div>
              {[
                { label: 'MODEL', value: modelName || '--' },
                { label: 'API', value: apiKeyInfo || '--' },
                { label: 'THINK', value: thinkMode || 'off' },
                { label: 'RUNTIME', value: runtimeMode || 'direct' },
              ].map(({ label, value }) => (
                <div key={label} className="amy-status-row">
                  <span className="amy-status-label">{label}</span>
                  <span className="amy-status-val">{value}</span>
                </div>
              ))}
            </div>

            {/* 区块3：资源状态 */}
            <div className="amy-status-section">
              <div className="amy-status-section-title">RESOURCES</div>
              <div className="amy-status-row">
                <span className="amy-status-label">TOK</span>
                <span className="amy-status-val">
                  {tokenIn != null ? `${(tokenIn/1000).toFixed(1)}k` : '0'} / {ctxMax != null ? `${(ctxMax/1000).toFixed(0)}k` : '--'}
                </span>
              </div>
              <div className="amy-status-row">
                <span className="amy-status-label">CTX</span>
                <span className="amy-status-val">
                  {ctxUsed != null && ctxMax != null && ctxMax > 0 ? (
                    <>
                      {'▓'.repeat(Math.round((ctxUsed/ctxMax)*10))}{'░'.repeat(10 - Math.round((ctxUsed/ctxMax)*10))}
                      {` ${(ctxUsed/1000).toFixed(1)}k (${Math.round((ctxUsed/ctxMax)*100)}%)`}
                    </>
                  ) : '░░░░░░░░░░ 0%'}
                </span>
              </div>
              <div className="amy-status-row">
                <span className="amy-status-label">SESSION</span>
                <span className="amy-status-val" style={{fontSize:'10px'}}>{session || '--'}</span>
              </div>
            </div>

            {/* 区块4：系统状态 */}
            <div className="amy-status-section">
              <div className="amy-status-section-title">SYSTEM</div>
              {[
                { label: 'COMPACTIONS', value: compactions != null ? String(compactions) : '0' },
                { label: 'QUEUE', value: queueInfo || 'collect (depth 0)' },
              ].map(({ label, value }) => (
                <div key={label} className="amy-status-row">
                  <span className="amy-status-label">{label}</span>
                  <span className="amy-status-val">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="right-panel-terminal">
            <div className="section-header">
              <span className="section-title">
                <span className={`gw-dot ${gatewayRunning || gatewayPortInUse ? 'running' : 'stopped'}`} />
                ◈ Gateway 日志
              </span>
              <div className="gw-controls">
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
                  📥 导出
                </button>
                <button
                  type="button"
                  className="terminal-test-btn gw-btn-clear"
                  onClick={() => {
                    setLogLines([]);
                  }}
                  title="清空日志"
                >
                  ⌧ 清空
                </button>
                {gatewayRunning ? (
                  <button
                    type="button"
                    className="terminal-test-btn gw-btn-stop"
                    onClick={() => ipcRenderer.invoke('stop-gateway')}
                    title="停止 Gateway"
                    disabled={!gatewayManaged}
                  >{gatewayManaged ? '■ 停止' : '● 外部运行'}</button>
                ) : gatewayPortInUse ? (
                  <span className="terminal-test-btn gw-btn-external" title="外部 Gateway 已连接">● 已连接</span>
                ) : (
                  <button
                    type="button"
                    className="terminal-test-btn gw-btn-start"
                    onClick={() => {
                      ipcRenderer.invoke('start-gateway').then(() => {
                        ipcRenderer.invoke('gateway-status').then((s: { running: boolean; managed: boolean; portInUse?: boolean }) => {
                          setGatewayRunning(s.running);
                          setGatewayManaged(s.managed);
                          setGatewayPortInUse(s.portInUse ?? false);
                        });
                      });
                    }}
                    title="启动 Gateway 并捕获日志"
                  >▶ 启动</button>
                )}
              </div>
            </div>
            <div ref={logContainerRef} className="log-terminal-dom" tabIndex={-1}>
              {logLines.length === 0 ? (
                <div className="log-empty">[LOG] 等待 Gateway 日志...</div>
              ) : (
                logLines.map((line, i) => {
                  // 提取括号标签并加粗
                  const match = line.match(/^(\[[^\]]+\])(.*)/);
                  if (match) {
                    return (
                      <div key={i} className={`log-line log-${getLogLevel(line)}`}>
                        <strong style={{ color: 'inherit', fontWeight: 900, textShadow: '0 0 8px currentColor' }}>{match[1]}</strong>
                        {match[2]}
                      </div>
                    );
                  }
                  return (
                    <div key={i} className={`log-line log-${getLogLevel(line)}`}>
                      {line}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 中区：系统终端 - 折叠标题栏 */}
        <div className="right-panel-middle">
          <div className="right-panel-middle-header">
            <span className="section-title">◈ 终端</span>
            <div className="right-panel-middle-actions">
              <button
                type="button"
                className="right-panel-quick-btn"
                onClick={() => ipcRenderer.invoke('open-terminal-window')}
                title="打开终端窗口"
              >
                [ ⊞ 终端 ]
              </button>
              <button
                type="button"
                className={`right-panel-quick-btn ${isAlwaysOnTop ? 'active' : ''}`}
                onClick={() => onToggleAlwaysOnTop?.()}
                title={isAlwaysOnTop ? '取消置顶' : '置顶窗口'}
              >
                [ 🔒 ]
              </button>
              <button
                type="button"
                className="right-panel-quick-btn"
                onClick={() => {
                  if (typeof window !== 'undefined' && (window as any).electronAPI?.enterFloatingMode) {
                    (window as any).electronAPI.enterFloatingMode();
                  } else {
                    console.warn('[ChatTab] enterFloatingMode API not available');
                  }
                }}
                title="进入悬浮模式"
              >
                [ ⭘ ]
              </button>
            </div>
          </div>
        </div>
        <div className="right-panel-quick-btns">
          <button type="button" className="right-panel-quick-btn" onClick={copyLastAmyReply} disabled={!lastAmyContent} title="复制最后一条 AMY 回复">
            [ ⎘ 复制 ]
          </button>
        </div>
      </div>
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
