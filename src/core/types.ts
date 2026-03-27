/**
 * OCT v2 Core Types
 * 
 * 对话引擎的核心数据模型。
 * 所有 Phase 的实现都基于这些类型定义。
 * 
 * 设计原则：
 * - 消息不是字符串，是结构化的 ContentBlock 数组
 * - 每个 Block 有独立的类型、生命周期和渲染逻辑
 * - 状态用有限状态机管理，不用 boolean 组合
 */

// ════════════════════════════════════════
// ContentBlock 系统
// ════════════════════════════════════════

/** 所有 ContentBlock 的类型枚举 */
export type ContentBlockType =
  | 'text'         // 普通 Markdown 文本
  | 'cot'          // 思维链（可折叠）
  | 'code'         // 代码块（带语言标记）
  | 'tool_call'    // 工具调用请求
  | 'tool_result'  // 工具执行结果
  | 'image'        // 图片
  | 'pills'        // 选项胶囊（OCT 特有）
  | 'checkbox'     // 复选框选项（OCT 特有）
  | 'question'     // 问题卡片（OCT 特有）
  | 'tasklist'     // 任务清单（OCT 特有）
  | 'table'        // 表格
  | 'error';       // 错误信息

/** 单个 ContentBlock 的流式状态 */
export type BlockStreamState =
  | 'streaming'    // 正在接收 token
  | 'complete'     // 接收完毕
  | 'error';       // 出错

/** Phase 0 兼容：旧版 ContentBlock 基础接口 */
export interface LegacyContentBlock {
  /** 块唯一 ID（消息内唯一，格式：`b_{index}`） */
  id: string;
  /** 块类型 */
  type: ContentBlockType;
  /** 块内容（纯文本形式，用于渲染和搜索） */
  content: string;
  /** 流式状态 */
  streamState: BlockStreamState;
}

/** Phase 0 兼容：旧版文本块 */
export interface LegacyTextBlock extends LegacyContentBlock {
  type: 'text';
}

/** Phase 0 兼容：旧版思维链块 */
export interface LegacyCoTBlock extends LegacyContentBlock {
  type: 'cot';
}

/** Phase 0 兼容：旧版代码块 */
export interface LegacyCodeBlock extends LegacyContentBlock {
  type: 'code';
  /** 编程语言 */
  language: string;
}

/** Phase 0 兼容：旧版工具调用块 */
export interface LegacyToolCallBlock extends LegacyContentBlock {
  type: 'tool_call';
  /** 工具名称 */
  toolName: string;
  /** 调用参数（JSON 字符串） */
  arguments: string;
  /** 执行状态 */
  execState: 'pending' | 'executing' | 'done' | 'error';
}

/** Phase 0 兼容：旧版工具结果块 */
export interface LegacyToolResultBlock extends LegacyContentBlock {
  type: 'tool_result';
  /** 对应的 tool_call 块 ID */
  callBlockId: string;
  /** 是否成功 */
  success: boolean;
}

/** Phase 0 兼容：旧版选项块（胶囊 / 复选框 / 问题卡片）*/
export interface LegacyOptionBlock extends LegacyContentBlock {
  type: 'pills' | 'checkbox' | 'question';
  /** 选项列表 */
  options: OptionItem[];
}

/** Phase 0 兼容：旧版任务清单块 */
export interface LegacyTaskListBlock extends LegacyContentBlock {
  type: 'tasklist';
  /** 任务列表 */
  options: OptionItem[];
}

/** 选项条目（复用 OCT 现有的结构，保持兼容） */
export interface OptionItem {
  num: number;
  label: string;
  value: string;
}

/** 所有 Legacy ContentBlock 的联合类型（Phase 0 兼容） */
export type AnyContentBlock =
  | LegacyTextBlock
  | LegacyCoTBlock
  | LegacyCodeBlock
  | LegacyToolCallBlock
  | LegacyToolResultBlock
  | LegacyOptionBlock
  | LegacyTaskListBlock
  | LegacyContentBlock;  // 通用 fallback（table, image, error 等）

// Phase 1 最小可用 ContentBlock 定义（供 blockRouter / blockAdapter 使用）
export interface BaseBlock {
  id: string;
  type: string;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  text: string;
}

export interface CodeBlock extends BaseBlock {
  type: 'code';
  language?: string;
  code: string;
}

export interface CotBlock extends BaseBlock {
  type: 'cot';
  text: string;
}

export interface ToolCallBlock extends BaseBlock {
  type: 'tool_call';
  name: string;
  args: unknown;
}

export interface ToolResultBlock extends BaseBlock {
  type: 'tool_result';
  result: unknown;
}

export type ContentBlock =
  | TextBlock
  | CodeBlock
  | CotBlock
  | ToolCallBlock
  | ToolResultBlock;

// ════════════════════════════════════════
// Message 系统
// ════════════════════════════════════════

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/** 消息级状态 */
export type MessageState =
  | 'pending'      // 用户消息已创建，等待发送
  | 'sent'         // 已发送到 Gateway
  | 'streaming'    // AI 正在流式回复
  | 'complete'     // 回复完成
  | 'error'        // 出错
  | 'cancelled';   // 用户取消生成

/** v2 消息模型 */
export interface MessageV2 {
  /** 消息唯一 ID */
  id: string;
  /** 角色 */
  role: MessageRole;
  /** 结构化内容块数组（核心变化：从 string 变为 ContentBlock[]） */
  blocks: AnyContentBlock[];
  /** 消息状态 */
  state: MessageState;
  /** 时间戳 */
  timestamp: number;
  /** 是否为系统回复（/status 等斜杠命令） */
  isSystemReply?: boolean;
  /** 元数据 */
  metadata?: MessageMetadata;
}

/** 消息元数据 */
export interface MessageMetadata {
  /** 输入 token 数 */
  inputTokens?: number;
  /** 输出 token 数 */
  outputTokens?: number;
  /** 费用 */
  cost?: number;
  /** 模型名 */
  model?: string;
  /** 会话 ID */
  sessionKey?: string;
}

// ════════════════════════════════════════
// Turn FSM（轮次状态机）
// ════════════════════════════════════════

/** 轮次阶段 */
export type TurnPhase =
  | 'idle'           // 等待用户输入
  | 'submitted'      // 用户消息已发送，等待 AI 响应
  | 'thinking'       // AI 在思考（CoT 阶段）
  | 'streaming'      // AI 在流式输出正文
  | 'tool_calling'   // AI 请求调用工具
  | 'tool_executing' // 工具正在执行
  | 'continuing'     // 工具返回后 AI 继续回复
  | 'finalizing'     // 流式结束，做最终处理
  | 'done'           // 本轮完成
  | 'error'          // 出错
  | 'cancelled';     // 用户取消

/** 轮次状态转换事件 */
export type TurnEvent =
  | { type: 'USER_SUBMIT' }
  | { type: 'STREAM_START' }
  | { type: 'COT_START' }
  | { type: 'COT_END' }
  | { type: 'TEXT_START' }
  | { type: 'TOOL_CALL'; toolName: string }
  | { type: 'TOOL_RESULT'; success: boolean }
  | { type: 'STREAM_DONE' }
  | { type: 'FINALIZED' }
  | { type: 'ERROR'; message: string }
  | { type: 'CANCEL' };

// ════════════════════════════════════════
// Streaming Engine 类型
// ════════════════════════════════════════

/** BlockRouter 输出的事件 */
export type BlockRouterEvent =
  | { type: 'block_open'; blockType: ContentBlockType; blockId: string }
  | { type: 'block_append'; blockId: string; content: string }
  | { type: 'block_close'; blockId: string }
  | { type: 'block_error'; blockId: string; error: string };

// ════════════════════════════════════════
// 兼容层：v1 → v2 桥接
// ════════════════════════════════════════

/**
 * v1 的 ChatMessage 类型（当前 OCT 使用的）
 * 保留此类型用于过渡期兼容
 */
export interface ChatMessageV1 {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isSystemReply?: boolean;
  timestamp?: number;
}

/**
 * v1 的 RenderSegment 类型（optionBoxParser 输出的）
 * 保留此类型用于过渡期兼容
 */
export interface RenderSegmentV1 {
  type: 'text' | 'pills' | 'checkbox' | 'question' | 'tasklist' | 'cot';
  content: string;
  options: OptionItem[];
}
