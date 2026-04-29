import React from 'react';
import { createPortal } from 'react-dom';
import type { GatewayCapabilities } from '../../hooks/useMessages';

export interface ChatHeaderPortalProps {
  ttsPlayback: boolean;
  onToggleTts: () => void;
  canvasOpen: boolean;
  onOpenCanvas: () => void;
  speakingMessageId: number | null | undefined;
  onStopTts: () => void;
  ttsError: string | null | undefined;
  wsConnected: boolean;
  wsReconnecting: boolean;
  wsError: string | null | undefined;
  gatewayCapabilities: GatewayCapabilities | null;
  onOpenSettings: () => void;
}

export const ChatHeaderPortal: React.FC<ChatHeaderPortalProps> = (props) => {
  const {
    ttsPlayback,
    onToggleTts,
    canvasOpen,
    onOpenCanvas,
    speakingMessageId,
    onStopTts,
    ttsError,
    wsConnected,
    wsReconnecting,
    wsError,
    gatewayCapabilities,
    onOpenSettings,
  } = props;

  const portal = typeof document !== 'undefined' ? document.getElementById('chat-header-portal') : null;
  if (!portal) return null;

  return createPortal(
    <>
      <button
        type="button"
        className={`voice-toggle ${ttsPlayback ? 'on' : 'off'}`}
        onClick={onToggleTts}
        title={ttsPlayback ? '回复朗读已开启（点击关闭）' : '点击开启回复朗读'}
      >
        {ttsPlayback ? '♪ VOICE ON' : '♪ VOICE OFF'}
      </button>
      <button
        type="button"
        className={`voice-toggle ${canvasOpen ? 'on' : ''}`}
        onClick={onOpenCanvas}
        title={canvasOpen ? 'Canvas 面板已打开' : '打开 Canvas 面板'}
      >
        ▣ OPEN CANVAS
      </button>
      {speakingMessageId != null ? (
        <button
          type="button"
          className="voice-toggle"
          onClick={onStopTts}
          title="停止当前语音播报"
        >
          ■ STOP VOICE
        </button>
      ) : null}
      {ttsError ? (
        <span className="ws-status disconnected" style={{ maxWidth: 320 }} title={ttsError}>
          TTS: {ttsError}
        </span>
      ) : null}
      <button
        type="button"
        className="voice-toggle"
        onClick={onOpenSettings}
        title="设置"
      >
        ⚙ SETTINGS
      </button>
      <span className={`ws-status ${wsConnected ? 'connected' : 'disconnected'}`} style={{ fontSize: '11px' }}>
        {wsConnected && <span className="status-dot" />}
        {wsConnected ? 'CONNECTED' : wsReconnecting ? '重连..' : wsError || 'DISCONNECTED'}
      </span>
      {wsConnected && (gatewayCapabilities?.toolsSupport ?? (gatewayCapabilities?.supportsTools ? 'supported' : 'unknown')) !== 'supported' ? (
        <span
          className="ws-status disconnected"
          style={{ fontSize: '11px' }}
          title={`工具能力：${gatewayCapabilities?.toolsSupport || 'unknown'} 来源：${gatewayCapabilities?.capabilitySource || 'unknown'}`}
        >
          {gatewayCapabilities?.toolsSupport === 'unknown' ? 'TOOL UNKNOWN' : 'NO TOOL EXEC'}
        </span>
      ) : null}
    </>,
    portal,
  );
};
