import { memo, useState } from 'react';
import AmyAvatar from '../../components/AmyAvatar';
import { formatTime, formatFullTime } from '../../utils/formatTime';
import type { ChatMessage } from './chatTypes';
import type { TurnUiState } from '../../core/turnUiState';
import { getTurnUiBadgeLabel, isTurnUiThinking } from './messageListHelpers';

export const MessageMeta = memo(function MessageMeta({ timestamp }: { timestamp: string | number | undefined }) {
  const [hoverTime, setHoverTime] = useState(false);
  return (
    <span
      className="msg-timestamp"
      onMouseEnter={() => setHoverTime(true)}
      onMouseLeave={() => setHoverTime(false)}
      style={{
        color: hoverTime ? 'var(--accent-primary)' : 'var(--text-secondary)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-mono)',
        cursor: 'default',
        transition: 'color 0.2s',
        letterSpacing: '0.5px',
      }}
    >
      {hoverTime ? formatFullTime(timestamp) : formatTime(timestamp)}
    </span>
  );
});

export const MessageHeader = memo(
  function MessageHeader({
    msg,
    isStreamingMsg,
    turnUiState,
    suppressPhaseBadge,
    assistantName,
  }: {
    msg: ChatMessage;
    isStreamingMsg: boolean;
    turnUiState: TurnUiState;
    /** 与头部带内 CoT 并存且 phase 为 thinking 时隐藏，避免与 CoT 标题双「思考中」 */
    suppressPhaseBadge?: boolean;
    assistantName: string;
  }) {
    const badgeLabel = getTurnUiBadgeLabel(turnUiState.phase);
    const showBadge =
      isStreamingMsg &&
      badgeLabel != null &&
      !(suppressPhaseBadge && isTurnUiThinking(turnUiState.phase));
    return (
      <div className="msg-header">
        {msg.role === 'user' ? (
          <span className="msg-label">YOU ▶</span>
        ) : (
          <div className="amy-header-row">
            <AmyAvatar isStreaming={false} size={32} />
            <span
              style={{
                color: 'var(--accent-primary)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '2px',
              }}
            >
              {assistantName}
            </span>
            <span className={`agent-status-slot ${showBadge ? 'is-visible' : ''}`} aria-hidden={!showBadge}>
              <span className="agent-status-badge">
                {badgeLabel}
              </span>
            </span>
          </div>
        )}
      </div>
    );
  },
  (a, b) =>
    a.msg.id === b.msg.id &&
    a.msg.role === b.msg.role &&
    !!a.msg.isStreaming === !!b.msg.isStreaming &&
    a.isStreamingMsg === b.isStreamingMsg &&
    a.turnUiState === b.turnUiState &&
    !!a.suppressPhaseBadge === !!b.suppressPhaseBadge &&
    a.assistantName === b.assistantName
);
