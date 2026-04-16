import React, { useCallback, useState, useRef, useEffect } from 'react';
import { workbenchBus } from '../../workbench/WorkbenchBus';
import type { WorkbenchRoundtripContext } from '../../workbench/types';

type Intent = WorkbenchRoundtripContext['intent'];

interface QuickChip {
  label: string;
  prefill: string;
  intent: Intent;
}

const QUICK_CHIPS: QuickChip[] = [
  { label: '续写', prefill: '继续往下写一段，保持原有风格和节奏。', intent: 'continue' },
  { label: '补一个结尾', prefill: '为这份文档补一个有力的结尾段落。', intent: 'continue' },
  { label: '重写这一段', prefill: '把刚刚那一段重写一遍，', intent: 'rewrite' },
  { label: '换个风格', prefill: '把整份文档改成更', intent: 'rewrite' },
  { label: '解释你的思路', prefill: '解释一下你这样组织内容的思路，但不要修改文档。', intent: 'explain' },
];

interface DocumentAppendBarProps {
  disabled?: boolean;
}

export default function DocumentAppendBar({ disabled = false }: DocumentAppendBarProps) {
  const [value, setValue] = useState('');
  const [intent, setIntent] = useState<Intent>('continue');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 输入框高度自适应
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [value]);

  const handleChipClick = useCallback((chip: QuickChip) => {
    setValue(chip.prefill);
    setIntent(chip.intent);
    // 聚焦并把光标放到末尾，方便用户继续补写
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }, []);

  const handleSend = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    workbenchBus.requestSendMessage({ text, intent });
    setValue('');
    setIntent('continue');
  }, [value, intent, disabled]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="document-append-bar">
      <div className="document-append-chips">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className={`document-append-chip${intent === chip.intent && value === chip.prefill ? ' is-active' : ''}`}
            onClick={() => handleChipClick(chip)}
            disabled={disabled}
            title={`intent: ${chip.intent}`}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="document-append-input-row">
        <textarea
          ref={textareaRef}
          className="document-append-textarea"
          value={value}
          placeholder="让 AMY 继续完善这份文档…（Enter 发送，Shift+Enter 换行）"
          rows={1}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button
          type="button"
          className="document-append-send-btn"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
        >
          发送 →
        </button>
      </div>
      <div className="document-append-meta">
        当前模式：<span className="document-append-intent">{intent}</span>
        <span className="document-append-hint"> · AMY 会自动看到当前文档内容</span>
      </div>
    </div>
  );
}
