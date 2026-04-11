import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import '../styles/CoTBlock.css';

const MARKDOWN_REMARK_PLUGINS = [remarkGfm, remarkMath];
const MARKDOWN_REHYPE_PLUGINS = [rehypeKatex];

interface CoTBlockProps {
  content: string;
  isStreaming?: boolean;
  /** 占位模式：等待 AI 首个 token 时显示，不显示"已深度思考"文案，不渲染 body */
  isPlaceholder?: boolean;
  /** 极少数场景下需要挂载即展开；默认 false（仅手动点击展开） */
  defaultExpanded?: boolean;
  /** 轻量状态模式：仅显示状态条，不流式渲染正文 */
  compactStreaming?: boolean;
  labelOverride?: string;
  placeholderHint?: string;
}

const CoTBlock: React.FC<CoTBlockProps> = ({
  content,
  isStreaming = false,
  isPlaceholder = false,
  defaultExpanded,
  compactStreaming = false,
  labelOverride,
  placeholderHint,
}) => {
  const [expanded, setExpanded] = useState(() => defaultExpanded === true);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 流式时自动滚到底部
  useEffect(() => {
    if ((isStreaming || isPlaceholder) && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, isStreaming, expanded, isPlaceholder]);

  const steps = content.split('\n').filter((l) => l.trim().length > 0);
  const stepCount = steps.length;

  // 计算耗时占位（流式时显示动态数字）
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isStreaming && !isPlaceholder) return;
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isStreaming, isPlaceholder]);

  // 占位模式 / 流式：显示"思考中"；完成后：显示"已深度思考"
  const label = labelOverride ?? (isPlaceholder
    ? `思考中 · ${elapsed}s`
    : isStreaming
      ? `思考中 · ${elapsed}s`
      : `已深度思考（${stepCount}步）`);

  return (
    <div className={`cot-block ${expanded ? 'cot-expanded' : 'cot-collapsed'} ${isStreaming || isPlaceholder ? 'cot-streaming' : 'cot-done'}`}>
      {/* 左侧装饰条 */}
      <div className="cot-accent-bar" />

      <div className="cot-content-area">
        <div
          className="cot-header"
          onClick={() => setExpanded((prev) => !prev)}
          role="button"
          aria-expanded={expanded}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpanded((prev) => !prev);
            }
          }}
        >
          <span className="cot-icon">
            {isStreaming || isPlaceholder ? (
              <span className="cot-spinner">
                <span /><span /><span />
              </span>
            ) : (
              '💭'
            )}
          </span>
          <span className="cot-label">{label}</span>
          <span className={`cot-chevron ${expanded ? 'cot-chevron-up' : ''}`}>
            {expanded ? '▴' : '▾'}
          </span>
        </div>

        {isPlaceholder || compactStreaming ? (
          expanded && (
            <div className="cot-body-wrapper cot-body-open">
              <div className="cot-body cot-placeholder-hint">{placeholderHint || '等待思考内容输出…'}</div>
            </div>
          )
        ) : (
          <div className={`cot-body-wrapper ${expanded ? 'cot-body-open' : 'cot-body-closed'}`}>
            <div className="cot-body" ref={bodyRef}>
              <ReactMarkdown
                remarkPlugins={MARKDOWN_REMARK_PLUGINS}
                rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoTBlock;
