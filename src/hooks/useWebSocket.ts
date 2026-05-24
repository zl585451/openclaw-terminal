import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { WorkbenchRoundtripContext, CanvasEvent, WorkbenchEvent } from '../workbench/types';
import type { ClarifyCardSpec } from '../core/clarifyCard/types';
import type { IpcRendererLike } from '../types/electronAPI';
import type {
  GatewayCapabilities,
  GatewayEvent,
  GatewayKeepalivePayload,
  GatewaySendPayload,
  GatewaySendResult,
  GatewayStatusPayload,
  GatewayToolPayload,
  GatewayUsagePayload,
} from '../types/gateway';
import type { RenderBlock } from '../types/renderProtocol';

const noopIpcRenderer: IpcRendererLike = {
  invoke: <T = unknown>() => Promise.resolve(null as T),
  on: () => {},
  off: () => {},
  removeListener: () => {},
};

const ipcRenderer: IpcRendererLike = typeof window !== 'undefined' && typeof window.require === 'function'
  ? window.require('electron').ipcRenderer
  : noopIpcRenderer;

interface UseWebSocketOptions {
  onChatDelta: (content: string, isDelta: boolean, isSystemReply: boolean, turnId?: string) => void;
  onChatDone: (content: string, isSystemReply: boolean, turnId?: string, renderBlocks?: RenderBlock[]) => void;
  onAgentPhase: (phase: 'idle' | 'thinking' | 'typing' | 'tool_executing', elapsed?: number) => void;
  onToolEvent: (payload: GatewayToolPayload) => void;
  onClarifyOpen?: (spec: ClarifyCardSpec) => void;
  onKeepalive?: (payload: GatewayKeepalivePayload) => void;
  onGatewayCapabilities?: (capabilities: GatewayCapabilities | null) => void;
  onWorkbenchEvent: (event: CanvasEvent | WorkbenchEvent) => void;
  onCanvasEvent?: (event: CanvasEvent | WorkbenchEvent) => void;
  onUsage: (usage: GatewayUsagePayload, isSnapshot: boolean) => void;
  onModelName: (name: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function nestedRecord(value: unknown, key: 'payload' | 'data'): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isDeltaPayload(data: GatewayEvent): boolean {
  if (!data) return false;
  const src = nestedRecord(data, 'data') ?? nestedRecord(data, 'payload');
  return src?.state === 'delta' || (src?.delta !== undefined && src?.delta !== null);
}

function extractContent(data: GatewayEvent): string {
  if (!data) return '';

  if (data.type === 'event' && data.event === 'chat' && data.payload) {
    const p = nestedRecord(data, 'payload');
    if (p?.delta !== undefined) return String(p.delta || '');
    if (p?.text !== undefined) return String(p.text || '');
    if (p?.content !== undefined) return String(p.content || '');
  }

  const dataRecord = nestedRecord(data, 'data');
  if (dataRecord) {
    const d = dataRecord;
    if (d.delta !== undefined) return String(d.delta || '');
    if (d.text !== undefined) return String(d.text || '');
    if (d.content !== undefined) return String(d.content || '');
  }

  const payloadRecord = nestedRecord(data, 'payload');
  if (payloadRecord) {
    const p = payloadRecord;
    if (p.delta !== undefined) return String(p.delta || '');
    if (p.text !== undefined) return String(p.text || '');
    if (p.content !== undefined) return String(p.content || '');
  }

  if (data.delta !== undefined) return String(data.delta || '');
  if (data.text !== undefined) return String(data.text || '');
  if (data.content !== undefined) return String(data.content || '');

  return '';
}

function extractEmbeddedUsage(data: GatewayEvent): GatewayUsagePayload | null {
  if (!data) return null;
  const payloadUsage = nestedRecord(data, 'payload')?.usage;
  const dataUsage = nestedRecord(data, 'data')?.usage;
  const usage = payloadUsage ?? dataUsage ?? data.usage ?? null;
  return isRecord(usage) ? usage as GatewayUsagePayload : null;
}

function extractRenderBlocks(data: GatewayEvent): RenderBlock[] | undefined {
  const payload = nestedRecord(data, 'payload') || nestedRecord(data, 'data') || data;
  const blocks = isRecord(payload) ? payload.renderBlocks : undefined;
  return Array.isArray(blocks) && blocks.length > 0 ? blocks as RenderBlock[] : undefined;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const [wsConnected, setWsConnected] = useState(false);
  const [wsReconnecting, setWsReconnecting] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [memoryOnline, setMemoryOnline] = useState(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const emitWorkbenchEvent = (event: CanvasEvent | WorkbenchEvent) => {
    optionsRef.current.onWorkbenchEvent(event);
    optionsRef.current.onCanvasEvent?.(event);
  };

  useEffect(() => {
    const handleIncomingMessage = (data: GatewayEvent) => {
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
        const payload = (nestedRecord(data, 'payload') || nestedRecord(data, 'data') || data) as GatewayToolPayload;
        opt.onToolEvent(payload);
        return;
      }

      if (data.type === 'clarify' || data.event === 'clarify') {
        const payload = nestedRecord(data, 'payload') || nestedRecord(data, 'data') || data;
        if (payload?.spec) {
          opt.onClarifyOpen?.(payload.spec as ClarifyCardSpec);
        }
        return;
      }

      if (data.type === 'keepalive' || data.event === 'keepalive') {
        const payload = nestedRecord(data, 'payload') || nestedRecord(data, 'data') || data;
        opt.onKeepalive?.({
          phase: String(payload?.phase || ''),
          elapsedMs: Number(payload?.elapsedMs || 0),
          toolName: readString(payload?.toolName) ?? null,
        });
        return;
      }

      if (data.type === 'canvas' || data.event === 'canvas') {
        const payload = nestedRecord(data, 'payload') || nestedRecord(data, 'data') || data;
        const action = readString(data.action) || readString(payload?.action);
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
        const payload = nestedRecord(data, 'payload') || nestedRecord(data, 'data') || data;
        const action = readString(data.action) || readString(payload?.action);
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
        const usage = (nestedRecord(data, 'payload') || nestedRecord(data, 'data') || data) as GatewayUsagePayload;
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
      const done = (data.done === true) || (nestedRecord(data, 'payload')?.done === true);
      const isDelta = isDeltaPayload(data);
      const turnId = (() => {
        const raw = data.turnId
          ?? nestedRecord(data, 'payload')?.turnId
          ?? nestedRecord(data, 'data')?.turnId;
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
        (nestedRecord(data, 'payload')?.type === 'system' || nestedRecord(data, 'payload')?.isSystemReply === true) ||
        data.isSystemReply === true;

      if (done) {
        opt.onChatDone(content, isSystemReply, turnId, extractRenderBlocks(data));
      } else {
        opt.onChatDelta(content, isDelta, isSystemReply, turnId);
      }
    };

    ipcRenderer.invoke<{
      connected?: boolean;
      sessionKey?: string;
      model?: string;
      capabilities?: GatewayCapabilities;
    }>('openclaw-status').then((r) => {
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

    const handleStatus = (_: unknown, payload: unknown) => {
      const status = isRecord(payload) ? payload as GatewayStatusPayload : {};
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

    const handleMessage = (_: unknown, msg: unknown) => {
      try {
        if (isRecord(msg)) handleIncomingMessage(msg as GatewayEvent);
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
    setMemoryOnline(true);
  }, []);

  const send = useCallback(async (
    content: string,
    imageDataUrl?: string,
    files?: GatewaySendPayload['files'],
    pacingMs?: number,
    workbenchContext?: WorkbenchRoundtripContext,
    requestId?: string,
    projectContext?: GatewaySendPayload['projectContext'],
  ): Promise<GatewaySendResult> => {
    const normalizedRequestId = typeof requestId === 'string' ? requestId.trim() : '';
    try {
      const result = await ipcRenderer.invoke<GatewaySendResult>('openclaw-send', {
        content: content.trim(),
        imageDataUrl,
        files,
        pacingMs,
        workbenchContext,
        canvasContext: workbenchContext,
        requestId: normalizedRequestId || undefined,
        projectContext: projectContext ?? null,
      });
      return result || {};
    } catch (error) {
      console.error('[useWebSocket] send error:', error);
      return {};
    }
  }, []);

  return useMemo(() => ({
    wsConnected,
    wsReconnecting,
    wsError,
    memoryOnline,
    send,
  }), [memoryOnline, send, wsConnected, wsError, wsReconnecting]);
}
