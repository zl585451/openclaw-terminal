import { useState, useCallback, useEffect } from 'react';
import {
  SOCRATIC_TEMPLATES,
  detectTemplate,
  formatSocraticResult,
  formatCustomResult,
  type SocraticTemplate,
  type SocraticRound,
} from '../utils/socraticTemplates';
import '../styles/SocraticPanel.css';

interface SocraticPanelProps {
  /** 最近几条对话的联合文本，用于上下文自动推断 */
  contextText: string;
  /** AI 自然格式解析出的动态轮次（优先级最高） */
  customRounds?: SocraticRound[];
  /** [THINK_MODE:xxx] 标记指定的模板 ID */
  suggestedTemplateId?: string | null;
  onComplete: (text: string) => void;
  onClose: () => void;
}

export default function SocraticPanel({
  contextText,
  customRounds,
  suggestedTemplateId,
  onComplete,
  onClose,
}: SocraticPanelProps) {
  const [template, setTemplate] = useState<SocraticTemplate | null>(null);
  const [activeRounds, setActiveRounds] = useState<SocraticRound[]>([]);
  const [isCustom, setIsCustom] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherText, setOtherText] = useState('');

  // 挂载时按优先级确定使用哪套 rounds
  useEffect(() => {
    if (customRounds && customRounds.length > 0) {
      // 优先：AI 动态生成的 rounds
      setActiveRounds(customRounds);
      setIsCustom(true);
      setShowPicker(false);
    } else {
      // 次优：THINK_MODE 标记 or 上下文检测
      const resolvedId = suggestedTemplateId ?? detectTemplate(contextText);
      const found = resolvedId
        ? SOCRATIC_TEMPLATES.find((t) => t.id === resolvedId) ?? null
        : null;
      if (found) {
        setTemplate(found);
        setActiveRounds(found.rounds);
        setIsCustom(false);
        setShowPicker(false);
      } else {
        setShowPicker(true);
      }
    }
  }, [customRounds, suggestedTemplateId, contextText]);

  const handlePickTemplate = useCallback((t: SocraticTemplate) => {
    setTemplate(t);
    setActiveRounds(t.rounds);
    setIsCustom(false);
    setShowPicker(false);
    setCurrentRound(0);
    setAnswers([]);
    setSelected(new Set());
    setOtherText('');
  }, []);

  const toggleOption = useCallback((id: string, isSingle: boolean) => {
    setSelected((prev) => {
      if (isSingle) return new Set([id]);
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleNext = useCallback(() => {
    if (selected.size === 0 || activeRounds.length === 0) return;
    const round = activeRounds[currentRound];
    const regularLabels = round.options
      .filter((o) => selected.has(o.id))
      .map((o) => o.label)
      .join('、');
    const otherPart = selected.has('__other__') && otherText.trim() ? otherText.trim() : '';
    const answerLabels = [regularLabels, otherPart].filter(Boolean).join('、');
    const newAnswers = [...answers, answerLabels];

    if (currentRound + 1 < activeRounds.length) {
      setAnswers(newAnswers);
      setCurrentRound((r) => r + 1);
      setSelected(new Set());
      setOtherText('');
    } else {
      const resultText = isCustom
        ? formatCustomResult(activeRounds, newAnswers)
        : template
          ? formatSocraticResult(template, newAnswers)
          : formatCustomResult(activeRounds, newAnswers);
      onComplete(resultText);
      onClose();
    }
  }, [selected, activeRounds, currentRound, answers, isCustom, template, onComplete, onClose]);

  const handleBack = useCallback(() => {
    if (currentRound > 0) {
      setCurrentRound((r) => r - 1);
      setAnswers((prev) => prev.slice(0, -1));
      setSelected(new Set());
      setOtherText('');
    } else {
      setTemplate(null);
      setActiveRounds([]);
      setIsCustom(false);
      setShowPicker(true);
      setSelected(new Set());
      setOtherText('');
    }
  }, [currentRound]);

  const totalRounds = activeRounds.length;
  const isLastRound = totalRounds > 0 && currentRound === totalRounds - 1;
  const round = activeRounds[currentRound];
  // 只选了"其他"但没填文字时不允许继续
  const canProceed =
    selected.size > 0 &&
    !(selected.size === 1 && selected.has('__other__') && !otherText.trim());

  return (
    <div
      className="socratic-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="socratic-panel">

        {/* ── Header：极简 ── */}
        <div className="socratic-header">
          <span className="socratic-title">◈</span>
          <button
            type="button"
            className="socratic-close-btn"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* ── 进度点 ── */}
        {!showPicker && totalRounds > 1 && (
          <div className="socratic-progress">
            {Array.from({ length: totalRounds }).map((_, i) => (
              <div
                key={i}
                className={`socratic-progress-dot ${
                  i < currentRound ? 'done' : i === currentRound ? 'active' : ''
                }`}
              />
            ))}
          </div>
        )}

        {/* ── Body ── */}
        <div className="socratic-body">
          {showPicker ? (
            <>
              <div className="socratic-question">你现在想在哪方面想清楚一些？</div>
              <div className="socratic-template-grid">
                {SOCRATIC_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className="socratic-template-card"
                    onClick={() => handlePickTemplate(t)}
                  >
                    <span className="socratic-template-icon">{t.icon}</span>
                    <span className="socratic-template-name">{t.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : round ? (
            <>
              <div className="socratic-question">{round.question}</div>
              <div className="socratic-options">
                {round.options.map((opt) => {
                  const isSingle = round.type === 'single';
                  const isSelected = selected.has(opt.id);
                  return (
                    <div
                      key={opt.id}
                      className={`socratic-option-row ${isSingle ? 'radio' : ''} ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleOption(opt.id, isSingle)}
                    >
                      <span className="socratic-option-icon" aria-hidden />
                      <span className="socratic-option-label">{opt.label}</span>
                    </div>
                  );
                })}
                {/* 其他：可自由填写 */}
                {(() => {
                  const isSingle = round.type === 'single';
                  const isSelected = selected.has('__other__');
                  return (
                    <div
                      className={`socratic-option-row ${isSingle ? 'radio' : ''} ${isSelected ? 'selected' : ''}`}
                    >
                      <span
                        className="socratic-option-icon"
                        aria-hidden
                        onClick={() => toggleOption('__other__', isSingle)}
                      />
                      {isSelected ? (
                        <input
                          className="socratic-other-input"
                          placeholder="填写你的情况..."
                          value={otherText}
                          onChange={(e) => setOtherText(e.target.value)}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="socratic-option-label socratic-option-other"
                          onClick={() => toggleOption('__other__', isSingle)}
                        >
                          其他...
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          ) : null}
        </div>

        {/* ── Footer ── */}
        {!showPicker && (
          <div className="socratic-footer">
            <button type="button" className="socratic-back-btn" onClick={handleBack}>
              ← 返回
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {selected.size > 0 && (
                <span className="socratic-count">已选 {selected.size}</span>
              )}
              <button
                type="button"
                className="socratic-next-btn"
                onClick={handleNext}
                disabled={!canProceed}
              >
                {isLastRound ? '填入输入框 →' : '下一步 →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
