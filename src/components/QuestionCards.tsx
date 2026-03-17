import { useState } from 'react';
import type { OptionItem } from '../utils/optionBoxParser';
import '../styles/QuestionCards.css';

interface QuestionCardsProps {
  questions: OptionItem[];
  onQuote: (text: string) => void;
}

export default function QuestionCards({ questions, onQuote }: QuestionCardsProps) {
  const [quoted, setQuoted] = useState<number | null>(null);

  const handleClick = (item: OptionItem) => {
    setQuoted(item.num);
    // 注入「> 问题原文」到输入框，用户在引用下方直接作答
    onQuote(`> ${item.value}\n\n`);
    // 1.5s 后重置高亮，允许再次点击其他问题
    setTimeout(() => setQuoted(null), 1500);
  };

  if (!questions || questions.length === 0) return null;

  return (
    <div className="question-cards">
      <div className="question-cards-header">
        <span className="question-cards-icon">◌</span>
        <span className="question-cards-title">思考一下</span>
        <span className="question-cards-hint-global">点击任意问题可引用到输入框</span>
      </div>
      <div className="question-cards-list">
        {questions.map((q) => (
          <div
            key={q.num}
            className={`question-card ${quoted === q.num ? 'quoted' : ''}`}
            onClick={() => handleClick(q)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleClick(q)}
          >
            <span className="question-card-num">{q.num}</span>
            <span className="question-card-text">{q.label}</span>
            <span className="question-card-action">
              {quoted === q.num ? '✓ 已引用' : '↩ 回复'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
