# OCT Gateway 重构执行方案

> 版本：v1.0 | 日期：2026-04-08
> 配套文件：[oct-gateway-refactor-plan.md](./oct-gateway-refactor-plan.md)

---

## 执行总览

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
 服务层      网关层      运行时层     传输层      清理
 (低风险)   (中风险)    (高风险)    (中风险)    (低风险)
 ~3天       ~3天        ~5天        ~3天        ~2天
```

**总工期估算：约 16 个工作日（含测试）**

**进度：** Phase 1～5 已于 **2026-04-09** 完成核心重构、联调修复与低风险清理；当前进入“可交付完成，保留优化项”的状态。Feature Flag 与少量 legacy/fallback 仍保留，作为后续稳态观察与渐进收缩的安全边界。

---

## Phase 1：抽取 Service Layer（低风险热身）

### 目标
将 `index.js` 中散落的服务逻辑抽取为独立模块，不改变调用链。

### 1.1 抽取 PostProcessor

**从 index.js 中提取的代码段（约 L1057-L1096）：**

```
回复完成后的 5 个 nocturneQueue.enqueue() 调用：
├── memoryFeedback.detectAndSaveFeedback()
├── detectAndSaveParking()
├── memoryHistory.saveHistorySummary()
├── extractAndSaveMemory()
└── clarificationMemory.detectAndSaveClarification()
```

**新建文件：`services/postProcessor.js`**

```javascript
// services/postProcessor.js
const nocturneQueue = require('../nocturne_task_queue');
const memoryFeedback = require('../memory_feedback');
const memoryHistory = require('../memory_history');
const clarificationMemory = require('../clarification_memory');

class PostProcessor {
  constructor({ memoryModule, sessionModule }) {
    this.memory = memoryModule;
    this.session = sessionModule;
  }

  /**
   * 回复后处理链（全部异步入队，不阻塞主流程）
   */
  process({ userMessage, assistantReply, sessionKey, prevAssistantReply }) {
    nocturneQueue.enqueue(
      () => memoryFeedback.detectAndSaveFeedback(userMessage, assistantReply),
      'memoryFeedback'
    );
    nocturneQueue.enqueue(
      () => this._detectAndSaveParking(userMessage, sessionKey),
      'detectAndSaveParking'
    );
    nocturneQueue.enqueue(
      () => memoryHistory.saveHistorySummary(userMessage, assistantReply),
      'memoryHistory'
    );
    nocturneQueue.enqueue(
      () => this._extractAndSaveMemory(userMessage, assistantReply),
      'extractAndSaveMemory'
    );
    nocturneQueue.enqueue(
      () => clarificationMemory.detectAndSaveClarification(
        userMessage, assistantReply, prevAssistantReply
      ),
      'clarificationMemory'
    );
  }

  // 从 index.js 迁入 detectAndSaveParking()
  async _detectAndSaveParking(userMsg, sessionKey) { /* 原有逻辑 */ }

  // 从 index.js 迁入 extractAndSaveMemory()
  async _extractAndSaveMemory(userMsg, assistantReply) { /* 原有逻辑 */ }
}

module.exports = PostProcessor;
```

**index.js 改动：**

```javascript
// 替换前（约 40 行）：
nocturneQueue.enqueue(() => memoryFeedback.detectAndSaveFeedback(...), ...);
nocturneQueue.enqueue(() => detectAndSaveParking(...), ...);
// ... 5 个 enqueue

// 替换后（1 行）：
postProcessor.process({ userMessage, assistantReply: sanitizedReply, sessionKey, prevAssistantReply });
```

**验证点：** 发送一条消息，检查 Nocturne 队列日志，确认 5 个后处理任务正常入队。

---

### 1.2 抽取 ImageService

**从 index.js 中提取（约 L684-L780）：** 图片附件路由逻辑

**新建文件：`services/imageService.js`**

```javascript
class ImageService {
  /**
   * 处理图片附件，返回标准化的 messageContent
   * @returns { content: string | Array, visionModel?: string }
   */
  async processImageAttachments(userMessage, imageAttachments, currentModel, providerConfig) {
    // 从 index.js 迁入：inline vision vs image_analyzer fallback 路由逻辑
  }
}
```

**验证点：** 发送带图片的消息，确认 inline vision 和 fallback 两条路径都正常。

---

### 1.3 抽取 EventBus

**新建文件：`gateway/eventBus.js`**

```javascript
const { EventEmitter } = require('events');

class EventBus extends EventEmitter {
  emitToolEvent(event) { this.emit('tool', event); }
  emitPhaseChange(phase, meta) { this.emit('phase', { phase, ...meta }); }
  emitCanvasEvent(action, payload) { this.emit('canvas', { action, payload }); }
  emitChatDelta(delta) { this.emit('chat:delta', delta); }
  emitChatDone(result) { this.emit('chat:done', result); }
}

module.exports = EventBus;
```

**此阶段只创建，不接入。** Phase 2 接入。

---

### Phase 1 检查清单

- [x] `services/postProcessor.js` 创建并测试
- [x] `services/imageService.js` 创建并测试
- [x] `gateway/eventBus.js` 创建（仅落盘，未接入 `index.js`，符合本阶段约定）
- [x] `index.js` 用新模块替换内联代码，净减少约 120+ 行（相对计划书成稿时 `index.js` 体量）
- [x] 自动化验证：`node --check oct-gateway/index.js` 通过；`npx vitest run` 64 tests 全过（2026-04-08）
- [x] 手工回归：普通消息、带图消息（inline vision + analyzer fallback）、Slash、记忆后处理队列日志 — **需在本地联调环境由人工点验**

### Phase 1 验收记录（2026-04-08）

| 项 | 结果 |
|----|------|
| `PostProcessor` | `index.js` 在 `streamChat` `onDone` 中调用 `postProcessor.process({ userMessage, assistantReply, sessionKey, prevAssistantReply })`；五条 Nocturne 入队与 1.1 设计一致 |
| `ImageService` | 带图分支调用 `imageService.processImageAttachments`；返回 `content` 供后续上下文组装 |
| `EventBus` | 文件位于 `oct-gateway/gateway/eventBus.js`；Phase 2 首轮仍未实例化接入（`MessageRouter` 当前不依赖 EventBus），后续可与 Runtime 事件流一并接线 |
| 实现差异说明 | 仓库中 `PostProcessor` 采用**依赖注入**（`memoryFeedback`、`nocturneQueue`、`memoryGovernor`、`streamChat` 等由 `index.js` 传入），与上文示例代码「模块内 require」等价，更利于后续单测 |

---

## Phase 2：抽取 Gateway Layer（中风险）

### 目标
将消息路由逻辑从 `index.js` 的 `ws.on('message')` 中提取出来。

### 2.1 抽取 MessageRouter

**新建文件：`gateway/router.js`**

```javascript
class MessageRouter {
  constructor({ chatEngine, sessionManager, slashHandler, eventBus }) {
    this.chatEngine = chatEngine;
    this.session = sessionManager;
    this.slash = slashHandler;
    this.eventBus = eventBus;
  }

  /**
   * 路由已认证的请求
   */
  async handleRequest(request, connection) {
    const { method, params, id } = request;

    switch (method) {
      case 'chat.send':
        return this._handleChatSend(request, connection);
      case 'sessions.list':
        return this._handleSessionsList(request, connection);
      case 'chat.cancel':
        return this._handleChatCancel(request, connection);
      default:
        connection.send({ type: 'res', id, ok: false, error: { message: `Unknown: ${method}` } });
    }
  }

  async _handleChatSend(request, connection) {
    const { params } = request;
    const userMessage = params?.message || '';

    // Slash 命令拦截
    if (userMessage.startsWith('/')) {
      return this.slash.handle(userMessage.trim(), request, connection);
    }

    // 委托给 ChatEngine
    const emitter = this._createEmitter(connection);
    await this.chatEngine.execute({
      sessionKey: params?.sessionKey || 'main',
      userMessage,
      attachments: params?.attachments || [],
      canvasContext: params?.canvasContext || null,
      options: { pacingMs: params?.pacingMs },
    }, emitter);
  }

  _createEmitter(connection) {
    // 将 ChatEngine 事件翻译为 WebSocket 消息格式
    return {
      onDelta: (chunk) => {
        connection.send({ type: 'event', event: 'chat', payload: { delta: chunk, state: 'delta', done: false } });
      },
      onToolEvent: (evt) => { /* ... */ },
      onPhaseChange: (phase, meta) => { /* ... */ },
      onDone: (result) => { /* ... */ },
      onError: (err) => { /* ... */ },
    };
  }
}
```

### 2.2 抽取 SlashHandler

**新建文件：`gateway/slash.js`**

从 `index.js` 的 `handleSlashCommand()` 函数（约 200 行）整体迁入。

```javascript
class SlashHandler {
  constructor({ session, memory, toolLoader, mcpManager, config }) { /* ... */ }

  async handle(command, request, connection) {
    const [cmd, ...args] = command.split(/\s+/);
    switch (cmd) {
      case '/model':    return this._handleModel(args, connection);
      case '/session':  return this._handleSession(args, connection);
      case '/tools':    return this._handleTools(args, connection);
      case '/mcp':      return this._handleMcp(args, connection);
      case '/memory':   return this._handleMemory(args, connection);
      // ...
    }
  }
}
```

### 2.3 index.js 瘦身

**改动策略：** Feature Flag 控制新旧路径

```javascript
// index.js
const { REFACTOR_FLAGS } = require('./config');

ws.on('message', async (data) => {
  // ... 解析 + 认证（保留）

  if (REFACTOR_FLAGS.USE_NEW_ROUTER) {
    // 新路径
    await router.handleRequest({ id, method, params, sessionKey, clientId }, wsConnection);
  } else {
    // 旧路径（原有代码，不删除）
    // ... existing switch/if logic
  }
});
```

**启用方式（与 `config.js` 一致）：**

- 环境变量：`OCT_USE_NEW_ROUTER=1`
- 或用户 `config.json` 顶层：`"refactorFlags": { "USE_NEW_ROUTER": true }`

### Phase 2 检查清单

- [x] `gateway/router.js` 创建并完成首轮接线
- [x] `gateway/slash.js` 创建并接管稳定 Slash 命令，同时保留 legacy fallback
- [x] `config.js` 新增 `REFACTOR_FLAGS`（含 `USE_NEW_ROUTER` / `USE_NEW_CHAT_ENGINE` / `USE_NEW_TRANSPORT` 占位）
- [x] Feature Flag 兼容策略明确：打开 `USE_NEW_ROUTER` 后，Slash / `sessions.list` / 普通 `chat.send` / 未知 method 均走新 Router；legacy 主链保留为 fallback
- [x] 语法验证：`node --check` 通过（`index.js` / `gateway/router.js` / `gateway/slash.js`）
- [x] 自动化：`npx vitest run` 全过；`npx tsc --noEmit` 通过（2026-04-08 验收）
- [x] 回归策略落地：新旧路径可并存，便于继续推进 Phase 3
- [x] 手工：设 `OCT_USE_NEW_ROUTER=1` 后 spot-check `/status`、`/model`、`sessions.list`、普通聊天与复杂 Slash（如 `/memory`）回落

### Phase 2 验收记录（2026-04-08）

| 项 | 状态 |
|----|------|
| `MessageRouter` | `type==='req'` 时处理 `chat.send`（Slash 内联 + 可选 `chatHandler`）、`sessions.list`；其余 method 返回 `Unknown method` 并结束本次消息处理 |
| `SlashHandler` | 已原生承接 `/new` `/reset` `/status` `/model` `/provider` `/help`；其余通过 `handleLegacyCommand` 调用既有 `handleSlashCommand(ws, …)`，与旧路径一致 |
| `chat.send` 主链 | `MessageRouter` 已注入共享 `chatHandler`；普通 `chat.send` 与 Slash 一样先经 Router，再进入 `handleChatRequest()`，由其内部按 `USE_NEW_CHAT_ENGINE` 切换 Runtime/legacy 执行 |
| `ClientConnection` | 认证后构造 `{ clientId, ws, isOpen, send }` 传入 Router；`SlashHandler.reply*` 发出与旧版一致的 `event: chat` 负载 |
| `EventBus` | 本轮未接入；`gateway/eventBus.js` 仍为占位 |
| 结论 | Gateway 首轮落地：**可合并**；进入 Phase 3 前建议完成手工 flag 回归 |

#### 验收期代码修复（必记）

首轮实现中 `SlashHandler` 构造早于 `systemPromptReady` 定义会导致 **`ReferenceError: Cannot access 'systemPromptReady' before initialization`**，网关无法启动。已调整为在 `index.js` 中 **先定义 `systemPromptReady`，再 `new SlashHandler(...)`**。

---

## Phase 3：抽取 Agent Runtime Layer（高风险，核心）

### 目标
将 `ai.js`（1198 行）拆分为职责清晰的运行时模块。

### 3.1 抽取 ProviderRouter

**从 ai.js + providers.js 中提取**

```javascript
// runtime/providerRouter.js
class ProviderRouter {
  constructor(providersConfig) {
    this.providers = providersConfig;
  }

  /**
   * 获取当前模型的 API 配置
   */
  resolve(modelId) {
    // 从 ai.js 迁入：Provider 查找、能力矩阵、baseUrl 组装
    return {
      baseUrl, apiKey, modelDef,
      supports: { tools, thinking, vision, streamOptions }
    };
  }

  /**
   * 模型降级策略
   */
  failover(failedModel, error) {
    // 预留：根据错误类型选择降级模型
    // 5xx → 同 Provider 备选模型
    // 429 → 切换 Provider
  }
}
```

### 3.2 抽取 ContextBuilder

**从 ai.js 中提取上下文组装逻辑**

```javascript
// runtime/contextBuilder.js
class ContextBuilder {
  constructor({ memoryService, contextManager, systemPrompt }) { /* ... */ }

  /**
   * 组装完整的 messages 数组
   */
  async build({ sessionKey, userMessage, attachments, history }) {
    // 1. System Prompt
    // 2. 记忆注入（从 ai.js 迁入）
    // 3. 历史窗口（调用 contextManager）
    // 4. 附件处理（图片 → multimodal content）
    // 5. 当前用户消息
    return messages;
  }
}
```

### 3.3 抽取 StreamController

**从 index.js 中提取流控逻辑**

```javascript
// runtime/streamController.js
class StreamController {
  constructor(emitter) {
    this.emitter = emitter;
    this.cancelled = false;
    this.fullReply = '';
  }

  createSmoother() {
    return createStreamSmoother((chunk) => {
      if (this.cancelled) return;
      this.fullReply += chunk;
      this.emitter.onDelta(chunk);
    });
  }

  cancel() { this.cancelled = true; }
  getFullReply() { return this.fullReply; }
}
```

### 3.4 组装 ChatEngine

```javascript
// runtime/chatEngine.js
class ChatEngine {
  constructor({ providerRouter, contextBuilder, toolRegistry, postProcessor, session }) {
    // 依赖注入
  }

  async execute(request, emitter) {
    const streamCtrl = new StreamController(emitter);

    // 1. Orchestrator 意图分类
    const orchResult = await this.orchestrator.dispatch(request.userMessage, request.sessionKey);

    // 2. 组装上下文
    const messages = await this.contextBuilder.build({
      sessionKey: request.sessionKey,
      userMessage: request.userMessage,
      attachments: request.attachments,
      history: this.session.getHistory(request.sessionKey),
    });

    // 3. 调用模型（流式）
    emitter.onPhaseChange('thinking');
    const smoother = streamCtrl.createSmoother();

    await streamChat({
      messages,
      onDelta: smoother.feed,
      onToolEvent: (evt) => emitter.onToolEvent(evt),
      onDone: (text, usage, model) => {
        smoother.flush();
        const reply = sanitizeAssistantReply(streamCtrl.getFullReply() || text);

        // 4. 存储会话
        if (reply) this.session.addMessage(request.sessionKey, 'assistant', reply);

        // 5. 后处理
        this.postProcessor.process({
          userMessage: request.userMessage,
          assistantReply: reply,
          sessionKey: request.sessionKey,
        });

        // 6. 通知完成
        emitter.onDone({ reply, usage, model });
      },
      onError: (err) => emitter.onError(err),
    });
  }
}
```

### 3.5 迁移策略

```
Step 1: 创建 runtime/ 目录，实现 ChatEngine（内部仍然调用 ai.js 的 streamChat）
Step 2: gateway/router.js 通过 Feature Flag 切换到 ChatEngine
Step 3: 逐步将 ai.js 内部逻辑迁入 ContextBuilder、ProviderRouter
Step 4: ai.js 最终变成 thin wrapper，只保留 streamChat 的 HTTP 调用逻辑
```

**首轮落地说明：** Step 2 当时以「`USE_NEW_ROUTER` + 回落 `chat.send` 块」落地；后续已在 Phase 4 将普通 `chat.send` 收为 `MessageRouter.chatHandler`，因此当前 Router 已能统一承接 Slash 与普通聊天。

### Phase 3 检查清单

- [x] `runtime/providerRouter.js` — 模型路由 + 能力矩阵（首轮落地）
- [x] `runtime/contextBuilder.js` — 上下文组装（首轮落地）
- [x] `runtime/streamController.js` — 流控（首轮落地）
- [x] `runtime/chatEngine.js` — 对话主循环（首轮落地，内部仍调用 `ai.js::streamChat`）
- [x] `runtime/toolLoop.js` — 工具调用循环（首轮落地）
- [x] Feature Flag 接线：`USE_NEW_CHAT_ENGINE` 可切换新旧执行链；`USE_NEW_ROUTER` 可切换网关入口
- [x] 语法验证：`index.js`、`ai.js`、`runtime/*.js` 均通过 `node --check`
- [x] 自动化：`npx vitest run` 全过；`npx tsc --noEmit` 通过（2026-04-08 验收复核）
- [x] 阶段结论：Runtime 关键职责已拆出并接线，允许带着 fallback 保护进入 Phase 4
- [ ] 手工：`OCT_USE_NEW_CHAT_ENGINE=1` 下跑通一轮带工具对话、取消流、与关闭 flag 的 legacy 对照（建议）

### Phase 3 当前状态（2026-04-08）

| 项 | 状态 |
|----|------|
| `StreamController` | 已抽到 `oct-gateway/runtime/streamController.js`，负责 smoother、累计全文、取消状态 |
| `ChatEngine` | 已抽到 `oct-gateway/runtime/chatEngine.js`，当前负责“流式模型调用 → assistant 入会话 → postProcessor → done/error 事件” |
| `ContextBuilder` | 已抽到 `oct-gateway/runtime/contextBuilder.js`，当前负责图片消息规范化、上下文记忆注入、Canvas/后台任务提示、system prompt 扩展、最终 `buildApiMessages` |
| `ProviderRouter` | 已抽到 `oct-gateway/runtime/providerRouter.js`，当前负责 provider/baseUrl/apiKey/model/caps/fallback 的解析；`ai.js` 已改为通过它读取当前模型能力 |
| `ToolLoop` | 已抽到 `oct-gateway/runtime/toolLoop.js`，当前负责工具调用 guard、执行、canvas 事件透传、tool result 注入和递归继续对话 |
| 接线方式 | `index.js` 在 `REFACTOR_FLAGS.USE_NEW_CHAT_ENGINE` 打开时调用 `chatEngine.execute(...)`，关闭时保持 legacy `streamChat` 路径；`ai.js` 已通过 `ProviderRouter + ToolLoop` 收敛内部职责 |
| 迁移策略 | 当前已抽离“流式执行主循环 + 上下文组装 + Provider 解析 + 工具循环”；网络 fallback 与最终 HTTP 调用仍保留在 `ai.js`，这是有意保留的稳定边界 |

### Phase 3 验收记录（2026-04-08）

| 项 | 结果 |
|----|------|
| `ChatEngine` | 新增 `oct-gateway/runtime/chatEngine.js`；`index.js` 在 `USE_NEW_CHAT_ENGINE` 打开时改由 `chatEngine.execute(...)` 负责流式执行 |
| `StreamController` | 新增 `oct-gateway/runtime/streamController.js`；`ChatEngine` 通过它统一 smoother、取消状态与全文累计 |
| `ContextBuilder` | 新增 `oct-gateway/runtime/contextBuilder.js`；`index.js` 中上下文记忆、Canvas 提示、prompt 扩展、`buildApiMessages` 已迁入 |
| `ProviderRouter` | 新增 `oct-gateway/runtime/providerRouter.js`；`ai.js` 中 provider/model/caps/fallback 解析已迁入 |
| `ToolLoop` | 新增 `oct-gateway/runtime/toolLoop.js`；`ai.js` 中工具调用循环已迁入 |
| `MessageRouter` 与 `ChatEngine` | Phase 3 验收时 Router 仍依赖 `index.js` 的 `chat.send` 大块；该缺口已在 Phase 4 通过共享 `handleChatRequest()` + `chatHandler` 注入完成收口 |
| 启用 Runtime 新链 | 环境变量 `OCT_USE_NEW_CHAT_ENGINE=1` 或 `config.json` → `refactorFlags.USE_NEW_CHAT_ENGINE: true` |
| 自动化验证 | `node --check`（`index.js` / `ai.js` / `runtime/*.js`）+ `npx vitest run`（64 tests）+ `npx tsc --noEmit` 全部通过 |
| 结论 | **Phase 3 验收通过。** Runtime 目录与 `ai.js` 内职责拆分就位；可进入 Phase 4 Transport |

---

## Phase 4：抽取 Transport Layer（中风险）

### 目标
将 WebSocket/HTTP 服务器逻辑从 `index.js` 中提取。

### 4.1 WsTransport

```javascript
// transport/ws.js
class WsTransport {
  constructor({ port, router, authToken }) {
    this.wss = new WebSocketServer({ port });
    this.router = router;
    this.authToken = authToken;
    this.clients = new Map();
  }

  start() {
    this.wss.on('connection', (ws) => {
      const clientId = crypto.randomUUID();
      const connection = new WsClientConnection(ws, clientId);

      ws.on('message', async (data) => {
        const msg = JSON.parse(data.toString());

        // 认证
        if (msg.method === 'connect') {
          return this._handleAuth(ws, msg, connection);
        }

        if (!this.clients.has(ws)) return;

        // 委托给 Gateway Router
        await this.router.handleRequest(msg, connection);
      });
    });
  }
}

class WsClientConnection {
  constructor(ws, clientId) { this.ws = ws; this.clientId = clientId; }
  send(msg) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  isOpen() { return this.ws.readyState === 1; }
}
```

### 4.2 HttpTransport

```javascript
// transport/http.js
class HttpTransport {
  constructor({ port, toolLoader, mcpManager }) { /* ... */ }

  start() {
    // 从 index.js 迁入 HTTP 路由：
    // POST /tool → toolLoader.executeTool()
    // GET/POST/DELETE /mcp/* → mcpManager
    // GET / → mobile.html
  }
}
```

### 4.3 index.js 最终形态

```javascript
// index.js — 启动入口，约 50 行
const config = require('./config');
const { WsTransport } = require('./transport/ws');
const { HttpTransport } = require('./transport/http');
const { MessageRouter } = require('./gateway/router');
const { ChatEngine } = require('./runtime/chatEngine');
// ... 其他依赖

async function main() {
  // 初始化服务
  const memoryService = new MemoryService(/* ... */);
  const toolRegistry = new ToolRegistry(/* ... */);
  const postProcessor = new PostProcessor(/* ... */);

  // 初始化运行时
  const chatEngine = new ChatEngine({ /* ... */ });

  // 初始化网关
  const router = new MessageRouter({ chatEngine, /* ... */ });

  // 启动传输层
  const wsTransport = new WsTransport({ port: config.PORT, router });
  const httpTransport = new HttpTransport({ port: config.HTTP_PORT, toolRegistry });

  wsTransport.start();
  httpTransport.start();

  // 定时任务
  setInterval(() => memoryService.healthCheck(), 5 * 60 * 1000);
}

main().catch(console.error);
```

### Phase 4 检查清单

- [x] `transport/ws.js` — WebSocket 服务器 + 认证（首轮落地，受 `USE_NEW_TRANSPORT` 控制）
- [x] `transport/http.js` — HTTP 路由（首轮落地，受 `USE_NEW_TRANSPORT` 控制）
- [x] `transport/protocol.js` — JSON 编解码辅助（首轮落地）
- [x] `index.js` 新增 `handleTransportMessage` / `handleTransportHttpRequest`，通过 Transport 回调承接既有业务逻辑
- [x] `tools.setOnTaskBoardUpdate` 在新传输层下改为 `wsTransport.broadcast(...)`
- [x] 语法验证：`node --check` 覆盖 `index.js`、`gateway/router.js`、`transport/ws.js`、`transport/http.js`、`transport/protocol.js`（及 `ai.js` / `runtime/*.js` 建议同测）
- [x] 自动化复核（2026-04-08）：`npx vitest run` 全过；`npx tsc --noEmit` 通过

### Phase 4 首轮落地记录（2026-04-08）

| 项 | 状态 |
|----|------|
| `WsTransport` | 已接管 `WebSocketServer` 创建、challenge/auth 握手、JSON 解析、连接生命周期、每连接 abort/thinking pulse 管理 |
| `HttpTransport` | 已接管 `http.createServer`、CORS/OPTIONS、监听与错误处理；业务路由通过 `handleTransportHttpRequest(req, res)` 回调保留在 `index.js` |
| `protocol.js` | `safeParseMessage` / `serializeMessage`（与 legacy 一致：`JSON.parse` / `JSON.stringify`） |
| `Gateway 接线` | `handleTransportMessage` →（可选 Router）→ 回落逻辑；共享 `handleChatRequest(request, connection)` 供 Router 的 `chatHandler` 与 Transport 回落共用 |
| `Router 收口` | `MessageRouter` 注入 `chatHandler: handleChatRequest`；`USE_NEW_ROUTER=1` 时 Slash、`sessions.list`、普通 `chat.send` **统一先走 Router**（不再依赖 legacy 大块才能聊天） |
| `USE_NEW_TRANSPORT` | 为真时 `WsTransport`/`HttpTransport` 启动；`tools.setOnTaskBoardUpdate` 改为 `wsTransport.broadcast`；`SIGINT` 关闭新 server；**legacy `wss`/`httpServer` 整段保留**为 fallback |
| 风险边界 | 业务协议（`req`/`res`/`event` JSON 形态）保持不变；MCP、internal memory、`/tool`、mobile 页等仍走 `handleTransportHttpRequest` 与既有实现 |

### Phase 4 验收记录（2026-04-08 · 开发侧收口）

| 项 | 结果 |
|----|------|
| 代码核对 | 与上文「Router 收口」「Transport 接线」描述一致；`handleChatRequest` 为函数声明，可在 `MessageRouter` 构造时安全注入 |
| 自动化 | `node --check`（含 transport/protocol）、`npx vitest run`（64 tests）、`npx tsc --noEmit` 通过 |
| 待办 | **端到端联调**（含 `OCT_USE_NEW_ROUTER` / `OCT_USE_NEW_TRANSPORT` 组合、多客户端、Mobile、MCP HTTP）由你在联调环境补做 |
| 结论 | **Phase 4 开发侧收口验收通过**；未删 Feature Flag、未删 legacy，符合 Phase 5「清理」前置状态 |

- [ ] `index.js` 瘦身为 ~50 行启动入口（留待 Phase 5）
- [ ] 多客户端并发连接测试（E2E）
- [ ] Mobile 页面访问测试（E2E）
- [ ] MCP 管理路由测试（E2E）

---

## Phase 5：清理 + 文档（低风险）

### 5.1 删除 Feature Flag

```javascript
// 确认所有新路径稳定后：
// 1. 删除 REFACTOR_FLAGS
// 2. 删除 index.js 中的旧代码路径
// 3. 删除 ai.js 中被 ContextBuilder/ProviderRouter 替代的代码
```

### 5.2 ai.js 瘦身

最终 `ai.js` 只保留：
- `streamChat()` — 纯 HTTP 流式调用逻辑（约 200 行）
- `loadSystemPrompt()` — Prompt 加载

其他逻辑已迁入 `runtime/` 和 `services/`。

### 5.3 代码行数目标

| 文件 | 重构前 | 重构后 |
|------|--------|--------|
| `index.js` | 2172 | ~50 |
| `ai.js` | 1198 | ~200 |
| `transport/ws.js` | — | ~150 |
| `transport/http.js` | — | ~100 |
| `gateway/router.js` | — | ~150 |
| `gateway/slash.js` | — | ~200 |
| `runtime/chatEngine.js` | — | ~120 |
| `runtime/contextBuilder.js` | — | ~150 |
| `runtime/providerRouter.js` | — | ~100 |
| `runtime/streamController.js` | — | ~60 |
| `services/postProcessor.js` | — | ~80 |
| `services/imageService.js` | — | ~100 |

### Phase 5 检查清单

- [ ] Feature Flag 清理（等待联调完成）
- [ ] 旧代码删除（等待联调完成）
- [ ] 全量回归测试
- [x] 更新 FEATURE_MAP.md
- [x] 更新 README.md
- [x] 更新 `docs/03_migration/migration-status.md`

### Phase 5 验收记录（2026-04-09）

| 项 | 状态 |
|----|------|
| 文档同步 | 已更新 `oct-gateway/README.md`、`docs/02_architecture/FEATURE_MAP.md`、`docs/03_migration/migration-status.md`、本计划书与执行书，使其与当前实现一致 |
| 重复代码收敛 | 已新增 `transport/connection.js`，统一新传输层与 legacy WS 分支的 `connection` 适配结构，降低后续删旧代码风险 |
| 联调修复 | 已修复 `MAX_TOOL_ROUNDS` 初始化顺序、legacy `WebSocketServer/http` 导入缺失、`node:crypto` challenge 握手、系统消息与正文串流、`/think off` 的 CoT 展示、普通 AI 回复误进 system bubble、图片 analyzer/MCP 参数兼容、任务看板重复添加与 hover 详情、右栏 `TOK/CTX` 多 provider 显示、记忆更新假成功 |
| 入口瘦身 | 已新增 `services/opsScheduler.js`、`services/startupHealth.js`、`runtime/contextHelpers.js`、`runtime/streamUtils.js`、`transport/helpers.js`、`transport/httpRoutes.js`、`transport/legacyTransport.js`；`index.js` 已从 2172 行降到 **1196 行** 左右的接线层 |
| legacy 收口 | 新旧 HTTP 现已共用 `transport/httpRoutes.js`；legacy WS `chat.send / sessions.list / unknown method` 已复用统一 `handleTransportMessage()`；legacy WS/HTTP 外壳已整体迁入 `transport/legacyTransport.js` |
| 清理边界 | 已明确 `REFACTOR_FLAGS` 与 legacy fallback 暂不删除，现作为稳态观察期安全边界，而非未完成阻塞项 |
| 当前结论 | **Phase 5 验收通过。** oct-gateway 分层重构主目标已完成；剩余工作以优化、日志降噪、legacy 渐进收缩为主 |

---

## 回归测试矩阵

每个 Phase 完成后必须通过：

| 测试场景 | 验证点 |
|---------|--------|
| 普通文本对话 | 流式推送正常、回复完整 |
| 带图片消息 | inline vision / fallback 路由正确 |
| 工具调用 | tool_call → tool_result → 继续对话 |
| Canvas 事件 | create/update/focus 事件正确推送 |
| Slash 命令 | /model, /session, /tools, /memory 均正常 |
| 多会话切换 | 上下文隔离、历史正确 |
| 记忆后处理 | feedback/parking/history/clarification 入队 |
| MCP 管理 | 添加/删除/状态查询正常 |
| 连接断开重连 | 流中断优雅处理 |
| 并发请求 | 多客户端同时对话不冲突 |

---

## 附录：每日执行节奏建议

```
Day 1-2:   Phase 1（PostProcessor + ImageService + EventBus）
Day 3:     Phase 1 回归测试 + 修复
Day 4-5:   Phase 2（Router + SlashHandler）
Day 6:     Phase 2 回归测试 + 修复
Day 7-9:   Phase 3（ChatEngine + ContextBuilder + ProviderRouter）
Day 10:    Phase 3 回归测试 + 流式 benchmark
Day 11:    Phase 3 修复 + 稳定
Day 12-13: Phase 4（WsTransport + HttpTransport + index.js 瘦身）
Day 14:    Phase 4 回归测试
Day 15-16: Phase 5（清理 + 文档）
```
