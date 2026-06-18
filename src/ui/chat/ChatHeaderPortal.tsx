import React from 'react';
import { createPortal } from 'react-dom';

export interface ChatHeaderPortalProps {
  canvasOpen: boolean;
  onOpenCanvas: () => void;
  speakingMessageId: number | null | undefined;
  onStopTts: () => void;
  localTime: string;
  localDate: string;
}

export const ChatHeaderPortal: React.FC<ChatHeaderPortalProps> = (props) => {
  const {
    canvasOpen,
    onOpenCanvas,
    speakingMessageId,
    onStopTts,
    localTime,
    localDate,
  } = props;

  const portal = typeof document !== 'undefined' ? document.getElementById('chat-header-portal') : null;
  if (!portal) return null;

  return createPortal(
    <>
      {/* Canvas：右上角一个小图标按钮（仿 Claude，无文字） */}
      <button
        type="button"
        className={`header-icon-btn ${canvasOpen ? 'on' : ''}`}
        onClick={onOpenCanvas}
        title={canvasOpen ? 'Canvas 面板已打开' : '打开 Canvas 面板'}
        aria-label="Canvas"
      >
        ▣
      </button>

      {/* 仅在朗读进行中出现，提供一个停止入口 */}
      {speakingMessageId != null ? (
        <button
          type="button"
          className="header-icon-btn"
          onClick={onStopTts}
          title="停止当前语音播报"
          aria-label="停止语音"
        >
          ■
        </button>
      ) : null}

      {/* 时钟：挪到右上角 */}
      <div className="header-clock" title={localDate}>
        <span className="header-clock-time">{localTime || '--:--'}</span>
        <span className="header-clock-date">{localDate || ''}</span>
      </div>
    </>,
    portal,
  );
};
