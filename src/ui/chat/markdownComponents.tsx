import React from 'react';
import ReactMarkdown from 'react-markdown';
import CodeBlock from '../../components/CodeBlock';
import MermaidRenderer from '../../components/canvas/MermaidRenderer';
import { highlightCode } from '../../utils/codeHighlight';

const CHAT_MERMAID_MAX_LINES = 18;
const CHAT_MERMAID_MAX_CHARS = 600;
const CHAT_MERMAID_MAX_SUBGRAPHS = 2;
const CHAT_MERMAID_CANVAS_ONLY_TYPES = new Set([
  'sequencediagram',
  'statediagram',
  'statediagram-v2',
  'gantt',
  'journey',
  'timeline',
  'requirementdiagram',
]);

function analyzeMermaid(code: string) {
  const source = String(code || '').trim();
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const firstDirective =
    lines.find((line) => !line.trim().startsWith('%%'))?.trim().toLowerCase() || '';
  const typeMatch = firstDirective.match(
    /^(flowchart|graph|sequencediagram|classdiagram|erdiagram|statediagram(?:-v2)?|gantt|pie|mindmap|journey|timeline|quadrantchart|requirementdiagram|gitgraph)\b/
  );
  const diagramType = typeMatch?.[1] || 'mermaid';
  const subgraphCount = (source.match(/\bsubgraph\b/gi) || []).length;

  return {
    source,
    lineCount: lines.length,
    charCount: source.length,
    subgraphCount,
    diagramType,
  };
}

function shouldRenderChatMermaidPreview(code: string) {
  const meta = analyzeMermaid(code);
  if (CHAT_MERMAID_CANVAS_ONLY_TYPES.has(meta.diagramType)) {
    return { allowPreview: false, reason: 'complex-type', meta };
  }
  if (meta.lineCount > CHAT_MERMAID_MAX_LINES) {
    return { allowPreview: false, reason: 'too-long', meta };
  }
  if (meta.charCount > CHAT_MERMAID_MAX_CHARS) {
    return { allowPreview: false, reason: 'too-dense', meta };
  }
  if (meta.subgraphCount > CHAT_MERMAID_MAX_SUBGRAPHS) {
    return { allowPreview: false, reason: 'too-many-groups', meta };
  }
  return { allowPreview: true, reason: 'inline-ok', meta };
}

function getMermaidSummaryLabel(diagramType: string) {
  switch (diagramType) {
    case 'sequencediagram':
      return '时序图';
    case 'statediagram':
    case 'statediagram-v2':
      return '状态图';
    case 'gantt':
      return '甘特图';
    case 'journey':
      return '旅程图';
    case 'timeline':
      return '时间线';
    case 'mindmap':
      return '思维导图';
    case 'flowchart':
    case 'graph':
      return '流程图';
    default:
      return 'Mermaid 图';
  }
}

export function createMarkdownComponents(
  openCanvas?: (
    content: string,
    mode: 'markdown' | 'code' | 'html',
    title?: string,
    language?: string,
    artifactType?: 'document' | 'diagram' | 'code' | 'ui-draft'
  ) => void
): React.ComponentProps<typeof ReactMarkdown>['components'] {
  return {
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
    // 恢复 inline 参数检查作为首要判断，react-markdown 对 fenced code block 会设 inline=false
    // 某些 react-markdown 版本/组合下 inline 标记不稳定，容易把 fenced code block 误判成 inline，导致"代码框消失"。
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
    if (isBlock && (className?.replace('language-', '') || 'text').toLowerCase() === 'mermaid') {
      const MermaidBlock = ({ __octBlockCode }: { __octBlockCode?: boolean }) => {
        const [copied, setCopied] = React.useState(false);
        const previewDecision = React.useMemo(() => shouldRenderChatMermaidPreview(code), []);
        const summaryLabel = getMermaidSummaryLabel(previewDecision.meta.diagramType);

        const handleCopy = () => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        };

        return (
          <div
            className="chat-mermaid-card"
            data-oct-block-code={__octBlockCode ? '1' : undefined}
          >
            <div className="chat-mermaid-card__header">
              <span className="chat-mermaid-card__label">
                mermaid
              </span>
              <div className="chat-mermaid-card__actions">
                {openCanvas && (
                  <button
                    onClick={() => openCanvas(code, 'markdown', 'Mermaid Diagram', 'mermaid', 'diagram')}
                    className="chat-mermaid-card__action"
                  >
                    Open
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  className={`chat-mermaid-card__action${copied ? ' is-copied' : ''}`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="chat-mermaid-card__body">
              {previewDecision.allowPreview ? (
                <MermaidRenderer content={code} compact />
              ) : (
                <div className="chat-mermaid-summary">
                  <div className="chat-mermaid-summary__title">
                    {summaryLabel} 已转为 Canvas 完整展示
                  </div>
                  <div className="chat-mermaid-summary__meta">
                    {previewDecision.meta.lineCount} 行 · {previewDecision.meta.charCount} 字符
                    {previewDecision.meta.subgraphCount > 0 ? ` · ${previewDecision.meta.subgraphCount} 个分组` : ''}
                  </div>
                  <div className="chat-mermaid-summary__copy">
                    {previewDecision.reason === 'complex-type' && '这类图在聊天区容易过长或渲染不稳，建议直接在 Canvas 查看。'}
                    {previewDecision.reason === 'too-long' && '这张图在聊天区会过长，已保留 Open 入口供你查看完整版本。'}
                    {previewDecision.reason === 'too-dense' && '这张图信息密度较高，聊天区只保留摘要，完整图放在 Canvas 更清楚。'}
                    {previewDecision.reason === 'too-many-groups' && '这张图分组较多，聊天区容易拥挤，完整版更适合在 Canvas 阅读。'}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      };

      return <MermaidBlock __octBlockCode />;
    }

    const CodeBlockWithCopy = ({ __octBlockCode }: { __octBlockCode?: boolean }) => {
      const [copied, setCopied] = React.useState(false);
      const lines = code.split('\n').length;
      const isLong = lines > 12;
      // 长代码块默认不折叠，避免"看起来被截断"
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
            maxWidth: '100%',
            minWidth: 0,
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
              {openCanvas && (
                <button
                  onClick={() => {
                    const language = className?.replace('language-', '') || 'text';
                    if (language.toLowerCase() === 'mermaid') {
                      openCanvas(code, 'markdown', 'Mermaid Diagram', 'mermaid', 'diagram');
                      return;
                    }
                    openCanvas(code, 'code', language || 'code', language || 'text', 'code');
                  }}
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
                  Open
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
            <code
              className="oct-prism-code"
              style={{
                color: 'var(--text-code)',
                fontSize: '13px',
                fontFamily: 'var(--font-mono)',
                lineHeight: '1.6',
              }}
              dangerouslySetInnerHTML={{
                __html: highlightCode(code, className?.replace('language-', '') || 'text'),
              }}
            />
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
}

// 为了向后兼容，导出默认的 markdownComponents
export const markdownComponents = createMarkdownComponents();
