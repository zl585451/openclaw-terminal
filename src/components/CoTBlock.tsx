import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../styles/CoTBlock.css';

interface CoTBlockProps {
  content: string;
  isStreaming?: boolean;
  isPlaceholder?: boolean;
  defaultExpanded?: boolean;
}

const CoTBlock: React.FC<CoTBlockProps> = ({
  content,
  isStreaming = false,
  isPlaceholder = false,
  defaultExpanded = false,   // 默认折叠，和 Claude 一致
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 流式时自动滚到底部（仅用户手动展开时生效）
  useEffect(() => {
    if (isStreaming && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, isStreaming, expanded]);

  // 计时器
  const [elapsed, setElapsed] = useState(0);
  const [finalElapsed, setFinalElapsed] = useState(0);
  const prevStreamingRef = useRef(isStreaming);

  useEffect(() => {
    if (!isStreaming) return;
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      setFinalElapsed(elapsed);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, elapsed]);

  const label = isPlaceholder
    ? '思考中...'
    : isStreaming
      ? `思考中 · ${elapsed}s`
      : `已思考 · ${finalElapsed || elapsed}s`;

  return (
    <div className={`cot-block ${isStreaming ? 'cot-streaming' : 'cot-done'} ${expanded ? 'cot-expanded' : 'cot-collapsed'}`}>
      <div className="cot-accent-bar" />
      <div className="cot-content-area">

        {/* 标题行：始终显示，点击展开/折叠 */}
        <div
          className="cot-header"
          onClick={() => !isPlaceholder && setExpanded(p => !p)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(p => !p); }}
        >
          <span className="cot-icon">
            {isStreaming
              ? <span className="cot-spinner"><span /><span /><span /></span>
              : '💭'
            }
          </span>
          <span className="cot-label">{label}</span>
          {/* 只有有内容且非占位时才显示箭头 */}
          {!isPlaceholder && content && (
            <span className={`cot-chevron ${expanded ? 'cot-chevron-up' : ''}`}>
              {expanded ? '▴' : '▾'}
            </span>
          )}
        </div>

        {/* 内容区：仅在展开且有内容时显示 */}
        {!isPlaceholder && content && (
          <div className={`cot-body-wrapper ${expanded ? 'cot-body-open' : 'cot-body-closed'}`}>
            <div className="cot-body" ref={bodyRef}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default CoTBlock;