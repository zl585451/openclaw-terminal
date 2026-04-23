import type React from 'react';
import { scriptStyles } from './styles';

export function ScriptPolishPanel({
  panelRef,
  panelPosition,
  onMouseDown,
  onClick,
  onDragStart,
  onClose,
  originalText,
  polishDraft,
  polishError,
  onChangeDraft,
  onPolishWithAI,
  onDiscussInChat,
  isPolishing,
  onApply,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  panelPosition: { left: number; top: number } | null;
  onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDragStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  onClose: () => void;
  originalText: string;
  polishDraft: string;
  polishError: string | null;
  onChangeDraft: (value: string) => void;
  onPolishWithAI: () => void;
  onDiscussInChat: () => void;
  isPolishing: boolean;
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
          选区编辑面板
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

      <div style={scriptStyles.polishLabel}>当前绑定选段</div>
      <div style={scriptStyles.polishSourceBox}>{originalText || '（暂无选段）'}</div>

      <div style={scriptStyles.polishLabel}>编辑稿（可直接修改）</div>
      {polishError && (
        <div style={scriptStyles.polishText}>{`失败：${polishError}`}</div>
      )}
      <textarea
        style={scriptStyles.polishEditor}
        value={polishDraft}
        onChange={(e) => onChangeDraft(e.target.value)}
        placeholder="你可以直接改这段文字，也可以点下面的 AI 润色，或者先去聊天区和 AI 讨论"
      />

      <div style={scriptStyles.polishActions}>
        <button
          type="button"
          style={scriptStyles.polishActionBtn}
          onClick={onPolishWithAI}
          disabled={isPolishing || !originalText.trim()}
          title={originalText.trim() ? '让 AI 基于当前编辑稿继续润色' : '请先框选正文中的内容'}
        >
          {isPolishing ? '润色中...' : 'AI 润色'}
        </button>
        <button
          type="button"
          style={scriptStyles.polishActionBtn}
          onClick={onDiscussInChat}
          disabled={!originalText.trim()}
          title={originalText.trim() ? '把当前选段带到聊天区，继续和 AI 讨论怎么改' : '请先框选正文中的内容'}
        >
          去聊天讨论
        </button>
        <button
          type="button"
          style={scriptStyles.polishActionBtn}
          onClick={onApply}
          disabled={!polishDraft.trim()}
          title={polishDraft.trim() ? '将当前编辑框内容替换回选中的原文片段' : '暂无可回填结果'}
        >
          应用到原文
        </button>
      </div>

      <div style={scriptStyles.polishActions}>
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
          复制编辑稿
        </button>
      </div>
    </div>
  );
}
