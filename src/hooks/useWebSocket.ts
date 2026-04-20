import { useState, useEffect, useRef } from 'react';
import type { WorkbenchRoundtripContext, CanvasEvent, WorkbenchEvent } from '../workbench/types';
import type { ClarifyCardSpec } from '../core/clarifyCard/types';

const ipcRenderer = typeof window !== 'undefined' && typeof (window as any).require === 'function'
  ? (window as any).require('electron').ipcRenderer
  : { invoke: () => Promise.resolve(null), on: () => {}, off: () => {}, removeListener: () => {} };

interface UseWebSocketOptions {
  onChatDelta: (content: string, isDelta: boolean, isSystemReply: boolean, turnId?: string) => void;
  onChatDone: (content: string, isSystemReply: boolean, turnId?: string) => void;
  onAgentPhase: (phase: 'idle' | 'thinking' | 'typing' | 'tool_executing', elapsed?: number) => void;
  onToolEvent: (payload: any) => void;
  onClarifyOpen?: (spec: ClarifyCardSpec) => void;
  onKeepalive?: (payload: { phase: string; elapsedMs: number; toolName?: string | null }) => void;
  onGatewayCapabilities?: (capabilities: {
    model?: string;
    toolsSupport?: 'supported' | 'unknown' | 'unsupported';
    capabilitySource?: string;
    supportsTools?: boolean;
    supportsStreamOptions?: boolean;
    mcpReady?: boolean;
    mcpServers?: number;
    mcpConnectedServers?: number;
  } | null) => void;
  onWorkbenchEvent: (event: CanvasEvent | WorkbenchEvent) => void;
  onCanvasEvent?: (event: CanvasEvent | WorkbenchEvent) => void;
  onUsage: (usage: any, isSnapshot: boolean) => void;
  onModelName: (name: string) => void;
}

function isDeltaPayload(data: any): boolean {
  if (!data) return false;
  const src = data.data ?? data.payload;
  return src?.state === 'delta' || (src?.delta !== undefined && src?.delta !== null);
}

function extractContent(data: any): string {
  if (!data) return '';

  if (data.type === 'event' && data.event === 'chat' && data.payload) {
    const p = data.payload;
    if (p.delta !== undefined) return String(p.delta || '');
    if (p.text !== undefined) return String(p.text || '');
    if (p.content !== undefined) return String(p.content || '');
  }

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

  if (data.delta !== undefined) return String(data.delta || '');
  if (data.text !== undefined) return String(data.text || '');
  if (data.content !== undefined) return String(data.content || '');

  return '';
}

function extractEmbeddedUsage(data: any): any {
  if (!data) return null;
  return data.payload?.usage
    ?? data.data?.usage
    ?? data.usage
    ?? null;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReconnecting, setWsReconnecting] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [nocturneOnline, setNocturneOnline] = useState(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const emitWorkbenchEvent = (event: CanvasEvent | WorkbenchEvent) => {
    optionsRef.current.onWorkbenchEvent(event);
    optionsRef.current.onCanvasEvent?.(event);
  };

  useEffect(() => {
    const handleIncomingMessage = (
      data: { content?: string; text?: string; delta?: string; done?: boolean; type?: string; phase?: string; event?: string; action?: string; message?: any; usage?: any; payload?: any; data?: any; connected?: boolean; snapshot?: boolean; elapsed?: number; turnId?: string }
    ) => {
      const opt = optionsRef.current;
      if (!data || data.type === 'status' || data.connected !== undefined) return;

      if (data.type === 'agent-phase' || data.event === 'agent-phase') {
        const phase = data.phase as 'idle' | 'thinking' | 'typing' | 'tool_executing';
        const elapsed = data.elapsed;
        if (phase) {
          opt.onAgentPhase(phase, elapsed);
        }
        return;
      }

      if (data.type === 'tool' || data.event === 'tool') {
        const payload = data.payload || data.data || data;
        opt.onToolEvent(payload);
        return;
      }

      if (data.type === 'clarify' || data.event === 'clarify') {
        const payload = data.payload || data.data || data;
        if (payload?.spec) {
          opt.onClarifyOpen?.(payload.spec as ClarifyCardSpec);
        }
        return;
      }

      if (data.type === 'keepalive' || data.event === 'keepalive') {
        const payload = (data.payload || data.data || data) as {
          phase?: string;
          elapsedMs?: number;
          toolName?: string | null;
        };
        opt.onKeepalive?.({
          phase: String(payload?.phase || ''),
          elapsedMs: Number(payload?.elapsedMs || 0),
          toolName: payload?.toolName ?? null,
        });
        return;
      }

      if (data.type === 'canvas' || data.event === 'canvas') {
        const payload = data.payload || data.data || data;
        const action = data.action || payload?.action;
        const canvasPayload = payload?.payload ?? payload;
        if (action) {
          emitWorkbenchEvent({
            type: 'canvas',
            action,
            payload: canvasPayload,
          } as CanvasEvent);
        }
        return;
      }

      if (data.type === 'workbench' || data.event === 'workbench') {
        const payload = data.payload || data.data || data;
        const action = data.action || payload?.action;
        const workbenchPayload = payload?.payload ?? payload;
        if (action) {
          emitWorkbenchEvent({
            type: 'workbench',
            action,
            payload: workbenchPayload,
          } as WorkbenchEvent);
        }
        return;
      }

      if (data.type === 'usage' || data.event === 'usage') {
        const usage = data.payload || data.data || data;
        const isSnapshot = data.snapshot === true;
        opt.onUsage(usage, isSnapshot);

        if (usage.model != null) {
          opt.onModelName(String(usage.model));
        }
        return;
      }

      const embeddedUsage = extractEmbeddedUsage(data);
      if (embeddedUsage) {
        opt.onUsage(embeddedUsage, true);
        if (embeddedUsage.model != null) {
          opt.onModelName(String(embeddedUsage.model));
        }
      }

      let content = extractContent(data);
      content = (content || '').replace(/\u200B/g, '');
      const done = (data.done === true) || (data.payload?.done === true);
      const isDelta = isDeltaPayload(data);
      const turnId = (() => {
        const raw = (data as any)?.turnId
          ?? data?.payload?.turnId
          ?? data?.data?.turnId;
        if (raw == null) return undefined;
        const normalized = String(raw).trim();
        return normalized || undefined;
      })();

      try {
        if (data.event === 'chat' && !content && !done) {
          const debugStr = JSON.stringify(data).slice(0, 500);
          console.warn('[useWebSocket] chat event with empty content:', debugStr);
        }
      } catch {
        // ignore JSON stringify errors
      }

      if (!content && !done) return;

      const isSystemReply = data.type === 'system' || data.event === 'system' ||
        (data.payload && (data.payload.type === 'system' || data.payload.isSystemReply === true)) ||
        (data as any).isSystemReply === true;

      if (done) {
        opt.onChatDone(content, isSystemReply, turnId);
      } else {
        opt.onChatDelta(content, isDelta, isSystemReply, turnId);
      }
    };

    ipcRenderer.invoke('openclaw-status').then((r: {
      connected?: boolean;
      sessionKey?: string;
      model?: string;
      capabilities?: {
        model?: string;
        toolsSupport?: 'supported' | 'unknown' | 'unsupported';
        capabilitySource?: string;
        supportsTools?: boolean;
        supportsStreamOptions?: boolean;
        mcpReady?: boolean;
        mcpServers?: number;
        mcpConnectedServers?: number;
      };
    }) => {
      if (r?.connected === true) {
        setWsConnected(true);
      }
      if (r?.model) {
        optionsRef.current.onModelName(String(r.model));
      }
      if (r?.capabilities) {
        optionsRef.current.onGatewayCapabilities?.(r.capabilities);
      }
    });

    const handleStatus = (_: any, status: {
      connected?: boolean;
      reconnecting?: boolean;
      error?: string;
      model?: string;
      capabilities?: {
        model?: string;
        toolsSupport?: 'supported' | 'unknown' | 'unsupported';
        capabilitySource?: string;
        supportsTools?: boolean;
        supportsStreamOptions?: boolean;
        mcpReady?: boolean;
        mcpServers?: number;
        mcpConnectedServers?: number;
      };
    }) => {
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
      if (status.model != null) {
        optionsRef.current.onModelName(String(status.model));
      }
      if (status.capabilities) {
        optionsRef.current.onGatewayCapabilities?.(status.capabilities);
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
    workbenchContext?: WorkbenchRoundtripContext,
    requestId?: string
  ): Promise<{success?: boolean}> => {
    const normalizedRequestId = typeof requestId === 'string' ? requestId.trim() : '';
    try {
      const result = await ipcRenderer.invoke('openclaw-send', {
        content: content.trim(),
        imageDataUrl,
        files,
        pacingMs,
        workbenchContext,
        canvasContext: workbenchContext,
        requestId: normalizedRequestId || undefined,
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
