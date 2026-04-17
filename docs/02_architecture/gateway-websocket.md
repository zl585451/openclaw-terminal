# 1.1 Gateway WebSocket 服务器

> **最后更新**：2026-04-17 | **状态**：✅ 正常

---

## 做什么
接收前端消息，转发给 AI，返回流式回复

## 文件
`oct-gateway/index.js`

## 调用链
```
前端 WebSocket → index.js 收到消息 → orchestrator.dispatch → ai.js streamChat → 流式返回前端
```

## 2026-04-17 新增约束

1. `hello-ok` 增加 `capabilities` 字段（`supportsTools` / `supportsStreamOptions` / `mcpReady`）。
2. `chat.send` 期间新增 `keepalive` 事件，阶段值为：
`waiting_first_token -> streaming -> tool_running -> waiting_continuation`。
3. 前端收到能力后可显式提示“当前模型不支持工具执行”，避免工具能力误判。

## 写到哪
- 消息转发给 AI 引擎
- 流式回复返回前端

## 验证方法
打开 OCT 界面，发消息能收到回复

## 状态
✅ 正常

---

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-03-24 | Orchestrator 接入、OCT token 握手 |
| 2026-03-20 | 初始拆分 |
