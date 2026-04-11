import React from 'react';
import ReactMarkdown from 'react-markdown';
import CodeBlock from '../../components/CodeBlock';
import MermaidRenderer from '../../components/canvas/MermaidRenderer';
import { highlightCode } from '../../utils/codeHighlight';
import { diagramSpecToMermaid, parseDiagramSpec } from '../../utils/diagramSchema';

// ── Chat inline preview: ONLY these types are shown directly in the chat window.
// Everything else is redirected to Canvas (with an Open button).
// mindmap excluded: fragile indentation syntax + too small to read inline.
const CHAT_MERMAID_INLINE_TYPES = new Set(['flowchart', 'graph', 'pie']);

// Size limits that apply only to inline-allowed types.
const CHAT_MERMAID_MAX_LINES    = 16;
const CHAT_MERMAID_MAX_CHARS    = 550;
const CHAT_MERMAID_MAX_SUBGRAPHS = 2;
// LR/RL flowcharts are always redirected to Canvas regardless of size.
// Even a 3-node LR chain with tall nodes overflows the chat bubble.

// Canvas-supported types rendered with the existing Mermaid Canvas renderer.
// All other types (experimental, unknown) fall through to the same Canvas path.
const CANVAS_MERMAID_LABEL: Record<string, string> = {
  sequencediagram: '时序图',
  classdiagram: '类图',
  erdiagram: '实体关系图',
  statediagram: '状态图',
  'statediagram-v2': '状态图',
  gantt: '甘特图',
  journey: '旅程图',
  timeline: '时间线',
  requirementdiagram: '需求图',
  gitgraph: 'Git 分支图',
  quadrantchart: '象限图',
  flowchart: '流程图',
  graph: '流程图',
  pie: '饼图',
  mindmap: '思维导图',
};

function analyzeMermaid(code: string) {
  const source = String(code || '').trim();
  const lines = source.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const firstDirective =
    lines.find((line) => !line.trim().startsWith('%%'))?.trim().toLowerCase() || '';
  // Detect all known types; unknown/experimental types fall back to 'unknown'.
  const typeMatch = firstDirective.match(
    /^(flowchart|graph|sequencediagram|classdiagram|erdiagram|statediagram(?:-v2)?|gantt|pie|mindmap|journey|timeline|quadrantchart|requirementdiagram|gitgraph|sankey|xychart|block|packet|kanban|architecture|radar|treemap|venn|ishikawa|treeview|zenuml|c4context)\b/
  );
  const diagramType = typeMatch?.[1] ?? 'unknown';
  const subgraphCount = (source.match(/\bsubgraph\b/gi) || []).length;

  // Detect horizontal layout direction (LR / RL) — these produce wide diagrams
  // that overflow the chat bubble when there are more than a few nodes.
  const directionMatch = firstDirective.match(/\b(lr|rl|td|bt|tb)\b/);
  const direction = directionMatch?.[1] ?? 'td'; // default TD (top-down)
  const isHorizontal = direction === 'lr' || direction === 'rl';

  // Count edges (arrows) as a proxy for diagram complexity / rendered width.
  const edgeCount = (source.match(/--[->]|==|\.\.>/g) || []).length;

  return {
    source,
    lineCount: lines.length,
    charCount: source.length,
    subgraphCount,
    diagramType,
    isHorizontal,
    edgeCount,
  };
}

function shouldRenderChatMermaidPreview(code: string) {
  const meta = analyzeMermaid(code);

  // Allowlist check: only approved types can show inline.
  if (!CHAT_MERMAID_INLINE_TYPES.has(meta.diagramType)) {
    return { allowPreview: false, reason: 'not-inline-type', meta };
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
  // LR/RL always goes to Canvas — even a 3-node chain overflows if nodes
  // have multi-line labels or emojis. TD is the only safe chat direction.
  if (meta.isHorizontal) {
    return { allowPreview: false, reason: 'lr-not-allowed', meta };
  }
  return { allowPreview: true, reason: 'inline-ok', meta };
}

function getMermaidSummaryLabel(diagramType: string) {
  return CANVAS_MERMAID_LABEL[diagramType] ?? 'Mermaid 图';
}

function getDiagramJsonSummaryLabel(code: string) {
  const spec = parseDiagramSpec(code);
  if (!spec) return null;
  if (spec.diagramType === 'pie') return '饼图';
  if (spec.diagramType === 'hierarchy') return '层级图';
  return '流程图';
}

function getEchartSummaryLabel(code: string) {
  try {
    const parsed = JSON.parse(code);
    const title = parsed?.title || parsed?.option?.title?.text;
    if (typeof title === 'string' && title.trim()) return title.trim();
  } catch {}
  return '数据图表';
}

export function createMarkdownComponents(
  openCanvas?: (
    content: string,
    mode: 'markdown' | 'code' | 'html',
    title?: string,
    language?: string,
    artifactType?: 'document' | 'diagram' | 'code' | 'ui-draft' | 'echart'
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
    const normalizedLanguage = (className?.replace('language-', '') || 'text').toLowerCase();
    // Try to parse as diagram spec for json blocks, OR any code block that contains "diagramType":
    // (models often output diagram JSON with language 'code' or 'text' instead of 'json')
    const diagramSpec = (normalizedLanguage === 'json' || /^\s*\{[\s\S]*"diagramType"\s*:/.test(code))
      ? parseDiagramSpec(code)
      : null;
    if (isBlock && normalizedLanguage === 'echart') {
      const EchartBlock = ({ __octBlockCode }: { __octBlockCode?: boolean }) => {
        const [copied, setCopied] = React.useState(false);
        const summaryLabel = React.useMemo(() => getEchartSummaryLabel(code), [code]);

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
                echart
              </span>
              <div className="chat-mermaid-card__actions">
                {openCanvas && (
                  <button
                    onClick={() => openCanvas(code, 'markdown', summaryLabel, 'echart', 'echart')}
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
              <div className="chat-mermaid-summary">
                <div className="chat-mermaid-summary__title">
                  {summaryLabel} 已转为 Canvas 图表展示
                </div>
                <div className="chat-mermaid-summary__meta">
                  ECharts JSON · 点击 Open 查看完整图表
                </div>
                <div className="chat-mermaid-summary__copy">
                  模型输出了图表 payload，聊天区不再把它当普通代码展示，会直接交给 Canvas 图表渲染器。
                </div>
              </div>
            </div>
          </div>
        );
      };

      return <EchartBlock __octBlockCode />;
    }
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
                    {previewDecision.reason === 'not-inline-type' && '这类图需要足够的展示空间，点击 Open 在 Canvas 查看完整版。'}
                    {previewDecision.reason === 'too-long' && '图的内容较多，聊天区不适合展示，点击 Open 在 Canvas 查看完整版。'}
                    {previewDecision.reason === 'too-dense' && '图的信息密度较高，点击 Open 在 Canvas 查看完整版。'}
                    {previewDecision.reason === 'too-many-groups' && '图的分组较多，聊天区容易拥挤，点击 Open 在 Canvas 查看完整版。'}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      };

      return <MermaidBlock __octBlockCode />;
    }

    if (isBlock && diagramSpec) {
      const MermaidFromJsonBlock = ({ __octBlockCode }: { __octBlockCode?: boolean }) => {
        const [copied, setCopied] = React.useState(false);
        const mermaidCode = React.useMemo(() => diagramSpecToMermaid(diagramSpec), []);
        const previewDecision = React.useMemo(() => shouldRenderChatMermaidPreview(mermaidCode), [mermaidCode]);
        const summaryLabel = getDiagramJsonSummaryLabel(code) || getMermaidSummaryLabel(previewDecision.meta.diagramType);

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
                diagram json
              </span>
              <div className="chat-mermaid-card__actions">
                {openCanvas && (
                  <button
                    onClick={() => openCanvas(code, 'markdown', `${summaryLabel} Diagram`, 'json', 'diagram')}
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
                <MermaidRenderer content={mermaidCode} compact />
              ) : (
                <div className="chat-mermaid-summary">
                  <div className="chat-mermaid-summary__title">
                    {summaryLabel} 已转为 Canvas 完整展示
                  </div>
                  <div className="chat-mermaid-summary__meta">
                    {previewDecision.meta.lineCount} 行 · {previewDecision.meta.charCount} 字符
                  </div>
                  <div className="chat-mermaid-summary__copy">
                    这张图更适合在 Canvas 里查看，点击 Open 查看完整版。
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      };

      return <MermaidFromJsonBlock __octBlockCode />;
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
                    if (language.toLowerCase() === 'json') {
                      const spec = parseDiagramSpec(code);
                      if (spec) {
                        const title = `${getDiagramJsonSummaryLabel(code) || 'Diagram'} Diagram`;
                        openCanvas(code, 'markdown', title, 'json', 'diagram');
                        return;
                      }
                    }
                    if (language.toLowerCase() === 'echart') {
                      openCanvas(code, 'markdown', getEchartSummaryLabel(code), 'echart', 'echart');
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
