import type { WorkbenchRoundtripContext } from '../workbench/types';
import type { UploadedFile } from '../ui/chat/chatTypes';
import type { ActiveProject } from '../contexts/ProjectContext';
import type { RenderBlock } from './renderProtocol';

export interface GatewayCapabilities {
  model?: string;
  toolsSupport?: 'supported' | 'unknown' | 'unsupported';
  capabilitySource?: string;
  supportsTools?: boolean;
  supportsStreamOptions?: boolean;
  mcpReady?: boolean;
  mcpServers?: number;
  mcpConnectedServers?: number;
  optionalCapabilities?: GatewayOptionalCapabilities;
}

export interface GatewayOptionalCapabilityPackage {
  status?: 'enabled' | 'disabled' | 'available' | 'unavailable' | string;
  loadedCount?: number;
  serverCount?: number;
  lazyLoadCandidate?: boolean;
  entrypoints?: string[];
  [key: string]: unknown;
}

export interface GatewayOptionalCapabilities {
  version?: string;
  packages?: Record<string, GatewayOptionalCapabilityPackage>;
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
  /** 委派子代理(Writer/Coder/Researcher)执行时打的标签；AMY 主链路直接执行时不带此字段 */
  agentSource?: string;
  /** canvas_stream 专用字段：流式预览阶段从未完成的 JSON 里抠出来的部分参数 */
  action?: string;
  documentId?: string;
  title?: string;
  artifactType?: string;
  mode?: string;
  content?: string;
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
  renderBlocks?: RenderBlock[];
  renderProtocol?: {
    version?: string;
    source?: 'render_blocks' | 'legacy' | 'markdown' | string;
    errors?: string[];
  };
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
  projectContext?: ActiveProject | null;
}

export interface GatewaySendResult {
  success?: boolean;
  error?: string;
}

