# Cursor 任务：OCT v2 Phase 0 — 准备工作

## 目标
建立 v2 架构的目录结构和核心类型定义。**不修改任何现有功能代码**。

---

## 任务 0.1：备份 ChatTab.tsx

将当前的 ChatTab.tsx 复制一份作为 v1 备份，后续 Phase 如果出问题可以对照。

```
复制 src/components/ChatTab.tsx → src/components/ChatTab.v1.tsx
```

注意：只是复制，不是移动。`ChatTab.tsx` 本身不做任何修改。

---

## 任务 0.2：创建 src/core/ 目录结构

创建以下空目录和文件：

```
src/core/
  types.ts          ← 核心类型定义（本 Phase 主要产出）
  blockRouter.ts    ← Phase 1 用，本次只创建空文件占位
  turnFSM.ts        ← Phase 2 用，本次只创建空文件占位
  streamRouter.ts   ← Phase 3 用，本次只创建空文件占位
```

**占位文件内容**（blockRouter.ts / turnFSM.ts / streamRouter.ts 三个文件统一用这个）：

```typescript
/**
 * OCT v2 Architecture - Placeholder
 * 
 * This module will be implemented in a later migration phase.
 * See docs/_archive/migration/v2-and-gateway/OCT-v2-Architecture-Blueprint.md for design details.
 */

// TODO: Implement in Phase {对应的 Phase 编号}
export {};
```

---

## 任务 0.3：创建核心类型定义 src/core/types.ts

这是 Phase 0 最重要的产出。所有后续 Phase 都基于这些类型。

**完整写入以下内容**：

```typescript
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

/** ContentBlock 基础接口 */
export interface ContentBlock {
  /** 块唯一 ID（消息内唯一，格式：`b_{index}`） */
  id: string;
  /** 块类型 */
  type: ContentBlockType;
  /** 块内容（纯文本形式，用于渲染和搜索） */
  content: string;
  /** 流式状态 */
  streamState: BlockStreamState;
}

/** 文本块 */
export interface TextBlock extends ContentBlock {
  type: 'text';
}

/** 思维链块 */
export interface CoTBlock extends ContentBlock {
  type: 'cot';
}

/** 代码块 */
export interface CodeBlock extends ContentBlock {
  type: 'code';
  /** 编程语言 */
  language: string;
}

/** 工具调用块 */
export interface ToolCallBlock extends ContentBlock {
  type: 'tool_call';
  /** 工具名称 */
  toolName: string;
  /** 调用参数（JSON 字符串） */
  arguments: string;
  /** 执行状态 */
  execState: 'pending' | 'executing' | 'done' | 'error';
}

/** 工具结果块 */
export interface ToolResultBlock extends ContentBlock {
  type: 'tool_result';
  /** 对应的 tool_call 块 ID */
  callBlockId: string;
  /** 是否成功 */
  success: boolean;
}

/** 选项块（胶囊 / 复选框 / 问题卡片）*/
export interface OptionBlock extends ContentBlock {
  type: 'pills' | 'checkbox' | 'question';
  /** 选项列表 */
  options: OptionItem[];
}

/** 任务清单块 */
export interface TaskListBlock extends ContentBlock {
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

/** 所有 ContentBlock 的联合类型 */
export type AnyContentBlock =
  | TextBlock
  | CoTBlock
  | CodeBlock
  | ToolCallBlock
  | ToolResultBlock
  | OptionBlock
  | TaskListBlock
  | ContentBlock;  // 通用 fallback（table, image, error 等）

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
```

---

## 任务 0.4：更新 migration-status.md

打开 `docs/_archive/migration/v2-and-gateway/migration-status.md`（或占位说明 `docs/03_migration/README.md`），将 Phase 0 的所有 checkbox 从 `[ ]` 改为 `[x]`，并更新当前阶段为：

```markdown
## 当前阶段

Phase: 0（准备）✅ 已完成
状态: 等待 Phase 1
```

在变更日志中添加一行：

```markdown
| 2026-03-27 | Phase 0 | 目录结构 + 类型定义 + ChatTab 备份 | ✅ |
```

---

## 重要约束

1. **不修改任何现有代码**：ChatTab.tsx、optionBoxParser.ts、index.js 等一律不动
2. **只创建新文件和新目录**
3. **types.ts 的 OptionItem 接口必须和现有 optionBoxParser.ts 中的定义兼容**（num/label/value 三个字段）

## 验证方式

完成后执行以下检查：

1. `npm run start` 能正常启动 OCT，所有功能和之前一样
2. 确认 `src/core/types.ts` 存在且 TypeScript 无报错
3. 确认 `src/components/ChatTab.v1.tsx` 存在（备份文件）
4. 确认 `src/core/blockRouter.ts`、`src/core/turnFSM.ts`、`src/core/streamRouter.ts` 存在（占位文件）
