# OCT 下一代对话架构设计

> **设计者**: Claude (架构顾问)  
> **日期**: 2026-03-27  
> **版本**: 1.0  
> **状态**: 架构蓝图 · 待 Zilong 审核

---

## 1️⃣ 心智模型转换（最重要的部分）

### 为什么基于 Markdown 的聊天架构从根本上是错的

OCT 当前的架构本质是一个**文档渲染器**——它把每条消息当成一个 Markdown 文件，接收完文本后交给 `react-markdown` 渲染成 HTML。这和 ChatGPT/Claude 的工作方式有根本区别。

**文档渲染器思维**：消息是一段文本 → 文本渲染成 HTML → HTML 插入 DOM

**对话引擎思维**：消息是一个**有状态的生命实体** → 它经历出生（用户输入）、孕育（AI 处理）、生长（流式输出）、成熟（完成）、变异（编辑/重新生成）等阶段 → 每个阶段有不同的渲染策略和交互行为

OCT 现在的问题不是"Markdown 渲染不好看"，而是**整个数据流假设是错的**：

```
OCT 当前：
  string → ReactMarkdown → DOM（一次性）
  
GPT/Claude 实际：
  token → ContentBlock → RenderNode → 增量 DOM 更新（持续性）
```

### GPT/Claude 把对话当成什么

它们不是在渲染消息列表。它们在维护一个**实时演化的对话图**。

每条"消息"实际上是一个**结构化内容容器**，内部可能包含：

- 思考块（CoT / thinking）
- 文本段落
- 代码块（带语言标记和执行能力）
- 工具调用请求（函数名 + 参数）
- 工具执行结果（结构化数据）
- 图片 / 文件引用
- 引用标注（citation）
- 交互元素（建议问题、按钮）

这些不是"Markdown 里的特殊格式"，而是**独立的内容节点**，每个节点有自己的生命周期和渲染逻辑。

### 核心抽象：从 `string` 到 `ContentBlock[]`

```
当前 OCT 的消息模型：
{
  id: number
  role: 'user' | 'assistant'
  content: string        ← 一切都是字符串
  isStreaming: boolean
}

目标消息模型：
{
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  blocks: ContentBlock[]  ← 结构化内容块数组
  state: MessageState     ← 消息级状态机
  metadata: MessageMeta   ← 时间、token、模型等
}
```

**这个转换是整个重构的基础。后面所有设计都建立在这个模型之上。**

---

## 2️⃣ 核心架构分层

### 总体架构

```
┌──────────────────────────────────────────────┐
│                  Input Layer                  │
│        (输入框 + 文件上传 + 语音 + 命令)        │
└────────────────────┬─────────────────────────┘
                     │ UserIntent
                     ▼
┌──────────────────────────────────────────────┐
│            Conversation Engine                │
│  ┌─────────┐ ┌──────────┐ ┌───────────────┐ │
│  │ Message  │ │ Session  │ │   Turn        │ │
│  │ Store    │ │ Manager  │ │   Controller  │ │
│  └─────────┘ └──────────┘ └───────────────┘ │
└────────────────────┬─────────────────────────┘
                     │ MessageEvent
                     ▼
┌──────────────────────────────────────────────┐
│             Streaming Engine                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │  Token   │ │  Block   │ │   State      │ │
│  │  Buffer  │ │  Router  │ │   Machine    │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
└────────────────────┬─────────────────────────┘
                     │ RenderOp
                     ▼
┌──────────────────────────────────────────────┐
│             Rendering Engine                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │  Block   │ │ Markdown │ │  Incremental │ │
│  │  Registry│ │ Pipeline │ │  Updater     │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
└────────────────────┬─────────────────────────┘
                     │ DOM ops
                     ▼
┌──────────────────────────────────────────────┐
│           Viewport Controller                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │
│  │  Scroll  │ │  Anchor  │ │   Layout     │ │
│  │  Manager │ │  System  │ │   Reconciler │ │
│  └──────────┘ └──────────┘ └──────────────┘ │
└──────────────────────────────────────────────┘
```

---

### 2.1 Conversation Engine（对话引擎层）

这是整个系统的大脑。它不关心 UI，只管理对话的**语义状态**。

#### Message Store

不是 `useState<ChatMessage[]>`，而是一个独立的消息仓库，脱离 React 渲染周期。

```typescript
// 概念模型（不是最终代码）
interface MessageStore {
  // 核心操作
  commitUserMessage(content: string, attachments?: Attachment[]): Message
  beginAssistantTurn(): Message  // 创建空的 assistant 消息
  appendBlock(messageId: string, block: ContentBlock): void
  updateBlock(messageId: string, blockId: string, patch: Partial<ContentBlock>): void
  finalizeTurn(messageId: string, metadata: TurnMetadata): void
  
  // 分支操作（未来用）
  branch(messageId: string): ConversationBranch
  regenerate(messageId: string): void
  
  // 订阅（通知 UI 层）
  subscribe(listener: (event: StoreEvent) => void): Unsubscribe
}
```

**为什么不用 `useState` 数组？**

OCT 当前最大的性能问题：每次 token 到达 → `setMessages(prev => ...)` → **整个消息列表重新渲染**。对 200 条历史消息的长对话，这意味着每个 token 都触发 200 个 `ChatMessageItem` 的 diff 检查。

正确做法：消息仓库是 React 之外的独立对象。只有发生变化的消息通过细粒度订阅通知对应的组件更新。其他消息的 DOM 完全不动。

#### Session Manager

管理会话级别的状态：当前会话 ID、历史会话列表、会话切换、消息持久化。

#### Turn Controller

管理一轮对话的完整生命周期：

```
用户输入 → 消息提交 → 等待 AI → AI 思考 → AI 流式回复 
→ 工具调用 → 工具返回 → AI 继续回复 → 回复完成 → 记忆整合
```

这是一个**状态机**，不是一堆 boolean flag：

```typescript
type TurnPhase =
  | 'idle'           // 等待用户输入
  | 'submitted'      // 用户消息已发送，等待 AI 响应
  | 'thinking'       // AI 在思考（CoT 阶段）
  | 'streaming'      // AI 在流式输出正文
  | 'tool_calling'   // AI 请求调用工具
  | 'tool_executing' // 工具正在执行
  | 'continuing'     // 工具返回后 AI 继续回复
  | 'finalizing'     // 流式结束，正在做最终处理
  | 'done'           // 本轮完成
  | 'error'          // 出错
  | 'cancelled'      // 用户取消
```

OCT 当前用 `isStreaming` + `awaitingResponse` + `agentPhase` 三个独立变量模拟这个状态机，导致大量不一致的边界情况（比如 `isStreaming=true` 但 `awaitingResponse=false` 但 `agentPhase=thinking` 这种组合到底代表什么？）。

---

### 2.2 Streaming Engine（流式引擎层）

**OCT 当前最大的体验问题出在这里。**

现在的流程是：
```
WebSocket delta → streamingMessageRef += delta → setInterval 打字机 
→ displayedLength++ → fullContent.slice(0, displayedLength) → ReactMarkdown
```

这有三个根本问题：

1. **打字机是假的**：用户看到的不是 token 级别的流入，而是一个 timer 在追赶已经到达的内容。如果网络快，内容一下子全到了，打字机还在慢慢追；如果网络慢，打字机空转等内容。
2. **每次 slice 都重新解析 Markdown**：`fullContent.slice(0, n)` 交给 ReactMarkdown，相当于每帧都在解析一个不完整的 Markdown 文档。不完整的表格、代码块会导致渲染闪烁和布局跳动。
3. **整个字符串是一个黑盒**：无法区分哪部分是思考、哪部分是正文、哪部分是代码块。所有语义信息都埋在字符串里，靠正则事后挖掘。

#### 目标架构：Token Buffer → Block Router → Incremental Update

```
WebSocket delta
     │
     ▼
┌─ Token Buffer ─┐
│  接收原始 token  │
│  维护完整缓冲区  │
└────────┬────────┘
         │ 逐 token 或逐行
         ▼
┌─ Block Router ──┐
│  识别内容类型：   │
│  [cot] → CoT块  │
│  ``` → 代码块    │
│  普通文本 → 文本块│
│  工具调用 → 工具块│
└────────┬────────┘
         │ ContentBlock 事件
         ▼
┌─ Block Updater ─┐
│  增量更新对应的   │
│  ContentBlock    │
│  只通知变化的块   │
└─────────────────┘
```

关键设计：**Block Router 是流式解析器，不是完成后的后处理器**。

它在 token 到达时就做决策：
- 看到 `[cot]` → 开启一个 CoT 类型的 ContentBlock，后续 token 路由到这个块
- 看到 `` ``` `` → 开启一个 Code 类型的 ContentBlock
- 看到 `[/cot]` → 关闭 CoT 块，切回 Text 块
- 看到工具调用标记 → 开启 ToolCall 块

这意味着 **CoT 面板从第一个 token 就开始渲染，不需要等打字机追上来**。正文块也是从第一个 token 就开始渲染。每个块独立更新，互不干扰。

#### Zero-Jump Streaming（零跳动流式）

"跳动"的根源是：新内容到达 → DOM 高度变化 → 滚动位置改变 → 用户看到画面跳。

解决方案不是"更平滑的动画"，而是**锚定策略**：

1. 流式开始时，记录当前滚动锚点（通常是最后一条用户消息的底边）
2. 新内容到达 → DOM 高度增加 → **立即补偿滚动位置**，让锚点位置不变
3. 用户始终看到：用户消息固定在上方，AI 回复在下方自然生长

GPT/Claude 的做法是：用户消息发出后，视口 snap 到用户消息顶部附近，AI 回复从下方长出来。不管 AI 输出多少内容，用户消息始终可见。这就是为什么它们感觉"稳定"。

OCT 当前用 `bottomRef.scrollIntoView` 强制滚到底部——这意味着如果 AI 回复很长，用户消息会被推出视口。用户失去了"我说了什么"的空间参照。

---

### 2.3 Rendering Engine（渲染引擎层）

#### 为什么 GPT 不直接渲染 Markdown

GPT 的回复在你看来是 Markdown，但内部渲染流程是：

```
token → 增量解析器（识别段落/标题/列表/代码块边界）
     → 内容节点树（不是 HTML，是语义结构）
     → 每个节点独立渲染为 React 组件
     → 增量 DOM 更新（只更新变化的节点）
```

而 OCT 的流程是：

```
displayedLength++ → fullString.slice(0, n) → ReactMarkdown(整个字符串)
→ React 全量 diff → DOM 全量更新
```

差距在哪里？

ReactMarkdown 每次调用都会：解析整个 Markdown → 生成 AST → 转换为 React 虚拟 DOM → diff → 更新真实 DOM。当字符串从 1000 字增长到 1001 字时，它重新处理全部 1001 个字符。

正确做法：**增量 Markdown 解析**。

```typescript
// 概念模型
interface IncrementalParser {
  // 喂入新的 token/文本片段
  feed(chunk: string): ParseEvent[]
  
  // 返回事件类型：
  // { type: 'paragraph_append', nodeId: 'p3', text: '新增的文字' }
  // { type: 'code_block_open', nodeId: 'code1', language: 'python' }
  // { type: 'code_block_append', nodeId: 'code1', text: 'def foo():' }
  // { type: 'heading_complete', nodeId: 'h2', level: 2, text: '标题' }
}
```

每个 ParseEvent 只更新对应的 DOM 节点。段落追加文本时，只做一次 `textNode.appendData()`，不触发 React 重渲染。

#### ContentBlock 类型注册表

```typescript
type ContentBlockType =
  | 'text'        // 普通 Markdown 文本
  | 'cot'         // 思维链（可折叠）
  | 'code'        // 代码块（带语法高亮 + 复制按钮）
  | 'tool_call'   // 工具调用请求（显示函数名 + 参数）
  | 'tool_result' // 工具执行结果
  | 'image'       // 图片
  | 'file'        // 文件附件
  | 'pills'       // 选项胶囊（OCT 特有）
  | 'tasklist'    // 任务清单（OCT 特有）
  | 'table'       // 表格（独立渲染，不走 Markdown）
  | 'citation'    // 引用标注
  | 'error'       // 错误信息

// 每种类型对应一个渲染组件
const blockRenderers: Record<ContentBlockType, React.FC<BlockProps>> = {
  text: TextBlock,
  cot: CoTBlock,
  code: CodeBlock,
  tool_call: ToolCallBlock,
  // ...
}
```

这和 OCT 现有的 `optionBoxParser.ts` 段解析逻辑方向一致，但关键区别是：**解析发生在流式阶段**（token 到达时实时分类），而不是渲染阶段（完成后正则匹配）。

---

### 2.4 Viewport Controller（视口控制层）

#### 用户消息锚定机制

```
发送消息前：
┌─────────────────┐
│ ... 历史消息 ... │
│ ─────────────── │
│ 输入框           │ ← 视口底部
└─────────────────┘

发送消息后（GPT/Claude 的做法）：
┌─────────────────┐
│ 用户消息         │ ← snap 到视口上部
│                  │
│ ● ● ● 思考中    │ ← AI 回复区在下方生长
│                  │
│                  │
└─────────────────┘

AI 输出过程中：
┌─────────────────┐
│ 用户消息         │ ← 始终可见
│ ─────────────── │
│ [思考过程...]    │
│ AI 正文第一段    │ ← 新内容从这里往下长
│ AI 正文第二段    │
│ █               │ ← 光标位置
└─────────────────┘
```

核心实现原理：

1. **Anchor Node**：用户消息发出后，将该消息 DOM 节点设为"锚点"
2. **锚点锁定**：在 AI 输出过程中，每次 DOM 高度变化后，计算锚点相对视口的偏移是否变了，如果变了就补偿 `scrollTop`
3. **解锁条件**：用户主动上滑 → 解锁锚定，显示"回到底部"按钮

```typescript
// 概念模型
class ScrollAnchor {
  private anchorEl: HTMLElement | null = null
  private anchorOffset: number = 0
  private locked: boolean = false
  
  // 用户发送消息时调用
  setAnchor(el: HTMLElement) {
    this.anchorEl = el
    this.anchorOffset = el.getBoundingClientRect().top
    this.locked = true
  }
  
  // 每次 DOM 变化后调用（MutationObserver 或 ResizeObserver）
  reconcile(container: HTMLElement) {
    if (!this.locked || !this.anchorEl) return
    const currentOffset = this.anchorEl.getBoundingClientRect().top
    const drift = currentOffset - this.anchorOffset
    if (Math.abs(drift) > 1) {
      container.scrollTop += drift
    }
  }
  
  // 用户手动滚动时
  onUserScroll(distFromBottom: number) {
    if (distFromBottom > 200) this.locked = false
  }
}
```

OCT 当前的 `bottomRef.scrollIntoView({ behavior: 'instant' })` 是最粗暴的方案——强制跳到底部。这在快速流式输出时会导致：内容增长 → 跳底 → 内容增长 → 跳底，形成视觉抖动。

---

### 2.5 Interaction Model（交互模型）

#### 状态可视化

| Turn Phase | 用户看到什么 | UI 行为 |
|---|---|---|
| `idle` | 输入框可用 | 正常输入 |
| `submitted` | 消息已发出，等待响应 | 输入框灰色，显示"等待中" |
| `thinking` | 思考指示器 + CoT 面板（如开启） | CoT 内容实时流入 |
| `streaming` | 正文逐 token 出现 | 光标闪烁在末尾 |
| `tool_calling` | "正在调用 XX 工具..." | 显示工具名和参数 |
| `tool_executing` | 工具执行进度 | 可能有进度条或日志 |
| `continuing` | AI 继续基于工具结果回复 | 回到 streaming 状态 |
| `finalizing` | 内容完成，做最终渲染 | 切换到 Markdown 完整渲染 |
| `done` | 回复完成 | 显示操作按钮（复制/重新生成等） |
| `cancelled` | "已停止生成" | 显示已生成的部分内容 |

OCT 当前缺少的关键交互：
- **Cancel / Stop**：用户能随时停止生成
- **Regenerate**：对最后一条 AI 回复重新生成
- **Edit & Resend**：编辑之前的用户消息并重新发送
- **Branch**：从某条消息分叉出新的对话分支

---

### 2.6 Agent-Ready Architecture（Agent 就绪架构）

OCT 的远期目标是 Multi-Agent System。架构现在就要为此做准备。

#### 工具调用的数据流

```
AI 输出 token → Block Router 检测到工具调用标记
     │
     ▼
┌─ ToolCall ContentBlock ─┐
│  tool_name: "web_search"│
│  arguments: {...}        │
│  state: 'pending'        │
└────────────┬─────────────┘
             │ 发送到 Gateway
             ▼
┌─ Gateway Tool Executor ──┐
│  执行工具                 │
│  流式返回进度/结果         │
└────────────┬─────────────┘
             │ 结果回传
             ▼
┌─ ToolResult ContentBlock ┐
│  result: {...}            │
│  state: 'complete'        │
└────────────┬─────────────┘
             │ 注入到消息上下文
             ▼
       AI 继续流式输出
```

这个流程在 OCT 的 Gateway 里已经有雏形（tools 目录下的 25 个工具），但前端完全不知道工具调用的存在——它只看到一段连续的文本流。

改进：让 Gateway 在工具调用时发送结构化的 WebSocket 事件：

```json
{ "type": "event", "event": "tool_call", "payload": {
    "tool": "web_search",
    "args": { "query": "xxx" },
    "state": "executing"
}}
```

前端收到后渲染一个 `ToolCallBlock` 组件，显示工具名和执行状态。

---

## 3️⃣ Message Lifecycle（消息生命周期）

完整的一轮对话：

```
[1] User Input
    用户在输入框输入文字、粘贴图片、选择文件
    输入框支持多行、预览附件
    
[2] Message Commit
    用户按发送 → 创建 UserMessage 加入 MessageStore
    清空输入框
    发送 WebSocket 请求到 Gateway
    
[3] Viewport Reanchor
    用户消息 DOM 节点就位
    视口 snap 到用户消息位置
    设置滚动锚点
    
[4] Thinking Phase
    Gateway 开始处理
    前端收到 phase: 'thinking' 事件
    显示思考指示器
    如果 CoT 开启，创建 CoT ContentBlock 开始接收思考内容
    
[5] Token Stream
    Gateway 流式返回 token
    Block Router 实时分类路由
    各 ContentBlock 增量更新
    视口保持锚定，新内容向下生长
    
[6] Tool Execution（可选）
    AI 请求调用工具 → 显示 ToolCall 块 → 执行 → 显示结果 → AI 继续
    
[7] Finalization
    收到 done 信号
    CoT 块自动折叠
    流式渲染切换到完整 Markdown 渲染（最终 pass）
    显示操作按钮（复制、重新生成、TTS 等）
    
[8] Memory Integration
    保存对话到 Nocturne 记忆系统
    更新 token 计数和 session 元数据
```

---

## 4️⃣ State Management 哲学

### 为什么消息数组 + useState 会失败

OCT 当前的核心状态：

```typescript
const [messages, setMessages] = useState<ChatMessage[]>([])
const [isStreaming, setIsStreaming] = useState(false)
const [awaitingResponse, setAwaitingResponse] = useState(false)
const [streamingContent, setStreamingContent] = useState('')
const [displayedLength, setDisplayedLength] = useState(0)
```

问题：

1. **`setMessages` 每次都克隆整个数组**。200 条消息时，每个 token 到达都创建一个新数组。
2. **`streamingContent` 是冗余状态**。它和 `messages[last].content` 表达同一件事，但两者可能不同步。
3. **`displayedLength` 是 UI 层的概念，混入了数据层**。它不应该存在于消息状态里。
4. **多个 boolean 的笛卡尔积**。`isStreaming × awaitingResponse × agentPhase` 有 2×2×3=12 种组合，其中大部分是无效状态。

### 推荐的状态拓扑

```
┌───────────────────────────────────────┐
│         External Store (非 React)      │
│                                        │
│  MessageStore: 消息仓库（ref-stable）   │
│  TurnFSM: 轮次状态机                   │
│  StreamBuffer: 流式缓冲区              │
│                                        │
│  → 通过 subscribe 通知 React 层        │
│  → React 组件只读取，不直接修改         │
└────────────────────┬──────────────────┘
                     │ 细粒度事件
                     ▼
┌───────────────────────────────────────┐
│         React UI Layer                 │
│                                        │
│  useMessage(id) → 单条消息状态         │
│  useTurnPhase() → 当前轮次阶段         │
│  useStreamingBlock(blockId) → 流式块   │
│                                        │
│  组件只因自己关心的数据变化而重渲染      │
└───────────────────────────────────────┘
```

关键原则：**每个组件只订阅它需要的最小数据切片**。历史消息组件不会因为当前流式输出而重渲染。流式输出组件不会因为历史消息的存在而变慢。

实现上不需要引入 Redux/Zustand/MobX 这些库。一个简单的 EventEmitter + useRef + useSyncExternalStore 就够了。重要的是**思维方式**：状态不在 React 里，React 只是视图层。

---

## 5️⃣ GPT/Claude 级别的 UX 原则

### 原则 1：稳定性 > 动画

用户在阅读 AI 回复时，视口里的任何元素都不应该"跳"。新内容只能在**视口边缘之外**出现（下方），或者在**已分配空间内**变化（比如 CoT 面板内的内容更新）。

OCT 现在的打字机效果反而制造了不稳定——因为 Markdown 解析不完整文本会产生布局差异（不完整的表格突然完整 → 高度突变）。

正确做法：
- 流式阶段用**原始文本渲染**（`white-space: pre-wrap`），高度变化是线性可预测的
- 只在块级元素完成时（段落结束、代码块关闭）才做 Markdown 渲染升级
- 表格、代码块这些块级结构，在流式阶段以纯文本或简化格式显示（OCT 的 `msg-streaming-raw-table` 已经在做这件事，方向正确）

### 原则 2：空间连续性

用户发的消息和 AI 的回复之间有一个**空间关系**：用户消息是"起点"，AI 回复是"终点"，它们之间的空间代表"AI 在工作"。

- 思考指示器应该出现在用户消息正下方
- CoT 面板在指示器位置展开
- 正文从 CoT 下方开始生长
- 操作按钮在正文结束后出现

每个元素都有清晰的空间层级关系。不应该出现"内容从天上掉下来"或"突然在中间插入"的感觉。

### 原则 3：认知流保持

用户在阅读 AI 回复时，他的眼睛在追踪一个**阅读锚点**——通常是最新出现的文字。

- 如果新内容在视口底部出现 → 自然跟随
- 如果用户上滑了（想回看之前的内容）→ 停止自动滚动，不要把用户拉回底部
- 提供一个不显眼的"↓ 新内容"指示器

OCT 的 `userScrolledUp` 逻辑已经部分实现了这一点，方向正确。

### 原则 4：对话重力

对话有"重力"——最新的交互是最重要的。但这不意味着"总是跳到最底部"。

"重力"意味着：
- 新对话开始时，视口自然落到最新位置
- AI 正在输出时，视口跟随输出
- 用户主动回溯时，"重力"暂停，但始终有一个回到当前的路径
- 不同的 ContentBlock 有不同的"视觉重量"：代码块比纯文本重，工具调用结果比普通文字重

---

## 6️⃣ OCT 目标架构（文本图）

```
═══════════════════════════════════════════════════════
                    OCT v2 Architecture
═══════════════════════════════════════════════════════

┌─── Input Layer ─────────────────────────────────────┐
│  TextInput │ FileUpload │ VoiceInput │ QuickCommand  │
│  → produces UserIntent                               │
└──────────────────────────┬──────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────┐
│                  Conversation Core                    │
│                                                      │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐ │
│  │ MessageStore│  │ TurnFSM  │  │ SessionManager │ │
│  │             │  │          │  │                │ │
│  │ messages[]  │  │ idle     │  │ sessions[]     │ │
│  │ branches[]  │  │ thinking │  │ currentSession │ │
│  │ subscribe() │  │ streaming│  │ persistence    │ │
│  │             │  │ tool_exec│  │                │ │
│  └──────┬──────┘  │ done     │  └────────────────┘ │
│         │         │ cancelled│                      │
│         │         └─────┬────┘                      │
└─────────┼───────────────┼───────────────────────────┘
          │               │
┌─────────▼───────────────▼───────────────────────────┐
│                 Streaming Engine                      │
│                                                      │
│  WebSocket ──→ TokenBuffer ──→ BlockRouter           │
│                                    │                 │
│                    ┌───────────────┼──────────┐      │
│                    ▼               ▼          ▼      │
│               CoT Block      Text Block   Code Block │
│               Tool Block     Table Block  ...        │
│                                                      │
│  每个 Block 独立接收 token，独立触发 UI 更新          │
└──────────────────────────┬──────────────────────────┘
                           │ RenderOp events
┌──────────────────────────▼──────────────────────────┐
│                 Rendering Engine                      │
│                                                      │
│  BlockRegistry → 每种 ContentBlock 对应渲染器        │
│  IncrementalParser → 段落级增量 Markdown 解析        │
│  FinalPass → 流式结束后做完整 Markdown 渲染          │
│                                                      │
│  关键：流式阶段不跑 ReactMarkdown                    │
│       只在块完成或 done 时做完整渲染                  │
└──────────────────────────┬──────────────────────────┘
                           │ DOM mutations
┌──────────────────────────▼──────────────────────────┐
│               Viewport Controller                    │
│                                                      │
│  ScrollAnchor → 锚定用户消息位置                     │
│  LayoutReconciler → DOM 高度变化后补偿滚动           │
│  UserScrollDetector → 检测用户主动滚动               │
│                                                      │
│  目标：零跳动，用户消息始终可见                       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                   Agent System                        │
│                                                      │
│  ToolExecutor → Gateway 的工具调用/返回              │
│  AgentRouter → 多 Agent 路由（未来）                 │
│  TaskRunner → 长时间任务管理（未来）                 │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                   Memory System                       │
│                                                      │
│  Nocturne → 持久化记忆                               │
│  SessionHistory → 对话历史压缩存储                   │
│  FeedbackLoop → 用户反馈收集                         │
└──────────────────────────────────────────────────────┘
```

---

## 7️⃣ 迁移策略（最重要的实操部分）

**不能一次性重写。** OCT 是一个正在使用的产品，Zilong 依赖 Cursor 做实现，每次改动必须可验证、可回滚。

### Phase 0：准备工作（0.5 天）

**目标**：建立安全基线。

- 将当前 `ChatTab.tsx` 备份为 `ChatTab.v1.tsx`
- 创建 `src/core/` 目录用于存放新架构的核心模块
- 创建 `src/core/types.ts` 定义 ContentBlock、MessageState 等核心类型
- 这个阶段不修改任何现有代码

### Phase 1：ContentBlock 数据模型（1 天）

**目标**：引入新的消息数据模型，但 UI 层不变。

- 创建 `src/core/types.ts`：ContentBlock 类型定义
- 创建 `src/core/blockRouter.ts`：文本 → ContentBlock[] 转换器
- 修改 `parseOptionBox.ts` 的返回值，让它返回 `ContentBlock[]` 而不是自定义结构
- **验证方式**：写单元测试（Vitest），确认各种输入文本能正确拆分为 ContentBlock 数组
- UI 层此时仍然使用旧的 segments 接口，通过适配层桥接

### Phase 2：TurnFSM 状态机（0.5 天）

**目标**：用一个状态机替换 `isStreaming + awaitingResponse + agentPhase`。

- 创建 `src/core/turnFSM.ts`：有限状态机，定义所有合法的状态转换
- 在 ChatTab 中，旧的 boolean 变量**继续保留但由 FSM 驱动**：

```typescript
// 适配层：FSM → 旧变量
const phase = turnFSM.current
const isStreaming = phase === 'streaming' || phase === 'thinking'
const awaitingResponse = phase === 'submitted'
const agentPhase = phase === 'thinking' ? 'thinking' : phase === 'streaming' ? 'typing' : 'idle'
```

- **验证方式**：所有现有功能不变，但状态管理更清晰

### Phase 3：流式 Block Router（1-2 天）⭐ 关键阶段

**目标**：在流式阶段实时分类 token 到 ContentBlock，而不是完成后正则解析。

- 创建 `src/core/streamBlockRouter.ts`
- 修改 `handleIncomingMessage` 中的流式处理逻辑：
  - token 到达 → 喂入 BlockRouter → 产出 ContentBlock 增量事件
  - 不再累积到 `streamingMessageRef` 后切片
- CoT 内容从第一个 token 就路由到 CoT Block，实时显示
- 正文内容路由到 Text Block，可以保留打字机效果或直接实时显示
- **验证方式**：CoT 面板在 AI 开始输出时立刻出现（不等打字机），正文流式输出无跳动

### Phase 4：增量渲染（1 天）

**目标**：流式阶段不再每帧跑 ReactMarkdown。

- 流式文本块使用 `pre-wrap` + 直接文本追加
- 代码块用独立的 `<pre>` 元素，token 追加到 textContent
- 只在块完成（段落结束符、代码块结束符）时做 Markdown 渲染
- `done` 信号到达后，对整个消息做一次最终 Markdown 渲染 pass
- **验证方式**：长回复的流式输出不再有表格闪烁、布局跳动

### Phase 5：Viewport 锚定（1 天）

**目标**：用户消息发出后始终可见。

- 实现 ScrollAnchor 类
- 用户发送消息 → snap 到用户消息位置 → 锚定
- AI 输出时 → MutationObserver 检测高度变化 → 补偿滚动
- 用户上滑 → 解除锚定 → 显示"回到底部"
- **验证方式**：发送长问题后，问题始终在视口上方可见，AI 回复在下方生长

### Phase 6：Agent 就绪（0.5 天）

**目标**：让 Gateway 的工具调用在前端可见。

- Gateway 工具调用时发送 `tool_call` 事件
- 前端新增 `ToolCallBlock` 和 `ToolResultBlock` 组件
- 在 BlockRouter 中加入工具调用识别
- **验证方式**：AMY 调用搜索工具时，前端显示"正在搜索..."卡片

---

### 时间线估算

| Phase | 内容 | 预计时间 | 风险 |
|-------|------|---------|------|
| 0 | 准备 | 0.5 天 | 无 |
| 1 | ContentBlock 模型 | 1 天 | 低 |
| 2 | TurnFSM | 0.5 天 | 低 |
| 3 | 流式 Block Router | 1-2 天 | **中**（最复杂） |
| 4 | 增量渲染 | 1 天 | 中 |
| 5 | Viewport 锚定 | 1 天 | 低 |
| 6 | Agent 就绪 | 0.5 天 | 低 |
| **总计** | | **5-6 天** | |

**每个 Phase 都是独立可部署的**。Phase 1 完成后如果发现问题可以回滚而不影响后续。Phase 3 是最关键的——它决定了整个流式体验的质量。

### 渐进式迁移的关键原则

1. **适配层桥接**：每个新模块都通过适配层和旧代码共存，不做断崖式切换
2. **旧路径保留**：新模块 ready 前，旧路径继续工作。用 feature flag 切换
3. **每 Phase 一个 PR**：每个阶段完成后提交，通过手动测试验证后再进入下一阶段
4. **Cursor Prompt 分阶段出**：我（Claude）为每个 Phase 出独立的 Cursor prompt，不一次性倾倒所有改动

---

## 附录：OCT 现有架构的精确诊断

### 哪些做对了

- `optionBoxParser.ts` 的段 (segment) 概念方向正确，是 ContentBlock 的雏形
- `agentPhase` 状态的引入是状态机思维的开始
- Gateway 的工具加载机制（`tool_loader.js`）已经为 Agent 做了准备
- CSS 变量系统干净，不需要重构
- WebSocket 事件格式（`type: 'event', event: 'chat', payload: {...}`）已经是结构化的

### 哪些需要改

- `ChatTab.tsx` 承载了太多职责（WebSocket 管理 + 状态管理 + UI 渲染 + 日志面板 + Gateway 控制），需要拆分
- 打字机效果（`displayedLength` + `setInterval`）是根本性的设计债务
- `streamingMessageRef` 作为全局字符串缓冲区是流式架构的瓶颈
- 消息数组的频繁 `setMessages(prev => prev.map(...))` 是性能问题的根源
- `react-markdown` 在流式阶段的逐帧调用需要替换为增量方案

---

*这份文档是架构蓝图，不是实现方案。每个 Phase 的实现需要独立的 Cursor prompt。*
*建议 Zilong 审核后确认优先级顺序，我来逐阶段出具体的实施文档。*
