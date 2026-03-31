import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../styles/CoTBlock.css';

interface CoTBlockProps {
  content: string;
  isStreaming?: boolean;
  isPlaceholder?: boolean;  // 占位态：内容还没来，只显示标题行
}

const CoTBlock: React.FC<CoTBlockProps> = ({ content, isStreaming = false, isPlaceholder = false }) => {
  // 占位态和流式态都展开；但占位态不显示内容区（避免空白撑开）
  const [expanded, setExpanded] = useState(true);
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

  // 计时器：流式中实时计数；结束时保存最终秒数
  const [elapsed, setElapsed] = useState(0);
  const [finalElapsed, setFinalElapsed] = useState(0);
  const prevStreamingRef2 = useRef(isStreaming); // 独立 ref 避免命名冲突

  useEffect(() => {
    if (!isStreaming) return;
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  // 流式结束时锁定 finalElapsed
  useEffect(() => {
    if (prevStreamingRef2.current && !isStreaming) {
      setFinalElapsed(elapsed);
    }
    prevStreamingRef2.current = isStreaming;
  }, [isStreaming, elapsed]);

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
            {isPlaceholder
              ? '思考中...'
              : isStreaming
                ? `思考中 · ${elapsed}s`
                : `已思考 · ${finalElapsed || elapsed}s`   /* 不再显示"步"数 */
            }
          </span>
          <span className={`cot-chevron ${expanded ? 'cot-chevron-up' : ''}`}>
            {expanded ? '▴' : '▾'}
          </span>
        </div>

        {/* 占位态：不渲染内容区，只显示标题动画 */}
        {!isPlaceholder && (
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

