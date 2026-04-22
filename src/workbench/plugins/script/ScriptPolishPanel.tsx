import type React from 'react';
import { scriptStyles } from './styles';

export function ScriptPolishPanel({
  panelRef,
  panelPosition,
  onMouseDown,
  onClick,
  onDragStart,
  onClose,
  polishDraft,
  polishError,
  onChangeDraft,
  onApply,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  panelPosition: { left: number; top: number } | null;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDragStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  onClose: () => void;
  polishDraft: string;
  polishError: string | null;
  onChangeDraft: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <div
      ref={panelRef as React.RefObject<HTMLDivElement>}
      onMouseDown={onMouseDown}
      onClick={onClick}
      style={{
        ...scriptStyles.polishPanel,
        ...(panelPosition
          ? {
            left: `${panelPosition.left}px`,
            top: `${panelPosition.top}px`,
            right: 'auto',
            bottom: 'auto',
          }
          : {}),
      }}
    >
      <div style={scriptStyles.polishHeader} onMouseDown={onDragStart}>
        <div style={scriptStyles.polishHeaderTitle}>
          AI 润色结果
        </div>
        <button
          type="button"
          data-no-drag="true"
          style={scriptStyles.polishActionBtn}
          onClick={onClose}
        >
          关闭
        </button>
      </div>

      <div style={scriptStyles.polishLabel}>润色内容（可编辑）</div>
      {polishError ? (
        <div style={scriptStyles.polishText}>{`失败：${polishError}`}</div>
      ) : (
        <textarea
          style={scriptStyles.polishEditor}
          value={polishDraft}
          onChange={(e) => onChangeDraft(e.target.value)}
          placeholder="润色结果会显示在这里，你可以直接编辑后再应用到原文"
        />
      )}

      <div style={scriptStyles.polishActions}>
        <button
          type="button"
          style={scriptStyles.polishActionBtn}
          onClick={onApply}
          disabled={!polishDraft.trim() || !!polishError}
          title={polishDraft.trim() ? '将当前编辑框内容替换回选中的原文片段' : '暂无可回填结果'}
        >
          应用到原文
        </button>
        <button
          type="button"
          style={scriptStyles.polishActionBtn}
          onClick={async () => {
            if (!polishDraft.trim()) return;
            try {
              await navigator.clipboard.writeText(polishDraft);
            } catch {
              // ignore clipboard failure
            }
          }}
        >
          复制润色结果
        </button>
      </div>
    </div>
  );
}
