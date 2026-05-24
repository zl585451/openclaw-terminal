import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../ui/chat/chatTypes';

const ipcRenderer =
  typeof window !== 'undefined' && typeof (window as any).require === 'function'
    ? (window as any).require('electron').ipcRenderer
    : {
        invoke: () => Promise.resolve(null),
        on: () => {},
        off: () => {},
        removeListener: () => {},
      };

export function useDesktopNotification(params: {
  isStreaming: boolean;
  messages: ChatMessage[];
  windowFocused: boolean;
  aiName: string;
  playTTSForMessage: (msg: ChatMessage) => void;
}): void {
  const { isStreaming, messages, windowFocused, aiName, playTTSForMessage } = params;
  const prevStreamingRef = useRef(false);
  const lastAssistantMsgIdRef = useRef(0);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && last.id !== lastAssistantMsgIdRef.current) {
      lastAssistantMsgIdRef.current = last.id;
    }
  }, [messages]);

  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.content) {
        if (!windowFocused) {
          const preview = lastMsg.content.slice(0, 30).replace(/\s+/g, ' ') + (lastMsg.content.length > 30 ? '...' : '');
          ipcRenderer.invoke('show-notification', { title: `${aiName || 'OpenClaw'} 回复`, body: preview });
        }
        playTTSForMessage(lastMsg);
      }
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, messages, windowFocused, playTTSForMessage, aiName]);
}
