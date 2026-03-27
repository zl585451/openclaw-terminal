import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../styles/CoTBlock.css';

interface CoTBlockProps {
  content: string;
  isStreaming?: boolean;
}

const CoTBlock: React.FC<CoTBlockProps> = ({ content, isStreaming = false }) => {
  const [expanded, setExpanded] = useState(true); // 流式时默认展开
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const prevStreamingRef = useRef(isStreaming);

  // 流式结束后自动折叠
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && !autoCollapsed) {
      const timer = setTimeout(() => {
        setExpanded(false);
        setAutoCollapsed(true);
      }, 800);
      return () => clearTimeout(timer);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, autoCollapsed]);

  // 流式时自动滚到底部
  useEffect(() => {
    if (isStreaming && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, isStreaming, expanded]);

  const steps = content.split('\n').filter((l) => l.trim().length > 0);
  const stepCount = steps.length;

  // 计算耗时占位（流式时显示动态数字）
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isStreaming) return;
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  return (
    <div className={`cot-block ${expanded ? 'cot-expanded' : 'cot-collapsed'} ${isStreaming ? 'cot-streaming' : 'cot-done'}`}>
      {/* 左侧装饰条 */}
      <div className="cot-accent-bar" />

      <div className="cot-content-area">
        <div
          className="cot-header"
          onClick={() => setExpanded((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setExpanded((prev) => !prev);
          }}
        >
          <span className="cot-icon">
            {isStreaming ? (
              <span className="cot-spinner">
                <span /><span /><span />
              </span>
            ) : (
              '💭'
            )}
          </span>
          <span className="cot-label">
            {isStreaming ? `思考中 · ${elapsed}s` : `已深度思考（${stepCount}步）`}
          </span>
          <span className={`cot-chevron ${expanded ? 'cot-chevron-up' : ''}`}>
            {expanded ? '▴' : '▾'}
          </span>
        </div>

        <div className={`cot-body-wrapper ${expanded ? 'cot-body-open' : 'cot-body-closed'}`}>
          <div className="cot-body" ref={bodyRef}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoTBlock;

