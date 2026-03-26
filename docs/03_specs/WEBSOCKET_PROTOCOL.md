# Gateway WebSocket 消息协议

> **最后更新时间**：2026-03-24  
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
  "method": "connect | chat.send",
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
    "client": { "id": "xxx", "version": "1.0", "mode": "desktop" }
  }
}
```

- 无 ECDSA 签名，仅校验 token（若配置了 `OCT_GATEWAY_TOKEN`）

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
    "agent": { "model": "qwen3.5-plus" }
  }
}
```

### 事件推送（流式回复）

```json
{
  "type": "event",
  "event": "stream.delta | stream.done | thinking | ...",
  "payload": { ... }
}
```

| event | 说明 |
|-------|------|
| `connect.challenge` | 握手挑战（含 nonce） |
| `stream.delta` | 流式文本片段 |
| `stream.done` | 流结束 |
| `thinking` | 思考心跳（长任务时每 8 秒） |
| `tool_call` | 工具调用（若需展示） |
| `error` | 错误 |

---

## 四、消息路由（Gateway 侧）

`oct-gateway/index.js` 收到 `chat.send` 后：

1. **以 `/` 开头** → `handleSlashCommand`（/status、/new、/memory 等）
2. **否则** → `orchestrator.dispatch`（意图分析）→ `ai.js streamChat`

Slash 命令直接回复，不走 AI；普通消息走 AI 流式回复。

---

## 五、Electron 转发

- **前端** 不直连 WebSocket，通过 IPC `openclaw-send` 发消息
- **main.ts** 将消息组装成 `chat.send` 请求，通过 WebSocket 发给 Gateway
- **main.ts** 收到 Gateway 消息后，通过 `mainWindow.webContents.send('openclaw-message', msg)` 推给前端

---

## 六、相关文件

| 文件 | 角色 |
|------|------|
| `electron/main.ts` | 建立 WebSocket、组装请求、转发回复 |
| `oct-gateway/index.js` | 接收请求、路由、调用 ai.js、发送事件 |
| `oct-gateway/ai.js` | streamChat、工具调用、流式回调 |

---

*协议为 OCT 自有，无 OpenClaw ECDSA 等依赖。*
