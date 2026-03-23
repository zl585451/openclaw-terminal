import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// xterm 已完全移除以修复闪退问题
import '../styles/ChatTab.css';
import { parseOptionBox, type OptionItem, type RenderSegment } from '../utils/optionBoxParser';
import OptionBox from './OptionBox';
import TaskList from './TaskList';
import TaskBoard from './TaskBoard';
import QuestionCards from './QuestionCards';
import SettingsPanel from './SettingsPanel';
import CodeBlock from './CodeBlock';
import QuickCommandMenu from './QuickCommandMenu';
import HeartbeatWave from './HeartbeatWave';
import AmyAvatar from './AmyAvatar';
import SetupGuide from './SetupGuide';
import LogPanel from './LogPanel';
import { useSettings } from '../contexts/SettingsContext';
import { usePermissions } from '../contexts/PermissionsContext';
import { checkPermission, getDangerMatch } from '../utils/permissionCheck';
import { playClickSound } from '../utils/clickSound';
import { stripThinkModeMarker } from '../utils/socraticTemplates';

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

/** 将浏览器 File 转为 UploadedFile。Electron 拖入本地文件时 file.path 存在，只存元数据；否则需读内容（大文件体验差） */
async function fileToUploadedFile(file: File): Promise<UploadedFile> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mimeType = file.type || 'application/octet-stream';
  const isImage = mimeType.startsWith('image/');

  // Electron 拖入本地文件时有 path，只传元数据，不读内容
  const filePath = (file as File & { path?: string }).path;
  if (filePath) {
    return {
      name: file.name,
      size: file.size,
      ext,
      mimeType,
      isText: false,
      content: null,
      base64: isImage ? await readFileAsBase64(file) : undefined,
      path: filePath,
    };
  }

  // 无 path（如 Web 或非本地拖入）：仍需读内容，大文件体验差
  const textExts = ['txt', 'md', 'json', 'csv', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'html', 'css', 'sql', 'xml', 'yaml', 'yml'];
  const isText = textExts.includes(ext);
  let content: string | null = null;
  if (isText) content = await file.text();
  const base64 = await readFileAsBase64(file);
  return { name: file.name, size: file.size, ext, mimeType, isText, content, base64 };
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const dataUrl = r.result as string;
      res(dataUrl.includes(',') ? dataUrl.split(',')[1]! : '');
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
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
  input: ({ type, checked, ...props }) => {
    if (type === 'checkbox') {
      return <span role="img" aria-hidden style={{ marginRight: '4px', color: 'var(--text-secondary)' }}>{checked ? '☑' : '☐'}</span>;
    }
    return <input type={type} {...props} />;
  },
  table: ({ children }) => (
    <div className="table-wrapper">
      <table className="md-table">{children}</table>
    </div>
  ),
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
          background: 'var(--bg-code)', color: 'var(--text-code-color)',
          padding: '1px 5px', borderRadius: '3px',
          fontSize: 'var(--text-code)', fontFamily: 'var(--font-mono)',
        }}>{children}</code>
      );
    }
    const code = String(children);
    const CodeBlockWithCopy = ({ __octBlockCode }: { __octBlockCode?: boolean }) => {
      const [copied, setCopied] = React.useState(false);
      const lines = code.split('\n').length;
      const isLong = lines > 12;
      // 长代码块默认不折叠，避免“看起来被截断”
      const [expanded, setExpanded] = React.useState(() => isLong);

      const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      };

      return (
        <div
          style={{
            margin: '12px 0',
            borderRadius: '8px',
            overflow: 'hidden',
            background: 'var(--bg-code)',
          }}
          data-oct-block-code={__octBlockCode ? '1' : undefined}
        >
          {/* Claude-style header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{
              fontSize: '12px',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-sans)',
              fontWeight: 500,
            }}>
              {(className?.replace('language-', '') || 'code')}
            </span>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {isLong && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    fontSize: '12px',
                    fontFamily: 'var(--font-sans)',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                >
                  {expanded ? 'Collapse' : 'Expand'}
                </button>
              )}
              <button
                onClick={handleCopy}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copied ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-sans)',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-tertiary)'; }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          {/* Code area */}
          <pre style={{
            margin: 0,
            padding: '16px',
            overflow: 'auto',
            background: 'transparent',
            border: 'none',
            borderRadius: 0,
            maxHeight: isLong && !expanded ? '220px' : 'none',
            transition: 'max-height 0.3s ease',
            position: 'relative',
          }}>
            <code style={{
              color: 'var(--text-code)',
              fontSize: '13px',
              fontFamily: 'var(--font-mono)',
              lineHeight: '1.6',
            }}>
              {code}
            </code>
            {isLong && !expanded && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: '48px',
                background: 'linear-gradient(transparent, var(--bg-code))',
                pointerEvents: 'none',
              }} />
            )}
          </pre>
        </div>
      );
    };
    return <CodeBlockWithCopy __octBlockCode />;
  },
  pre: ({ children }) => {
    const child = React.Children.toArray(children)[0] as React.ReactElement | undefined;
    // 若 code 渲染器返回了自定义代码块（带 data-oct-block-code），剥离外层 <pre>，避免双层边框/断裂
    if (child?.props?.['data-oct-block-code'] === '1') return <>{children}</>;
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

/**
 * 检测文本中所有代码块的位置范围（行号）。
 * 返回一组 [startLine, endLine) 范围，用于排除代码块内的内容。
 */
function getCodeBlockLineRanges(lines: string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let inCodeBlock = false;
  let startLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^`{3,}/.test(trimmed)) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        startLine = i;
      } else {
        ranges.push([startLine, i + 1]);
        inCodeBlock = false;
      }
    }
  }
  
  // 未闭合的代码块，到末尾都算代码块内
  if (inCodeBlock && startLine >= 0) {
    ranges.push([startLine, lines.length]);
  }
  
  return ranges;
}

/**
 * 检查某一行是否在代码块内部。
 */
function isLineInCodeBlock(lineIndex: number, ranges: Array<[number, number]>): boolean {
  return ranges.some(([start, end]) => lineIndex >= start && lineIndex < end);
}

/**
 * 检查一行是否是 Markdown 表格行。
 * 支持两种格式：
 * - 标准格式：| col1 | col2 | （以 | 开头，可以不以 | 结尾）
 * - 紧凑格式：| col1 | col2 （行末没有 |）
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  // 必须以 | 开头
  if (!trimmed.startsWith('|')) return false;
  // 排除文件树结构（包含 ├── └── │ 等符号）
  if (/[├└┌┐┘┼─│]/.test(line)) return false;
  // 以 | 结尾，或行内有 | 分隔符
  if (trimmed.endsWith('|')) return true;
  // 行末没有 |，但中间有 | 分隔
  return trimmed.includes('|');
}

function shouldPreprocessMarkdownTables(text: string): boolean {
  if (!text) return false;
  // 简单判定：包含至少两行“|...|”样式的行，才启用表格预处理，避免误伤普通文本
  const lines = text.split('\n');
  const codeBlockRanges = getCodeBlockLineRanges(lines);
  let tableLike = 0;
  for (let i = 0; i < lines.length; i++) {
    // 跳过代码块内的行
    if (isLineInCodeBlock(i, codeBlockRanges)) continue;
    if (isTableRow(lines[i])) tableLike++;
    if (tableLike >= 2) return true;
  }
  return false;
}

function fillEmptyCellsInTables(text: string): string {
  // 将表格行里的空单元格填充为单个空格，避免 remark-gfm 对 `| |` 的不稳定解析；
  // 使用空格而非 &nbsp;，防止某些解析路径下单元格内容异常
  const lines = text.split('\n');
  const codeBlockRanges = getCodeBlockLineRanges(lines);

  return lines.map((line, i) => {
    if (isLineInCodeBlock(i, codeBlockRanges)) return line;
    if (isTableRow(line)) {
      return line.replace(/\|\s*\|/g, '| |');
    }
    return line;
  }).join('\n');
}

function escapeTableBrackets(text: string): string {
  // 仅转义表格行里形如 [text](url) 的链接语法，避免破坏表格解析；
  // 不转义纯 [xxx]（如 [AGENTS.md]），否则反斜杠会导致 remark-gfm 解析异常、单元格内容丢失
  const lines = text.split('\n');
  const codeBlockRanges = getCodeBlockLineRanges(lines);

  return lines.map((line, i) => {
    if (isLineInCodeBlock(i, codeBlockRanges)) return line;
    if (isTableRow(line)) {
      // 只转义 [text](url) 形式，替换为 \[text](url) 使方括号不触发链接解析
      return line.replace(/\[([^\]]*)\]\(([^)]*)\)/g, '\\[$1]($2)');
    }
    return line;
  }).join('\n');
}

/**
 * 修复模型偶发输出的“表格分隔符行重复插入”问题。
 *
 * 现象：模型把表头分隔符（|---|---|）重复输出到每条数据行之间，导致 remark-gfm 将其视为新的表头分隔符，
 * 进而破坏整张表格渲染。
 *
 * 规则：
 * - 一个表格块（连续以 `|` 开头的行）中，只允许表头后出现一次分隔符行
 * - 该表格块内后续出现的分隔符行一律删除
 */
function normalizeMarkdownTables(text: string): string {
  if (!text || typeof text !== 'string') return text;
  const lines = text.split('\n');
  const out: string[] = [];

  const isTableRow = (l: string) => /^\s*\|/.test(l);
  const isSeparator = (l: string) => {
    const trimmed = String(l || '').trim();
    if (!/^\|/.test(trimmed)) return false;
    const content = trimmed.replace(/^\|/, '').replace(/\|\s*$/, '');
    // 仅允许由 | - : 和空白组成，且包含 -
    return /^[\s\-:|]+$/.test(content) && /-/.test(content);
  };

  let i = 0;
  while (i < lines.length) {
    if (!isTableRow(lines[i] || '')) {
      out.push(lines[i] || '');
      i++;
      continue;
    }

    const block: string[] = [];
    while (i < lines.length && isTableRow(lines[i] || '')) {
      block.push(lines[i] || '');
      i++;
    }

    // 只有满足“至少两行且第二行是分隔符”才认为是真表格
    if (block.length >= 2 && isSeparator(block[1] || '')) {
      const cleaned = [block[0], block[1]];
      for (let k = 2; k < block.length; k++) {
        if (isSeparator(block[k] || '')) continue;
        cleaned.push(block[k]);
      }
      out.push(...cleaned);
    } else {
      out.push(...block);
    }
  }

  return out.join('\n');
}

function normalizeTableSeparators(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  // 每个表格块只需要一条分隔符（紧跟表头之后）
  // separatorDone 标记当前表格块是否已经有分隔符
  let separatorDone = false;

  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i] ?? '';
    const curTrim = cur.trim();
    // GFM 允许表格行末尾可选 |，与 isTableRow 逻辑一致
    const curIsTableRow = curTrim.startsWith('|') && (curTrim.endsWith('|') || curTrim.includes('|'));
    const curIsSep = /^\|[\s\-:|]+\|?\s*$/.test(curTrim) && /-/.test(curTrim);

    // 非表格行 → 重置状态
    if (!curIsTableRow) {
      separatorDone = false;
      out.push(cur);
      continue;
    }

    // 当前行是分隔符行 → 标记已有分隔符
    if (curIsSep) {
      separatorDone = true;
      out.push(cur);
      continue;
    }

    // 当前行是普通表格行
    out.push(cur);

    // 仅在尚未添加/遇到分隔符时，检查下一行是否是分隔符
    if (!separatorDone) {
      const next = lines[i + 1] ?? '';
      const nextTrim = next.trim();
      const nextIsSep = /^\|[\s\-:|]+\|?\s*$/.test(nextTrim) && /-/.test(nextTrim);
      if (!nextIsSep) {
        // 表头后缺少分隔符 → 自动补一条
        const colCount = Math.max(1, curTrim.split('|').length - 2);
        out.push('|' + ' --- |'.repeat(colCount));
      }
      separatorDone = true; // 无论是否插入，都标记为 done，后续数据行不再插入
    }
  }
  return out.join('\n');
}

/** 确保表格块前有空行，便于 remark-gfm 识别块级表格 */
function ensureBlankLineBeforeTables(text: string): string {
  const lines = text.split('\n');
  const codeBlockRanges = getCodeBlockLineRanges(lines);
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (isLineInCodeBlock(i, codeBlockRanges)) {
      result.push(lines[i]!);
      continue;
    }
    // 当前行是表格行，且上一行非空
    if (isTableRow(lines[i]!)) {
      const prev = result[result.length - 1];
      if (prev !== undefined && prev.trim() !== '' && !isTableRow(prev)) {
        result.push('');
      }
    }
    result.push(lines[i]!);
  }
  return result.join('\n');
}

function preprocessMarkdown(text: string): string {
  if (!shouldPreprocessMarkdownTables(text)) return text;
  let processed = text;
  // 确保表格前有空行，便于 GFM 解析
  processed = ensureBlankLineBeforeTables(processed);
  // 修复模型偶发输出的“表格分隔符行重复插入”问题：同一表格块内只保留表头后的第一条分隔符行
  processed = normalizeMarkdownTables(processed);
  processed = fillEmptyCellsInTables(processed);
  processed = escapeTableBrackets(processed);
  processed = normalizeTableSeparators(processed);
  return processed;
}

const MAX_MARKDOWN_TABLE_ROWS = 20;
const MAX_MARKDOWN_TABLE_COLS = 8;
function shouldFallbackTableRendering(text: string): boolean {
  if (!text) return false;
  const lines = text.split('\n');
  const codeBlockRanges = getCodeBlockLineRanges(lines);
  const tableLines = lines.filter((l, i) => !isLineInCodeBlock(i, codeBlockRanges) && isTableRow(l));
  if (tableLines.length === 0) return false;
  const rows = tableLines.length;
  const cols = Math.max(0, (tableLines[0].match(/\|/g)?.length || 0) - 1);
  return rows > MAX_MARKDOWN_TABLE_ROWS || cols > MAX_MARKDOWN_TABLE_COLS;
}

/** 打字机光标：单独组件避免随内容重渲染导致闪烁 */
const TypewriterCursor = memo(function TypewriterCursor({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="cursor-blink">▋</span>;
});

const MarkdownContent = memo(
  function MarkdownContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
    const text = content || '';
    const processedText = React.useMemo(() => preprocessMarkdown(text), [text]);
    const contentRef = React.useRef<HTMLSpanElement>(null);

    // 统一使用 ReactMarkdown 渲染，流式/非流式均走同一路径，确保表格稳定显示为 HTML
    // 之前流式期间将表格当纯文本显示，导致同一消息有时表格有时纯文本的不稳定现象
    if (shouldFallbackTableRendering(processedText)) {
      return (
        <span className={`msg-content markdown-body ${isStreaming ? 'msg-content-streaming-root' : ''}`} ref={contentRef}>
          <span className="msg-streaming-raw-table">{processedText}</span>
        </span>
      );
    }
    return (
      <span className={`msg-content markdown-body ${isStreaming ? 'msg-content-streaming-root' : ''}`} ref={contentRef}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {processedText}
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
  agentPhase: 'idle' | 'thinking' | 'typing';
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
  onQuoteQuestion,
  segments,
}: ChatMessageItemProps) {
  const [hoverTime, setHoverTime] = React.useState(false);
  
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
            <span style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', letterSpacing: '2px' }}>AMY</span>
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
                    // 已解析出 segments 时，文本段始终走非流式路径，表格等统一由 ReactMarkdown 渲染
                    return <MarkdownContent key={idx} content={seg.content} isStreaming={false} />;
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
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-mono)',
          cursor: 'default',
          transition: 'color 0.2s',
          letterSpacing: '0.5px',
        }}
      >
        {hoverTime ? formatFullTime(msg.timestamp) : formatTime(msg.timestamp)}
      </span>
    </div>
  );
}, (prev, next) => {
  // 精细比较：只有真正变化的属性才触发重渲染
  return (
    prev.msg.id === next.msg.id &&
    prev.msg.content === next.msg.content &&
    prev.msg.isStreaming === next.msg.isStreaming &&
    prev.textToShow === next.textToShow &&
    prev.isStreamingMsg === next.isStreamingMsg &&
    prev.speakingMessageId === next.speakingMessageId &&
    prev.agentPhase === next.agentPhase &&
    prev.thinkingElapsed === next.thinkingElapsed &&
    prev.wsConnected === next.wsConnected &&
    prev.currentPage === next.currentPage &&
    prev.segments === next.segments
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
const VISIBLE_MESSAGES_STEP = 30;

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
                {file.mimeType.startsWith('image/') && file.base64 ? (
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
                  fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  maxWidth: '120px',
                }}>{file.name}</div>
                <div style={{
                  fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
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
  thinkingElapsed: number;
  wsConnected: boolean;
  quickSend: (text: string) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onMessageContextMenu: (e: React.MouseEvent, msg: ChatMessage, raw: string) => void;
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
  thinkingElapsed,
  wsConnected,
  quickSend,
  bottomRef,
  onScroll,
  onMessageContextMenu,
  onQuoteQuestion,
}: ChatMessageListProps) {
  const [pageByMsgId, setPageByMsgId] = useState<Record<number, number>>({});
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const handlePageChange = useCallback((msgId: number, page: number) => {
    setPageByMsgId((prev) => ({ ...prev, [msgId]: page }));
  }, []);

  const showTypingIndicator = (awaitingResponse || isStreaming) && (messages.length === 0 || messages[messages.length - 1]?.role === 'user');

  return (
    <div className="chat-messages-wrap" onScroll={onScroll} ref={messagesContainerRef}>
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <span className="empty-icon">✦</span>
            <span>输入消息开始对..</span>
          </div>
        )}
        {showTypingIndicator && (
          <div className="chat-thinking">
            <span className="msg-label">◆ AMY</span>
            {agentPhase === 'thinking' && (
              <>
                <span className="agent-status-badge">深度思考中</span>
                {thinkingElapsed > 0 && (
                  <span className="thinking-elapsed">{thinkingElapsed}s</span>
                )}
              </>
            )}
            {agentPhase === 'typing' && <span className="agent-status-badge">打字中</span>}
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
        // 流式期间不解析交互标签（标签可能未闭合，且会绕过打字机切片）
        // 流式结束后才调用 parseOptionBox 解析 pills/question 等
        const parsed = (msg.role === 'assistant' && !isStreamingMsg)
          ? parseOptionBox(raw)
          : { text: display, options: [] as OptionItem[], totalPages: undefined, isTaskList: false, isReflectiveQuestions: false, forcePills: undefined, segments: undefined };
        const textToShow = msg.role === 'assistant'
          ? (isStreamingMsg ? display : (parsed.text?.trim() ? parsed.text : raw))
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
            onQuoteQuestion={onQuoteQuestion}
          />
        );
        })}
        <div ref={bottomRef as React.Ref<HTMLDivElement>} />
      </div>
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
  const [agentPhase, setAgentPhase] = useState<'idle' | 'thinking' | 'typing'>('idle');
  const [thinkingElapsed, setThinkingElapsed] = useState(0);
  const [streak, setStreak] = useState<number>(() => getStreakData().streak);
  const [displayedLength, setDisplayedLength] = useState(0);
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE_MESSAGES);
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
  const streamUiRafRef = useRef<number | null>(null);

  const scheduleStreamUiUpdate = useCallback(() => {
    if (streamUiRafRef.current != null) return;
    streamUiRafRef.current = requestAnimationFrame(() => {
      streamUiRafRef.current = null;
      const buf = streamingMessageRef.current;
      setStreamingDisplayContent(buf);
      if (!buf) return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last?.isStreaming) {
          return prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: buf } : m));
        }
        if (last?.role === 'assistant' && !last.isStreaming && (last.content ?? '').trim() === buf.trim()) {
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
    });
  }, [getNextMessageId, setMessages]);

  // ===== 所有 useEffect 放在 useState/useRef 之后 =====
  // 通知父组件状态变化
  useEffect(() => {
    onStatusChange?.(wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax);
  }, [wsConnected, isStreaming, modelName, tokenIn, tokenOut, ctxUsed, ctxMax, onStatusChange]);

  useEffect(() => {
    return () => {
      if (streamUiRafRef.current != null) {
        cancelAnimationFrame(streamUiRafRef.current);
        streamUiRafRef.current = null;
      }
    };
  }, []);


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
    data: { content?: string; text?: string; delta?: string; done?: boolean; type?: string; phase?: string; event?: string; message?: any; usage?: any; payload?: any; data?: any; connected?: boolean; snapshot?: boolean; elapsed?: number }
  ) => {
    if (!data || data.type === 'status' || data.connected !== undefined) return;
    if (data.type === 'agent-phase') {
      const phase = data.phase;
      if (phase === 'thinking' || phase === 'typing' || phase === 'idle') setAgentPhase(phase);
      if (phase === 'thinking' && data.elapsed != null) setThinkingElapsed(data.elapsed);
      if (phase === 'idle' || phase === 'typing') setThinkingElapsed(0);
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
      // 兼容旧消息：如果包含 [THINK_MODE:xxx] 标记，静默剥离
      if (!systemReply && finalStreamContent) {
        finalStreamContent = stripThinkModeMarker(finalStreamContent);
      }
      // 将最终（已清理）内容刷新到 UI（避免节流导致最后一段没显示）
      if (finalStreamContent) {
        streamingMessageRef.current = finalStreamContent;
        scheduleStreamUiUpdate();
      }

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
      
      scheduleStreamUiUpdate();
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

  useEffect(() => {
    // 新消息到来时，确保可见窗口至少覆盖最新的 MAX_VISIBLE_MESSAGES
    setVisibleCount((prev) => Math.max(prev, Math.min(messages.length, MAX_VISIBLE_MESSAGES)));
  }, [messages.length]);

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

    pendingSystemReply.current = !imageDataUrl && !files?.length && isSystemCommand(fullContentForAMY);
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
        content: displayContent,
        timestamp: Date.now(),
        imageDataUrl: imageDataUrl || undefined,
        files: files,
      },
    ]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 30);

    // 发送到 OpenClaw，包含图片和文件（content 含路径引用，AMY 用 read_file 读取）
    const result = await ipcRenderer.invoke('openclaw-send', {
      content: fullContentForAMY,
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
        return updated.slice(-100); // 只保留最新100条
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

    // 向上滚动接近顶部时，逐步加载更早消息（轻量“虚拟滚动”）
    if (el.scrollTop < 120 && messages.length > visibleCount) {
      setVisibleCount((prev) => Math.min(prev + VISIBLE_MESSAGES_STEP, messages.length));
    }
  }, [messages.length, visibleCount]);

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
                  fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)',
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
              fontSize: 'var(--text-lg)',
              fontFamily: 'var(--font-mono)',
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
          displayMessages={messages.length > visibleCount ? messages.slice(-visibleCount) : messages}
          isStreaming={isStreaming}
          awaitingResponse={awaitingResponse}
          streamingContent={streamingDisplayContent}
          displayedLength={displayedLength}
          speakingMessageId={speakingMessageId}
          agentPhase={agentPhase}
          thinkingElapsed={thinkingElapsed}
          wsConnected={wsConnected}
          quickSend={quickSend}
          bottomRef={bottomRef}
          onScroll={handleChatScroll}
          onMessageContextMenu={(e, msg, raw) => setContextMenu({ x: e.clientX, y: e.clientY, msgId: msg.id, text: raw })}
          onQuoteQuestion={(text: string) => setInjectInputText(text)}
        />
        {showScrollBtn && (
          <div
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
            style={{
              position: 'absolute',
              bottom: '80px',
              left: '50%',
              transform: 'translateX(-50%)',
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
                background: wsConnected ? 'var(--status-success)' : 'var(--status-error)',
                animation: wsConnected ? 'pulse-green 2s infinite' : 'pulse-red 1s infinite',
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
                background: nocturneOnline ? 'var(--status-info)' : 'var(--status-error)',
                animation: nocturneOnline ? 'pulse-blue 3s infinite' : 'pulse-red 1s infinite',
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
                fontSize: 'var(--text-xs)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
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
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
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
            lines={logLines}
            bodyRef={logContainerRef}
            emptyText="[LOG] 等待 Gateway 日志..."
            nocturneOnline={nocturneOnline}
            modelName={modelName}
            onExport={async () => {
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
            onClear={() => setLogLines([])}
          />
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
