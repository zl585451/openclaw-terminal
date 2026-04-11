# OCT Gateway 分层重构计划书

> 版本：v1.1 | 日期：2026-04-09
> 状态：Phase 1～6 已完成，`handleSlashCommand` 已迁入 `SlashHandler`，Feature Flag 已全量验证并清理，`legacyTransport` 已删除。剩余：`ai.js` 进一步拆分（可选）、Runtime 层测试补强 | 作者：AI Architect + 少爷

---

## 一、现状分析

### 1.1 当前文件规模

| 文件 | 行数 | 职责（现状） |
|------|------|-------------|
| `index.js` | **267** | 入口装配：初始化 Transport / Gateway / Runtime / Services，并连接依赖 |
| `gateway/slash.js` | **740** | 所有 Slash 命令的解析、路由与回复 |
| `ai.js` | **1009** | Provider 调用、流式执行、工具循环、System Prompt 组装 |
| `context_manager.js` | 159 | 上下文窗口策略 |
| `session.js` | 152 | 会话存储 |
| `orchestrator.js` | 258 | 意图分类 + 后台任务分发 |
| `providers.js` | 183 | Provider 注册表 |
| `memory.js` | 480 | Nocturne 客户端 |
| `tool_loader.js` | ~115 | 工具动态加载 |
| `tools/` | 29 个文件 | 具体工具实现 |
| `mcp/` | 2 个文件 | MCP 协议客户端 |

### 1.2 核心问题

```
index.js (2172 行)
├── WebSocket 服务器生命周期      ← 传输层
├── HTTP 路由 + MCP 管理路由      ← 传输层
├── 认证握手逻辑                  ← 安全层
├── chat.send 消息处理            ← 业务层
│   ├── 图片附件路由              ← 业务层
│   ├── 上下文组装                ← Runtime 层
│   ├── 流式响应 + smoother       ← Runtime 层
│   ├── 工具事件转发              ← Runtime 层
│   └── 回复后处理（5个Nocturne队列）← 后处理层
├── Slash 命令处理                ← 业务层
├── 记忆健康检查 + 定时任务        ← 运维层
└── 停车检测逻辑                  ← 业务层
```

**问题总结：**
1. **垂直切面全耦合** — 传输、认证、业务、执行、后处理混在同一个 `ws.on('message')` 回调中
2. **无法独立测试** — 测试 chat 逻辑必须启动 WebSocket 服务器
3. **扩展困难** — 新增渠道（HTTP API / Mobile / CLI）需要复制大量逻辑
4. **ai.js 双重职责** — 既是 "怎么调模型" 又是 "调哪个模型"，Provider 路由和执行循环纠缠

---

## 二、目标架构

### 2.1 分层总览

```
┌─────────────────────────────────────────────────┐
│                  Transport Layer                 │
│  WebSocket Server │ HTTP API │ Future: CLI/gRPC  │
│  认证 │ 连接管理 │ 消息序列化/反序列化           │
└──────────────────┬──────────────────────────────┘
                   │ Request / Response / Event
                   ▼
┌─────────────────────────────────────────────────┐
│                  Gateway Layer                   │
│  MessageRouter │ SlashHandler │ SessionManager   │
│  消息分发 │ 命令路由 │ 会话生命周期              │
└──────────────────┬──────────────────────────────┘
                   │ ChatRequest / ChatResponse
                   ▼
┌─────────────────────────────────────────────────┐
│               Agent Runtime Layer                │
│  ChatEngine │ ContextBuilder │ StreamController  │
│  对话循环 │ 上下文组装 │ 流控 + Smoother          │
│  ProviderRouter │ ToolExecutor │ ModelFailover   │
│  模型路由 │ 工具执行循环 │ 降级策略               │
└──────────────────┬──────────────────────────────┘
                   │ ToolCall / MemoryOp
                   ▼
┌─────────────────────────────────────────────────┐
│                  Service Layer                   │
│  ToolRegistry │ MemoryService │ MCPBridge        │
│  工具注册+执行 │ Nocturne封装 │ MCP协议桥接      │
│  PostProcessor │ OrchestratorService             │
│  回复后处理链 │ 意图分类                         │
└─────────────────────────────────────────────────┘
```

### 2.2 各层职责定义

#### Transport Layer（传输层）

**职责：** 网络协议处理，与业务逻辑完全解耦

| 模块 | 文件 | 职责 |
|------|------|------|
| `WsTransport` | `transport/ws.js` | WebSocket 服务器、连接池、心跳、认证握手 |
| `HttpTransport` | `transport/http.js` | HTTP 路由、MCP 管理端点、Mobile 页面 |
| `protocol.js` | `transport/protocol.js` | 消息序列化/反序列化、协议版本协商 |

**关键原则：**
- Transport 层只做 `bytes ↔ Message Object` 的转换
- 认证完成后，将 `Request` 对象交给 Gateway 层
- 不包含任何业务判断逻辑

#### Gateway Layer（网关层）

**职责：** 请求路由、会话管理、消息分发

| 模块 | 文件 | 职责 |
|------|------|------|
| `MessageRouter` | `gateway/router.js` | 根据 method 分发到对应 Handler |
| `SlashHandler` | `gateway/slash.js` | Slash 命令解析和执行 |
| `SessionManager` | `gateway/session.js` | 会话 CRUD、历史管理（已有，微调） |
| `EventBus` | `gateway/eventBus.js` | 层间事件通信（tool 事件、phase 事件） |

**关键原则：**
- Gateway 不知道 "怎么调模型"，只知道 "这个请求该交给谁"
- EventBus 解耦 Runtime 事件和 Transport 推送

#### Agent Runtime Layer（运行时层）

**职责：** AI 对话执行循环，从接收 ChatRequest 到产出 ChatResponse 的全过程

| 模块 | 文件 | 职责 |
|------|------|------|
| `ChatEngine` | `runtime/chatEngine.js` | 对话主循环：组装上下文 → 调用模型 → 处理工具 → 返回结果 |
| `ContextBuilder` | `runtime/contextBuilder.js` | System Prompt + 记忆注入 + 历史窗口 + 附件处理 |
| `StreamController` | `runtime/streamController.js` | 流式响应管理：smoother、取消、超时 |
| `ProviderRouter` | `runtime/providerRouter.js` | 模型选择、能力矩阵、Failover 策略 |
| `ToolLoop` | `runtime/toolLoop.js` | 工具调用循环：解析 tool_calls → 执行 → 注入结果 → 重新调用 |

**关键原则：**
- ChatEngine 是纯函数式的：输入 ChatRequest，输出 ChatResponse（通过事件流）
- 可以独立于 WebSocket 进行单元测试
- ProviderRouter 集中管理模型能力矩阵和降级逻辑

#### Service Layer（服务层）

**职责：** 基础设施服务，被上层按需调用

| 模块 | 文件 | 职责 |
|------|------|------|
| `ToolRegistry` | `services/toolRegistry.js` | 工具注册、发现、执行委托（合并 tool_loader + MCP） |
| `MemoryService` | `services/memoryService.js` | Nocturne 封装 + 健康检查 + 重试 |
| `PostProcessor` | `services/postProcessor.js` | 回复后处理链：feedback/parking/history/clarification |
| `OrchestratorSvc` | `services/orchestrator.js` | 意图分类（已有，位置调整） |
| `ImageService` | `services/imageService.js` | 图片分析路由（inline vision vs fallback） |

---

### 2.3 层间接口约定

#### Transport → Gateway

```javascript
// gateway/router.js 暴露的唯一入口
interface GatewayRouter {
  /**
   * 处理已认证的请求
   * @param request - 标准化请求对象
   * @param connection - 抽象连接（用于事件推送）
   */
  handleRequest(request: GatewayRequest, connection: ClientConnection): Promise<void>
}

// 标准化请求
interface GatewayRequest {
  id: string
  method: string          // 'chat.send' | 'sessions.list' | ...
  params: Record<string, any>
  sessionKey: string
  clientId: string
}

// 抽象连接（Transport 实现）
interface ClientConnection {
  send(message: object): void
  isOpen(): boolean
  readonly clientId: string
}
```

#### Gateway → Runtime

```javascript
// runtime/chatEngine.js 暴露的接口
interface ChatEngine {
  /**
   * 执行一轮对话
   * @param request - 对话请求
   * @param emitter - 事件发射器（流式推送）
   * @returns 最终回复
   */
  execute(request: ChatRequest, emitter: ChatEmitter): Promise<ChatResult>
  
  /**
   * 取消当前对话
   */
  cancel(): void
}

interface ChatRequest {
  sessionKey: string
  userMessage: string
  attachments: Attachment[]
  canvasContext?: CanvasRoundtripContext
  options?: {
    pacingMs?: number
    model?: string           // 允许覆盖默认模型
  }
}

interface ChatEmitter {
  onDelta(chunk: string): void
  onToolEvent(event: ToolEvent): void
  onPhaseChange(phase: AgentPhase, meta?: object): void
  onUsage(usage: UsageInfo): void
  onCanvasEvent(action: string, payload: object): void
}

interface ChatResult {
  reply: string
  usage?: UsageInfo
  model?: string
  toolCalls?: ToolCallRecord[]
}
```

#### Runtime → Services

```javascript
// services/toolRegistry.js
interface ToolRegistry {
  getDefinitions(): ToolDefinition[]
  executeTool(name: string, args: object): Promise<ToolResult>
  registerProvider(provider: ToolProvider): void
}

// services/memoryService.js
interface MemoryService {
  isAlive(): Promise<boolean>
  readMemory(uri: string): Promise<any>
  writeMemory(uri: string, content: string, version: number, desc: string): Promise<void>
  searchMemory(query: string): Promise<MemoryResult[]>
}

// services/postProcessor.js
interface PostProcessor {
  /**
   * 回复后处理链（异步，不阻塞主流程）
   */
  process(context: PostProcessContext): void
}

interface PostProcessContext {
  userMessage: string
  assistantReply: string
  sessionKey: string
  history: Message[]
}
```

---

## 三、文件结构规划

```
oct-gateway/
├── index.js                    ← 入口：启动 Transport + 初始化
├── transport/
│   ├── ws.js                   ← WebSocket 服务器 + 认证
│   ├── http.js                 ← HTTP 路由
│   └── protocol.js             ← 消息协议
├── gateway/
│   ├── router.js               ← 消息路由器
│   ├── slash.js                ← Slash 命令处理
│   ├── session.js              ← 会话管理（已有，迁入）
│   └── eventBus.js             ← 事件总线
├── runtime/
│   ├── chatEngine.js           ← 对话主循环
│   ├── contextBuilder.js       ← 上下文组装
│   ├── streamController.js     ← 流控
│   ├── providerRouter.js       ← 模型路由 + Failover
│   └── toolLoop.js             ← 工具调用循环
├── services/
│   ├── toolRegistry.js         ← 工具注册中心
│   ├── memoryService.js        ← Nocturne 封装
│   ├── postProcessor.js        ← 后处理链
│   ├── orchestrator.js         ← 意图分类
│   └── imageService.js         ← 图片分析
├── tools/                      ← 保持不变
│   ├── shared.js
│   ├── read_file.js
│   └── ...
├── mcp/                        ← 保持不变
│   ├── manager.js
│   └── client.js
├── config.js                   ← 保持不变
├── providers.js                ← 保持不变（被 providerRouter 引用）
├── logger.js                   ← 保持不变
└── [其他辅助文件保持不变]
```

---

## 四、重构原则

### 4.1 Strangler Fig 模式

> 不重写，而是在旧代码旁边长出新代码，逐步替换。

```
Phase 1: index.js 调用 → newModule.method()  （新模块是 index.js 的 "内部库"）
Phase 2: index.js 变成 thin wrapper           （只做胶水）
Phase 3: 删除 index.js 中被替代的代码         （新模块成为主体）
```

### 4.2 Adapter 兼容层

参考 OpenClaw 的 `turnAdapter.ts` 和 `streamAdapter.ts` 模式：

```javascript
// 迁移期间，新模块暴露 legacy 兼容接口
// 例：新的 ChatEngine 对外仍然兼容旧的 streamChat 签名
module.exports.streamChat = function legacyStreamChat(opts) {
  const engine = new ChatEngine(/* services */);
  return engine.execute(
    { userMessage: opts.messages, ... },
    { onDelta: opts.onDelta, onToolEvent: opts.onToolEvent, ... }
  );
};
```

### 4.3 Feature Flag 保护

```javascript
// config.js 新增
const REFACTOR_FLAGS = {
  USE_NEW_ROUTER: false,       // Phase 2 开启
  USE_NEW_CHAT_ENGINE: false,  // Phase 3 开启
  USE_NEW_TRANSPORT: false,    // Phase 4 开启
};
```

---

## 五、风险评估

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 回归 bug | 高 | 高 | 每个 Phase 完成后回归测试，Feature Flag 可快速回退 |
| 接口不一致 | 中 | 中 | 先定义接口再实现，TypeScript 类型约束 |
| 性能退化 | 低 | 中 | 流式推送路径做 benchmark，确保延迟不增加 |
| 团队并行冲突 | 中 | 低 | 按层分工，Gateway 和 Runtime 可并行开发 |

---

## 附录：参考 — OpenClaw 关键模式

| 模式 | OpenClaw 实现 | OCT 借鉴方式 |
|------|--------------|-------------|
| FSM 状态管理 | `TurnFSM` + `StreamRouter` | Runtime 层的 StreamController 可引入简单状态机 |
| Adapter 兼容层 | `blockAdapter.ts`, `turnAdapter.ts` | 每个新模块提供 legacy 兼容导出 |
| Plugin Provider | `toolLoader.registerProvider()` | ToolRegistry 统一管理静态工具 + MCP 动态工具 |
| Event Emitter | `subscribe()` 模式 | EventBus 解耦层间通信 |
| Feature Flags | `FEATURE_FLAGS` 对象 | `REFACTOR_FLAGS` 控制渐进切换 |
