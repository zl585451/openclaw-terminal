import { useState, useMemo, useRef } from 'react';
import type { OptionItem } from '../utils/optionBoxParser';
import '../styles/OptionBox.css';

const DEFAULT_OPTIONS_PER_PAGE = 5;
const PILL_THRESHOLD = 4;

interface OptionBoxProps {
  messageId: number;
  options: OptionItem[];
  totalPages?: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onSelect: (value: string) => void;
  forcePills?: boolean;
  /** 调试用：pills在消息中的位置（第几个segment） */
  segmentIndex?: number;
  /** 调试用：pills前有多少内容（字符数） */
  contentBefore?: number;
  /** 调试用：pills后有多少内容（字符数） */
  contentAfter?: number;
}

/** ≤4个选项：Pill模式，单击直接发送 */
function PillOptionBox({ options, onSelect }: { options: OptionItem[]; onSelect: (v: string) => void }) {
  const [sent, setSent] = useState<string | null>(null);
  const pillsRef = useRef<HTMLDivElement>(null);

  const handleClick = (value: string) => {
    if (sent) return;
    setSent(value);
    onSelect(value);
  };

  return (
    <div className="option-pills" ref={pillsRef}>
      {options.map((opt) => (
        <button
          key={`${opt.num}-${opt.label}`}
          type="button"
          className={`option-pill ${sent === opt.value ? 'sent' : ''} ${sent && sent !== opt.value ? 'faded' : ''}`}
          onClick={() => handleClick(opt.value)}
          disabled={!!sent}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function OptionBox({ messageId: _messageId, options, totalPages: totalPagesFromContent, currentPage, onPageChange, onSelect, forcePills }: OptionBoxProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const isPillMode = forcePills === true ? true : forcePills === false ? false : options.length <= PILL_THRESHOLD;

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

  if (isPillMode) {
    return <PillOptionBox options={options} onSelect={onSelect} />;
  }

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
