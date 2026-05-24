// ChatTab 相关核心类型（单一来源）

import type React from 'react';
import type { RenderBlock } from '../../types/renderProtocol';

export type { RenderBlock, RenderBlockItem } from '../../types/renderProtocol';

export interface ToolEventItem {
  callId: string;
  tool: string;
  args?: Record<string, unknown>;
  state: 'executing' | 'done' | 'error';
  resultPreview?: string;
  error?: string;
  elapsedMs?: number;
  startedAt: number;
}

export interface UploadedFile {
  name: string;
  size: number;
  ext: string;
  mimeType: string;
  isText: boolean;
  content: string | null;
  base64?: string;
  /** 文件绝对路径，AMY 可用 read_file 读取；无 path 时（如拖入的非本地文件）不可用 */
  path?: string;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  /** 流式阶段仅累积原始文本并用 <pre> 展示，避免每批 token 触发 Markdown 全量解析 */
  isStreamingRaw?: boolean;
  timestamp: string | number;
  imageDataUrl?: string;
  isSystemReply?: boolean;
  files?: UploadedFile[];
  /** 内联工具调用卡片数据，跟随消息持久展示 */
  toolEvents?: ToolEventItem[];
  /** Render Protocol v3 结构化渲染块 */
  renderBlocks?: RenderBlock[];
}

export interface ChatTabProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  getNextMessageId: () => number;
  onStatusChange?: (wsConnected: boolean, isStreaming: boolean, modelName?: string, tokenIn?: number | null, tokenOut?: number | null, ctxUsed?: number | null, ctxMax?: number | null) => void;
  onSwitchTab?: (tab: 'chat' | 'sound' | 'reaper') => void;
}
