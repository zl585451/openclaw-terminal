import type { WorkbenchRoundtripContext } from '../workbench/types';
import type { UploadedFile } from '../ui/chat/ChatTab.v2';

export interface GatewayCapabilities {
  model?: string;
  toolsSupport?: 'supported' | 'unknown' | 'unsupported';
  capabilitySource?: string;
  supportsTools?: boolean;
  supportsStreamOptions?: boolean;
  mcpReady?: boolean;
  mcpServers?: number;
  mcpConnectedServers?: number;
}

export interface GatewayUsagePayload {
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  context_tokens?: number;
  [key: string]: unknown;
}

export interface GatewayToolPayload {
  callId: string;
  tool: string;
  name?: string;
  args?: Record<string, unknown>;
  state?: 'executing' | 'done' | 'error' | string;
  resultPreview?: string;
  error?: string;
  elapsedMs?: number;
  [key: string]: unknown;
}

export interface GatewayKeepalivePayload {
  phase: string;
  elapsedMs: number;
  toolName?: string | null;
}

export interface GatewayMessagePayload {
  content?: string;
  text?: string;
  delta?: string;
  done?: boolean;
  type?: string;
  phase?: 'idle' | 'thinking' | 'typing' | 'tool_executing' | string;
  event?: string;
  action?: string;
  message?: unknown;
  usage?: GatewayUsagePayload;
  payload?: GatewayMessagePayload | GatewayToolPayload | GatewayUsagePayload | Record<string, unknown>;
  data?: GatewayMessagePayload | GatewayToolPayload | GatewayUsagePayload | Record<string, unknown>;
  connected?: boolean;
  snapshot?: boolean;
  elapsed?: number;
  elapsedMs?: number;
  turnId?: string;
  isSystemReply?: boolean;
  capabilities?: GatewayCapabilities;
  model?: string;
  toolName?: string | null;
  spec?: unknown;
  [key: string]: unknown;
}

export type GatewayEvent = GatewayMessagePayload;

export interface GatewayStatusPayload {
  connected?: boolean;
  reconnecting?: boolean;
  error?: string;
  model?: string;
  capabilities?: GatewayCapabilities;
}

export interface GatewaySendPayload {
  content: string;
  imageDataUrl?: string;
  files?: UploadedFile[];
  pacingMs?: number;
  workbenchContext?: WorkbenchRoundtripContext;
  canvasContext?: WorkbenchRoundtripContext;
  requestId?: string;
}

export interface GatewaySendResult {
  success?: boolean;
  error?: string;
}

export interface NocturneHealthResult {
  ok?: boolean;
  error?: string;
}
