import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import '../styles/CodeBlock.css';

interface CodeBlockProps {
  language?: string;
  children: string;
}

const LINE_HEIGHT = 18; // 12px font * 1.5
const LINES_COLLAPSED = 5;
const PADDING_V = 24;
const MAX_HEIGHT_COLLAPSED = LINES_COLLAPSED * LINE_HEIGHT + PADDING_V;

export default function CodeBlock({ language = 'text', children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const code = String(children).replace(/\n$/, '');
  const lines = code.split('\n');
  const needExpand = lines.length > LINES_COLLAPSED;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleExpand = () => setExpanded((e) => !e);

  const langLabel = language && language !== 'text' ? language : 'code';

  return (
    <div className={`code-block-wrap ${expanded ? 'code-block-expanded' : ''}`}>
      <div className="code-block-header">
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
            className="code-block-copy"
            onClick={handleCopy}
            title={copied ? '已复制' : '复制'}
          >
            {copied ? '✓' : '⎘'}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '12px 14px',
          fontSize: '12px',
          lineHeight: 1.5,
          background: '#0d1117',
          borderRadius: '0 0 4px 4px',
          maxHeight: needExpand && !expanded ? MAX_HEIGHT_COLLAPSED : 'none',
          overflow: needExpand && !expanded ? 'hidden' : 'visible',
        }}
        codeTagProps={{ style: { fontFamily: 'JetBrains Mono, Consolas, monospace' } }}
        showLineNumbers={false}
        PreTag="div"
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
