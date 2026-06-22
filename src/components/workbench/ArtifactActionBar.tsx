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
  { label: '补一个结尾', prefill: '为这个 artifact 补一个有力的结尾段落。', intent: 'continue' },
  { label: '重写这一段', prefill: '把刚刚那一段重写一遍，', intent: 'rewrite' },
  { label: '换个风格', prefill: '把当前 artifact 改成更', intent: 'rewrite' },
  { label: '解释思路', prefill: '解释一下你这样组织内容的思路，但不要修改 artifact。', intent: 'explain' },
];

interface ArtifactActionBarProps {
  disabled?: boolean;
}

export default function ArtifactActionBar({ disabled = false }: ArtifactActionBarProps) {
  const [value, setValue] = useState('');
  const [intent, setIntent] = useState<Intent>('continue');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [value]);

  const handleChipClick = useCallback((chip: QuickChip) => {
    setValue(chip.prefill);
    setIntent(chip.intent);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
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
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="artifact-action-bar">
      <div className="artifact-action-chips">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className={`artifact-action-chip${intent === chip.intent && value === chip.prefill ? ' is-active' : ''}`}
            onClick={() => handleChipClick(chip)}
            disabled={disabled}
            title={`intent: ${chip.intent}`}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <div className="artifact-action-input-row">
        <textarea
          ref={textareaRef}
          className="artifact-action-textarea"
          value={value}
          placeholder="让 AMY 继续完善当前 artifact…（Enter 发送，Shift+Enter 换行）"
          rows={1}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button
          type="button"
          className="artifact-action-send-btn"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
        >
          发送 →
        </button>
      </div>
      <div className="artifact-action-meta">
        当前意图：<span className="artifact-action-intent">{intent}</span>
        <span className="artifact-action-hint"> · AMY 会自动看到当前 artifact 内容</span>
      </div>
    </div>
  );
}
