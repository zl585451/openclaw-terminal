# Bug Triage

> Status: CURRENT  
> Last Updated: 2026-04-14  
> Purpose: 小模型和工程师 AI 的统一排错顺序

---

## 总原则

1. 先判定问题属于哪条链路
2. 只读入口文档列出的核心文件
3. 先看当前实现文档，再看历史重构文档
4. 改动后必须回填文档

---

## 1. 聊天流式问题

### 现象
- 回复空白
- 流式状态错乱
- 界面不逐字
- `done` 太早

### 顺序
1. `00_ai_entry/chat-stream-entry.md`
2. `src/hooks/useWebSocket.ts`
3. `src/hooks/useMessages.ts`
4. `src/ui/chat/MessageList.tsx`
5. `oct-gateway/index.js`
6. `oct-gateway/ai.js`

### 先搜关键词
- `onChatDelta`
- `onChatDone`
- `runStreamPaintTick`
- `stream interrupted`
- `stream done`

---

## 2. 图片问题

### 现象
- 发图失败
- 发图后 529
- 发图后空回复

### 顺序
1. `00_ai_entry/image-flow-entry.md`
2. `electron/main.ts`
3. `oct-gateway/index.js`
4. `oct-gateway/image_analyzer.js`
5. `oct-gateway/ai.js`

### 先搜关键词
- `image request routing`
- `ImageAnalyzer`
- `HTTP 529`
- `stream interrupted`

---

## 3. 声音问题

### 现象
- 打字音效没声
- TTS 没声

### 顺序
1. `00_ai_entry/audio-entry.md`
2. 判断属于：
   - 打字音效
   - TTS
3. 只查该分支相关文件

---

## 4. Gateway 请求失败

### 现象
- 529
- overloaded
- 200 但空流
- provider 切换异常

### 顺序
1. `docs/02_architecture/01-gateway.md`
2. `oct-gateway/index.js`
3. `oct-gateway/ai.js`
4. `oct-gateway/config.js`
5. 对照 gateway 日志

### 判断规则
- `HTTP 529 / overloaded_error`：优先判断为上游服务过载
- `ECONNRESET / ETIMEDOUT / ENOTFOUND`：优先判断为本地网络或链路问题
- `200 + outputLen=0`：重点查流式接口稳定性和收尾逻辑

---

## 5. WebSocket 异常断开（如 code=1006）

### 现象
- 调研/多工具轮次中途突然断开
- 日志：`WebSocket 已断开 code=1006`

### 顺序
1. `docs/03_specs/WEBSOCKET_PROTOCOL.md`（Gateway ping、`hello-ok`）
2. `oct-gateway/tools/exec_command.js`（是否长时间阻塞事件循环）
3. `oct-gateway/transport/ws.js`（服务端 ping）
4. `electron/main.ts`（客户端 `ping`/`pong` 超时与 `suppressAutoReconnect`）

### 判断规则
- 长 `exec_command` / 同步阻塞后断连：优先查网关是否已改为异步 exec + 服务端 ping
- 子进程崩溃：看主进程是否收到 `gateway-status` / `processExit`，与单纯 WS 断连区分

---

## 6. 改动前后文档要求

改代码前：
- 必须先引用对应入口文档

改代码后：
- 更新该入口文档中的链路、职责、关键日志或注意事项
- 增加一条 changelog

