// ChatTab 相关核心类型（单一来源）

import type React from 'react';
import type { RenderBlock } from '../../types/renderProtocol';
import type { ConversationMeta } from '../../types/electronAPI';

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
  /** 委派子代理(Writer/Coder/Researcher)执行时打的标签；AMY 主链路直接执行时不带此字段 */
  agentSource?: string;
  /** canvas 工具实时预览阶段：目前已经流式生成的字符数，驱动"正在写入...已生成 X 字"展示 */
  streamChars?: number;
  /** canvas 工具实时预览阶段：流式抠出来的标题（可能比最终标题早到） */
  streamTitle?: string;
}

/** 流式回合的有序内容段快照（B3 inline 渲染用）。与 core/turnSegments 的 TurnSegment 同形。 */
export interface TurnSegmentLite {
  segId: string;
  index: number;
  type: 'text' | 'tool_use' | 'tool_result' | 'reasoning' | 'final' | 'preamble';
  content: string;
  open: boolean;
  meta?: { tool?: string | null; callId?: string | null };
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
  /** B3 inline：流式回合的有序段快照（文本/工具交错），驱动 inline 工具卡片渲染 */
  turnSegments?: TurnSegmentLite[];
  /** Render Protocol v3 结构化渲染块 */
  renderBlocks?: RenderBlock[];
}

export interface ChatTabProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  getNextMessageId: () => number;
  onStatusChange?: (wsConnected: boolean, isStreaming: boolean, modelName?: string, tokenIn?: number | null, tokenOut?: number | null, ctxUsed?: number | null, ctxMax?: number | null) => void;
  onSwitchTab?: (tab: 'chat') => void;
  // 多对话
  conversations?: ConversationMeta[];
  activeConversationId?: string;
  onNewConversation?: () => void;
  onSwitchConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  // 顶部 tab（移入侧边栏顶部）
  activeTab?: 'chat' | 'workspace' | 'library';
  onTabChange?: (tab: 'chat' | 'workspace' | 'library') => void;
}
