import { useState, useMemo } from 'react';
import type { OptionItem } from '../utils/optionBoxParser';
import '../styles/OptionBox.css';

const DEFAULT_OPTIONS_PER_PAGE = 5;

interface OptionBoxProps {
  messageId: number;
  options: OptionItem[];
  totalPages?: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onSelect: (value: string) => void;
}

export default function OptionBox({ messageId: _messageId, options, totalPages: totalPagesFromContent, currentPage, onPageChange, onSelect }: OptionBoxProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { totalPages: effectiveTotalPages, optionsPerPage } = useMemo(() => {
    if (totalPagesFromContent != null && totalPagesFromContent >= 1) {
      const optsPerPage = Math.ceil(options.length / totalPagesFromContent);
      return { totalPages: totalPagesFromContent, optionsPerPage: optsPerPage };
    }
    const perPage = DEFAULT_OPTIONS_PER_PAGE;
    return { totalPages: Math.ceil(options.length / perPage) || 1, optionsPerPage: perPage };
  }, [options.length, totalPagesFromContent]);

  const startIdx = (currentPage - 1) * optionsPerPage;
  const pageOptions = useMemo(
    () => options.slice(startIdx, startIdx + optionsPerPage),
    [options, startIdx, optionsPerPage]
  );

  const toggleSelect = (value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    const text = Array.from(selected).join(', ');
    setSelected(new Set());
    onSelect(text);
  };

  if (!options || options.length === 0) return null;

  return (
    <div className="option-box">
      <div className="option-checkbox-list">
        {pageOptions.map((opt) => {
          const checked = selected.has(opt.value);
          return (
            <label
              key={`${opt.num}-${opt.label}`}
              className={`option-checkbox-row ${checked ? 'checked' : ''}`}
            >
              <span className="option-checkbox-icon" aria-hidden />
              <span className="option-checkbox-label">{opt.label}</span>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleSelect(opt.value)}
                className="option-checkbox-input"
              />
            </label>
          );
        })}
      </div>

      {(effectiveTotalPages > 1 || options.length > DEFAULT_OPTIONS_PER_PAGE) && (
        <div className="option-pagination">
          <button
            type="button"
            className="option-page-btn"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            aria-label="上一页"
          >
            &lt;
          </button>
          <span className="option-page-info">
            {currentPage}/{effectiveTotalPages}
          </span>
          <button
            type="button"
            className="option-page-btn"
            disabled={currentPage >= effectiveTotalPages}
            onClick={() => onPageChange(Math.min(effectiveTotalPages, currentPage + 1))}
            aria-label="下一页"
          >
            &gt;
          </button>
        </div>
      )}

      <div className="option-actions">
        <span className="option-selected-count">已选 {selected.size}/{options.length}</span>
        <button
          type="button"
          className="option-confirm-btn"
          onClick={handleConfirm}
          disabled={selected.size === 0}
        >
          确认发送
        </button>
      </div>
    </div>
  );
}
