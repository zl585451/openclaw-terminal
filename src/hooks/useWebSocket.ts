import { useState, useEffect } from 'react';
import type { CanvasEvent, CanvasRoundtripContext } from '../contexts/CanvasContext';

const ipcRenderer = typeof window !== 'undefined' && typeof (window as any).require === 'function'
  ? (window as any).require('electron').ipcRenderer
  : { invoke: () => Promise.resolve(null), on: () => {}, off: () => {}, removeListener: () => {} };

interface UseWebSocketOptions {
  onChatDelta: (content: string, isDelta: boolean) => void;
  onChatDone: (content: string, isSystemReply: boolean) => void;
  onAgentPhase: (phase: 'idle' | 'thinking' | 'typing' | 'tool_executing', elapsed?: number) => void;
  onToolEvent: (payload: any) => void;
  onCanvasEvent: (event: CanvasEvent) => void;
  onUsage: (usage: any, isSnapshot: boolean) => void;
  onModelName: (name: string) => void;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReconnecting, setWsReconnecting] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [nocturneOnline, setNocturneOnline] = useState(false);

  const isDeltaPayload = (data: any): boolean => {
    if (!data) return false;
    const src = data.data ?? data.payload;
    // 检state 字段delta 字段
    return src?.state === 'delta' || src?.delta !== undefined && src?.delta !== null;
  };

  const extractContent = (data: any): string => {
    if (!data) return '';
    
    // 新格式：{ type: 'event', event: 'chat', payload: { delta: '...', text: '...' } }
    if (data.type === 'event' && data.event === 'chat' && data.payload) {
      const p = data.payload;
      if (p.delta !== undefined) return String(p.delta || '');
      if (p.text !== undefined) return String(p.text || '');
      if (p.content !== undefined) return String(p.content || '');
    }
    
    // 兼容旧格式
    if (data.data) {
      const d = data.data;
      if (d.delta !== undefined) return String(d.delta || '');
      if (d.text !== undefined) return String(d.text || '');
      if (d.content !== undefined) return String(d.content || '');
    }
    
    if (data.payload) {
      const p = data.payload;
      if (p.delta !== undefined) return String(p.delta || '');
      if (p.text !== undefined) return String(p.text || '');
      if (p.content !== undefined) return String(p.content || '');
    }
    
    // 直接字段
    if (data.delta !== undefined) return String(data.delta || '');
    if (data.text !== undefined) return String(data.text || '');
    if (data.content !== undefined) return String(data.content || '');
    
    return '';
  };


  const handleIncomingMessage = (
    data: {
      content?: string;
      text?: string;
      delta?: string;
      done?: boolean;
      type?: string;
      phase?: string;
      event?: string;
      action?: string;
      model?: string;
      message?: any;
      usage?: any;
      payload?: any;
      data?: any;
      connected?: boolean;
      snapshot?: boolean;
      elapsed?: number;
    }
  ) => {
    if (!data || data.type === 'status' || data.connected !== undefined) return;

    // agent-phase 事件
    if (data.type === 'agent-phase' || data.event === 'agent-phase') {
      const phase = data.phase as 'idle' | 'thinking' | 'typing' | 'tool_executing';
      const elapsed = data.elapsed;
      if (phase) {
        options.onAgentPhase(phase, elapsed);
      }
      return;
    }

    // tool 事件
    if (data.type === 'tool' || data.event === 'tool') {
      const payload = data.payload || data.data || data;
      options.onToolEvent(payload);
      return;
    }

    if (data.type === 'canvas' || data.event === 'canvas') {
      const payload = data.payload || data.data || data;
      const action = data.action || payload?.action;
      const canvasPayload = payload?.payload ?? payload;
      if (action) {
        options.onCanvasEvent({
          type: 'canvas',
          action,
          payload: canvasPayload,
        } as CanvasEvent);
      }
      return;
    }

    // usage 事件
    if (data.type === 'usage' || data.event === 'usage') {
      const usage = data.payload || data.data || data;
      const isSnapshot = data.snapshot === true;
      options.onUsage(usage, isSnapshot);
      
      // 提取模型名称
      if (usage.model != null) {
        options.onModelName(String(usage.model));
      }
      return;
    }

    let content = extractContent(data);
    content = (content || '').replace(/\u200B/g, ''); // 过滤流式心跳字符（零宽空格）
    const done = (data.done === true) || (data.payload?.done === true);
    const isDelta = isDeltaPayload(data);

    // DEBUG: 当收到 chat 事件但提取到的文本为空时，打印原始结构（截断）
    try {
      if (data.event === 'chat' && !content && !done) {
        const debugStr = JSON.stringify(data).slice(0, 500);
        console.warn('[useWebSocket] chat event with empty content:', debugStr);
      }
    } catch (e) {
      // ignore JSON stringify errors
    }

    if (!content && !done) return;

    // 检查是否为系统回复
    const isSystemReply = data.type === 'system' || data.event === 'system' || 
                         (data.payload && data.payload.type === 'system');

    if (done) {
      options.onChatDone(content, isSystemReply);
    } else {
      options.onChatDelta(content, isDelta);
    }
  };

  useEffect(() => {
    ipcRenderer.invoke('openclaw-status').then((r: { connected?: boolean; sessionKey?: string }) => {
      if (r?.connected === true) {
        setWsConnected(true);
      }
    });

    const handleStatus = (_: any, status: { connected?: boolean; reconnecting?: boolean; error?: string }) => {
      if (status.connected !== undefined) {
        setWsConnected(status.connected);
        setWsReconnecting(false);
        setWsError(null);
      }
      if (status.reconnecting !== undefined) {
        setWsReconnecting(status.reconnecting);
      }
      if (status.error !== undefined) {
        setWsError(status.error);
        setWsReconnecting(false);
      }
    };

    const handleMessage = (_: any, msg: any) => {
      try {
        handleIncomingMessage(msg);
      } catch (e) {
        console.error('[useWebSocket] handleMessage error:', e);
      }
    };

    ipcRenderer.on('openclaw-status', handleStatus);
    ipcRenderer.on('openclaw-message', handleMessage);

    return () => {
      ipcRenderer.removeListener('openclaw-status', handleStatus);
      ipcRenderer.removeListener('openclaw-message', handleMessage);
    };
  }, []);

  // 周期性检查 Nocturne 记忆系统健康状态
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const checkNocturne = async () => {
      try {
        const result = await ipcRenderer.invoke('nocturne-health');
        setNocturneOnline(result?.ok === true);
      } catch {
        setNocturneOnline(false);
      }
    };

    checkNocturne();
    timer = setInterval(checkNocturne, 15000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  const send = async (
    content: string,
    imageDataUrl?: string,
    files?: any[],
    pacingMs?: number,
    canvasContext?: CanvasRoundtripContext
  ): Promise<{success?: boolean}> => {
    try {
      const result = await ipcRenderer.invoke('openclaw-send', {
        content: content.trim(),
        imageDataUrl,
        files,
        pacingMs,
        canvasContext,
      });
      return result || {};
    } catch (error) {
      console.error('[useWebSocket] send error:', error);
      return {};
    }
  };

  return {
    wsConnected,
    wsReconnecting,
    wsError,
    nocturneOnline,
    send,
  };
}
