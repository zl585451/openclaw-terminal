import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '../styles/CoTBlock.css';

interface CoTBlockProps {
  content: string;
  /** 流式阶段（正在接收内容） */
  isStreaming?: boolean;
}

const CoTBlock: React.FC<CoTBlockProps> = ({ content, isStreaming = false }) => {
  const [expanded, setExpanded] = useState(false);

  // 从 content 中提取步骤（按换行分割，过滤空行）
  const steps = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const stepCount = steps.length;
  // 摘要：取最后一个非空步骤作为预览
  const summary = stepCount > 0 ? steps[stepCount - 1] : '思考中...';
  // 预览文本截断
  const previewText = summary.length > 60 ? summary.slice(0, 57) + '...' : summary;

  return (
    <div
      className={`cot-block ${expanded ? 'cot-expanded' : 'cot-collapsed'} ${isStreaming ? 'cot-streaming' : ''}`}
    >
      <div
        className="cot-header"
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') setExpanded((prev) => !prev);
        }}
      >
        <span className="cot-icon">{isStreaming ? '⟳' : '💭'}</span>
        <span className="cot-label">{isStreaming ? '思考中...' : `思考过程（${stepCount}步）`}</span>
        {!isStreaming && <span className="cot-preview">{!expanded ? previewText : ''}</span>}
        <span className={`cot-chevron ${expanded ? 'cot-chevron-up' : ''}`}>▾</span>
      </div>

      {expanded && (
        <div className="cot-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};

export default CoTBlock;

