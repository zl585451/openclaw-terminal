import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { ClarifyField } from '../../core/clarifyCard/types';
import type { FieldDraft } from '../../hooks/useInlineInquiry';
import './InlineInquiry.css';

interface Props {
  field: ClarifyField;
  draft: FieldDraft;
  currentPage: number;
  totalPages: number;
  onUpdate: (next: Partial<FieldDraft>) => void;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}

const CUSTOM_MAX_LEN = 60;
const TEXT_MAX_LEN = 120;

export const InlineInquiry: React.FC<Props> = ({
  field,
  draft,
  currentPage,
  totalPages,
  onUpdate,
  onNext,
  onPrev,
  onSkip,
  onDismiss,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusIndex, setFocusIndex] = useState<number>(0);
  const [showKeyboardFocus, setShowKeyboardFocus] = useState(false);

  useEffect(() => {
    setFocusIndex(0);
    setShowKeyboardFocus(false);
    rootRef.current?.focus();
  }, [field.id]);

  const textInputRef = useRef<HTMLInputElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (field.type === 'text') {
      setTimeout(() => textInputRef.current?.focus(), 50);
    }
  }, [field.id, field.type]);

  useEffect(() => {
    if (draft.isCustomMode) {
      setTimeout(() => customInputRef.current?.focus(), 50);
    }
  }, [draft.isCustomMode]);

  const options = field.options || [];
  const hasCustomSlot = field.type !== 'text';
  const customLabel = field.custom_label || '自己说';
  const focusableCount = options.length + (hasCustomSlot ? 1 : 0);
  const customIndex = options.length;

  const handlePickOption = useCallback((opt: string) => {
    if (field.type === 'multi') {
      // 改为单选语义：每页只保留一个选择
      onUpdate({ value: [opt], isCustomMode: false, customText: '' });
    } else {
      onUpdate({ value: opt, isCustomMode: false, customText: '' });
      setTimeout(onNext, 120);
    }
  }, [field.type, onUpdate, onNext]);

  const handleEnterCustomMode = useCallback(() => {
    onUpdate({ isCustomMode: true, value: field.type === 'multi' ? [] : '' });
    setFocusIndex(customIndex);
  }, [onUpdate, field.type, customIndex]);

  const optionDisabled = draft.isCustomMode;
  const selectedSingleValue = typeof draft.value === 'string' ? draft.value : '';
  const selectedMultiValue = Array.isArray(draft.value) ? draft.value[0] : '';

  const isOptionSelected = useCallback((opt: string) => {
    if (field.type === 'multi') {
      return selectedMultiValue === opt && !draft.isCustomMode;
    }
    return selectedSingleValue === opt && !draft.isCustomMode;
  }, [field.type, selectedMultiValue, selectedSingleValue, draft.isCustomMode]);

  const handleCustomSubmit = useCallback(() => {
    const v = draft.customText.trim();
    if (!v) return;
    onNext();
  }, [draft.customText, onNext]);

  const handleTextInputChange = useCallback((v: string) => {
    onUpdate({ value: v.slice(0, TEXT_MAX_LEN) });
  }, [onUpdate]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (field.type === 'text') return;
    if (draft.isCustomMode) return;
    setShowKeyboardFocus(true);

    const key = e.key;

    if (key === 'Escape') {
      e.preventDefault();
      onDismiss();
      return;
    }

    if (key === 'ArrowDown') {
      e.preventDefault();
      setFocusIndex((i) => Math.min(focusableCount - 1, i + 1));
      return;
    }

    if (key === 'ArrowUp') {
      e.preventDefault();
      setFocusIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key === 'ArrowLeft') {
      e.preventDefault();
      onPrev();
      return;
    }

    if (key === 'ArrowRight') {
      e.preventDefault();
      onSkip();
      return;
    }

    if (key === 'Enter') {
      e.preventDefault();
      if (focusIndex < options.length) {
        handlePickOption(options[focusIndex]);
      } else if (hasCustomSlot && focusIndex === customIndex) {
        handleEnterCustomMode();
      }
      return;
    }

    if (/^[1-9]$/.test(key)) {
      e.preventDefault();
      const idx = parseInt(key, 10) - 1;
      if (idx < options.length) {
        handlePickOption(options[idx]);
      } else if (hasCustomSlot && idx === options.length) {
        handleEnterCustomMode();
      }
      return;
    }
  }, [
    field.type,
    draft.isCustomMode,
    focusIndex,
    focusableCount,
    options,
    hasCustomSlot,
    customIndex,
    handlePickOption,
    handleEnterCustomMode,
    onSkip,
    onPrev,
    onDismiss,
  ]);

  const multiSelected = field.type === 'multi'
    ? (Array.isArray(draft.value) ? draft.value : [])
    : [];

  return (
    <div
      ref={rootRef}
      className="oct-inq"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="region"
      aria-label="澄清询问器"
    >
      <div className="oct-inq-header">
        <div className="oct-inq-title">{field.label}</div>
        <div className="oct-inq-meta">
          <button
            type="button"
            className="oct-inq-page-btn"
            onClick={onPrev}
            disabled={currentPage === 0}
            aria-label="上一题"
          >
            ‹
          </button>
          <span className="oct-inq-page-text">{currentPage + 1} / {totalPages}</span>
          <button
            type="button"
            className="oct-inq-page-btn"
            onClick={onSkip}
            aria-label="下一题"
          >
            ›
          </button>
          <button
            type="button"
            className="oct-inq-close"
            onClick={onDismiss}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      </div>

      <div className="oct-inq-body">
        {field.type === 'text' && (
          <div className="oct-inq-text-wrap">
            <input
              ref={textInputRef}
              type="text"
              className="oct-inq-text-input"
              placeholder={field.placeholder || '输入内容...'}
              value={typeof draft.value === 'string' ? draft.value : ''}
              maxLength={TEXT_MAX_LEN}
              onChange={(e) => handleTextInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onNext();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onDismiss();
                }
              }}
            />
          </div>
        )}

        {(field.type === 'single' || field.type === 'confirm' || field.type === 'multi') && (
          <ul className="oct-inq-options" role="listbox">
            {options.map((opt, idx) => {
              const isFocused = focusIndex === idx;
              const isSelected = isOptionSelected(opt);

              return (
                <li
                  key={opt}
                  className={`oct-inq-opt ${showKeyboardFocus && isFocused ? 'is-focused' : ''} ${isSelected ? 'is-selected' : ''} ${optionDisabled ? 'is-disabled' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setShowKeyboardFocus(false);
                    handlePickOption(opt);
                  }}
                >
                  <span className="oct-inq-opt-num">{idx + 1}</span>
                  <span className="oct-inq-opt-text">{opt}</span>
                </li>
              );
            })}

            {hasCustomSlot && (
              <li
                className={`oct-inq-opt oct-inq-opt--custom ${showKeyboardFocus && focusIndex === customIndex ? 'is-focused' : ''} ${draft.isCustomMode ? 'is-selected' : ''}`}
                onClick={() => {
                  setShowKeyboardFocus(false);
                  handleEnterCustomMode();
                }}
              >
                <span className="oct-inq-opt-num oct-inq-opt-num--icon">✎</span>
                {draft.isCustomMode ? (
                  <div className="oct-inq-custom-row" onClick={(e) => e.stopPropagation()}>
                    <input
                      ref={customInputRef}
                      type="text"
                      className="oct-inq-custom-input"
                      placeholder={field.custom_placeholder || '自己说几个字...'}
                      value={draft.customText}
                      maxLength={CUSTOM_MAX_LEN}
                      onChange={(e) => onUpdate({ customText: e.target.value.slice(0, CUSTOM_MAX_LEN) })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCustomSubmit();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          onUpdate({ isCustomMode: false, customText: '' });
                        }
                        e.stopPropagation();
                      }}
                    />
                    <button
                      type="button"
                      className="oct-inq-custom-submit"
                      disabled={!draft.customText.trim()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCustomSubmit();
                      }}
                    >
                      确定
                    </button>
                  </div>
                ) : (
                  <span className="oct-inq-opt-text oct-inq-opt-text--muted">{customLabel}</span>
                )}
              </li>
            )}

          </ul>
        )}

        {field.type === 'multi' && (
          <div className="oct-inq-multi-confirm">
            <button
              type="button"
              className="oct-inq-btn oct-inq-btn--primary"
              onClick={onNext}
              disabled={multiSelected.length === 0 && !draft.isCustomMode}
            >
              {currentPage === totalPages - 1 ? '完成' : '下一题'}
            </button>
          </div>
        )}

        {field.type === 'text' && (
          <div className="oct-inq-text-actions">
            <button
              type="button"
              className="oct-inq-btn oct-inq-btn--primary"
              onClick={onNext}
              disabled={!(typeof draft.value === 'string' && draft.value.trim())}
            >
              {currentPage === totalPages - 1 ? '完成' : '下一题'}
            </button>
          </div>
        )}
      </div>

      <div className="oct-inq-footer">
        <div className="oct-inq-footer-hints">
          <span>↑↓ 导航</span>
          <span>·</span>
          <span>1-9 快选</span>
          <span>·</span>
          <span>Enter 确认</span>
          <span>·</span>
          <span>Esc 关闭</span>
        </div>
        <button
          type="button"
          className="oct-inq-skip-pill"
          onClick={onSkip}
        >
          SKIP
        </button>
      </div>
    </div>
  );
};
