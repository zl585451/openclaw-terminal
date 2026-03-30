import { useState } from 'react';
import { highlightCode } from '../utils/codeHighlight';
import '../styles/CodeBlock.css';

interface CodeBlockProps {
  language?: string;
  children: string;
}

const LINES_COLLAPSED = 5;

export default function CodeBlock({ language = 'text', children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');
  const lines = code.split('\n');
  const needExpand = lines.length > LINES_COLLAPSED;
  const [expanded, setExpanded] = useState(() => needExpand);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleExpand = () => setExpanded((e) => !e);

  const langLabel = language && language !== 'text' ? language : 'code';
  const html = highlightCode(code, language);

  return (
    <div
      className={`code-block-wrap ${expanded ? 'code-block-expanded' : ''} ${needExpand ? 'code-block-collapsible' : ''}`}
    >
      <header className="code-block-header">
        <span className="code-block-lang">{langLabel}</span>
        <div className="code-block-actions">
          {needExpand && (
            <button
              type="button"
              className="code-block-expand"
              onClick={handleExpand}
              title={expanded ? '收起' : '展开'}
            >
              {expanded ? '▲ 收起' : '▼ 展开'}
            </button>
          )}
          <button
            type="button"
            className={`code-block-copy ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
            title={copied ? '已复制' : '复制'}
          >
            {copied ? 'Copied!' : '⎘'}
          </button>
        </div>
      </header>
      <div className="code-block-body">
        <div
          className="code-block-syntax"
          style={{
            margin: 0,
            padding: '14px 16px',
            fontSize: '13px',
            lineHeight: 1.5,
            background: 'var(--bg-code)',
            borderRadius: 0,
            border: 'none',
            maxHeight: needExpand && !expanded ? '220px' : 'none',
            overflow: 'auto',
            transition: 'max-height 0.3s ease',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-code)',
          }}
        >
          <pre style={{ margin: 0, whiteSpace: 'pre', fontFamily: 'inherit' }}>
            <code
              className="oct-prism-code"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </pre>
        </div>
        {needExpand && !expanded && (
          <div className="code-block-fade" aria-hidden />
        )}
      </div>
    </div>
  );
}
