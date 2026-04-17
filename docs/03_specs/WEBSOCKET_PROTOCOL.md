# Gateway WebSocket 消息协议

> **最后更新时间**：2026-04-17  
> **为谁而写**：AI 协作伙伴  
> **用途**：理解前端与 Gateway 的通信格式，调试连接、消息收发问题

---

## 一、连接流程

1. **Electron main.ts** 连接 `ws://127.0.0.1:18789`
2. Gateway 发送 `connect.challenge`，payload 含 `nonce`
3. 客户端发送 `connect` 请求，携带 `params.auth.token` 或 `params.token`
4. Gateway 校验后返回 `hello-ok`，连接建立

---

## 二、请求格式（客户端 → Gateway）

```json
{
  "type": "req",
  "id": "唯一请求 ID",
  "method": "connect | chat.send | image.generate",
  "params": { ... }
}
```

### connect

```json
{
  "type": "req",
  "id": "connect-1",
  "method": "connect",
  "params": {
    "auth": { "token": "OCT_GATEWAY_TOKEN 或空" },
    "client": { "id": "xxx", "version": "1.0", "mode": "desktop" },
    "sessionKey": "main"
  }
}
```

- 无 ECDSA 签名，仅校验 token（若配置了 `OCT_GATEWAY_TOKEN`）
- `sessionKey`：**可选**，缺省为 `main`；用于 `hello-ok.pendingTasks` 按会话筛选后台任务（见下）

### chat.send

```json
{
  "type": "req",
  "id": "chat-xxx",
  "method": "chat.send",
  "params": {
    "sessionKey": "main",
    "message": "用户输入的文本",
    "attachments": [
      { "type": "image", "mimeType": "image/png", "content": "base64..." }
    ]
  }
}
```

- `message`：必填（可为空字符串，图片时可用 `[文件/图片]`）
- `attachments`：图片等，Gateway 会转成多模态 content 格式给模型

### image.generate

```json
{
  "type": "req",
  "id": "img_123",
  "method": "image.generate",
  "params": {
    "requestId": "img_123",
    "prompt": "cinematic mountain lake at sunrise",
    "negativePrompt": "blurry, watermark",
    "aspectRatio": "16:9",
    "seed": 123456,
    "promptOptimizer": true,
    "aigcWatermark": false,
    "stylePreset": "cinematic",
    "quality": "high"
  }
}
```

- 这是独立旁路能力，不进入 `chat.send` 的会话上下文
- `aspectRatio` 是跨供应商主面板里的通用画幅语义
- `width/height` 作为高级尺寸能力按需传入，不保证所有供应商都支持
- Gateway 以 `type: "res"` 回传状态和最终图片 URL
- **硅基流动**：设置中 `IMAGE_PROVIDER=siliconflow`（或 `openai` 且 `IMAGE_BASE_URL` 指向 `api.siliconflow.cn`）时，Gateway 使用硅基文档中的 `/v1/images/generations` 请求体（`image_size`、`batch_size` 等），**不是** OpenAI DALL·E 的 `size`/`response_format` 格式。
- **生图 HTTP 超时**：默认 180s，可通过环境变量 `OCT_IMAGE_HTTP_TIMEOUT_MS` 调整（旧版固定 60s 易导致慢模型报 `Request timeout`）。

---

## 三、响应格式（Gateway → 客户端）

### 连接响应

```json
{
  "type": "res",
  "id": "connect-1",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "model": "qwen3.5-plus",
    "agent": { "model": "qwen3.5-plus" },
    "capabilities": {
      "model": "qwen3.5-plus",
      "toolsSupport": "supported",
      "capabilitySource": "provider_model_def",
      "supportsTools": true,
      "supportsStreamOptions": true,
      "mcpReady": false,
      "mcpServers": 0,
      "mcpConnectedServers": 0
    },
    "pendingTasks": [
      {
        "taskId": "task-1730-abc",
        "type": "web_search",
        "status": "running",
        "startedAt": 1730000000000,
        "createdAt": 1729999990000
      }
    ]
  }
}
```

- `capabilities`：网关当前模型能力快照，供前端展示“是否支持真实工具调用”等状态。  
  - `toolsSupport`：`supported | unknown | unsupported`  
  - `capabilitySource`：能力来源（如 `provider_model_def` / `registry_exact` / `registry_prefix` / `fallback_unknown`）
- `pendingTasks`：当前 `sessionKey` 下状态为 `pending` 或 `running` 的后台任务（`oct-gateway/task_queue.js`）；无进行中任务时为 `[]`。旧客户端可忽略该字段。
- Gateway 会按约 **25s** 间隔对客户端发送 **WebSocket ping**（`ws` 帧），与流式 `agent-phase` 无关，用于长工具执行期间保持连接。

### 生图响应

```json
{
  "type": "res",
  "method": "image.generate",
  "ok": true,
  "payload": {
    "requestId": "img_123",
    "status": "done",
    "imageUrl": "https://...",
    "imageUrls": ["https://...", "https://..."],
    "numImages": 2
  }
}
```

- 进行中会回传 `status: "generating"`
- 失败时 `ok: false`，错误信息放在 `payload.error`

### 事件推送（流式回复）

```json
{
  "type": "event",
  "event": "stream.delta | stream.done | thinking | workbench | canvas | ...",
  "payload": { ... }
}
```

| event | 说明 |
|-------|------|
| `connect.challenge` | 握手挑战（含 nonce） |
| `stream.delta` | 流式文本片段 |
| `stream.done` | 流结束 |
| `thinking` | 思考心跳（长任务时每 8 秒） |
| `keepalive` | 阶段心跳（`waiting_first_token / streaming / tool_running / waiting_continuation`） |
| `tool_call` | 工具调用（若需展示） |
| `workbench` | Workbench 工作台事件（创建/更新/聚焦 artifact），当前主路径 |
| `canvas` | Canvas 兼容事件（旧字段名，仍保留兼容） |
| `error` | 错误 |

补充字段：
- `chat done` payload 可能包含 `turnId`，用于日志链路追踪（前后端同一回合 ID）。

### Workbench / Canvas 事件

当 Gateway 或工具链需要更新前端 Workbench 时，优先发送：

```json
{
  "type": "event",
  "event": "workbench",
  "action": "create | update | focus | delete | explain",
  "payload": {
    "...": "see action-specific payload"
  }
}
```

建议约定：

```json
{
  "type": "event",
  "event": "workbench",
  "action": "create",
  "payload": {
    "document": {
      "id": "canvas_123",
      "title": "登录流程",
      "artifactType": "diagram",
      "mode": "markdown",
      "content": "```mermaid\\nflowchart TD\\nA-->B\\n```",
      "language": "text",
      "origin": "ai",
      "version": 1
    }
  }
}
```

兼容说明：

- 旧链路仍可能发送 `event: "canvas"`
- 前端应同时兼容 `workbench` 与 `canvas`
- 新代码应优先写 `workbenchContext` / `workbenchEvent`

- `create`：新建 artifact，并聚焦到该文档
- `update`：按 `documentId + patch` 更新已有 artifact
- `focus`：只切换当前 active artifact
- `delete`：删除 artifact
- `explain`：补充 AI 对 artifact 的解释说明

---

## 四、消息路由（Gateway 侧）

`oct-gateway/index.js` 收到请求后：

1. `image.generate` → 独立图片生成处理器，直接访问外部图像模型接口
2. `chat.send` 且 **以 `/` 开头** → `handleSlashCommand`（/status、/new、/memory 等）
3. 其他 `chat.send` → `orchestrator.dispatch`（意图分析）→ `ai.js streamChat`

图片生成不走对话上下文；Slash 命令直接回复，不走 AI；普通消息走 AI 流式回复。

---

## 五、Electron 转发

- **前端** 不直连 WebSocket，通过 IPC `openclaw-send` 发消息
- **main.ts** 将对话消息组装成 `chat.send` 请求，通过 WebSocket 发给 Gateway
- **main.ts** 将图片请求组装成 `image.generate` 请求，通过 WebSocket 发给 Gateway
- **main.ts** 收到聊天消息后，通过 `mainWindow.webContents.send('openclaw-message', msg)` 推给前端
- **main.ts** 收到图片结果后，通过 `mainWindow.webContents.send('image-result', payload)` 推给前端

---

## 六、相关文件

| 文件 | 角色 |
|------|------|
| `electron/main.ts` | 建立 WebSocket、组装请求、转发回复 |
| `oct-gateway/index.js` | 接收请求、路由、调用 ai.js、发送事件 |
| `oct-gateway/ai.js` | streamChat、工具调用、流式回调 |

---

*协议为 OCT 自有，无 OpenClaw ECDSA 等依赖。*
