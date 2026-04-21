# 2026-04-21 MiniMax system role 兼容修复

## 背景

切换到 MiniMax 独立供应商后，聊天请求返回 400：

```text
invalid params, chatcontent has invalid message role: system
```

## 原因

Gateway 的通用上下文组装会把系统提示词作为 `role=system` 发送；澄清询问器规则也会追加一条 `system` 消息。MiniMax 独立 OpenAI 兼容接口不接受该角色，因此直接拒绝请求。

## 修复

- `oct-gateway/ai.js` 新增 MiniMax 专用消息规范化。
- 仅当 `provider.id === 'minimax'` 时，把所有 `system` 内容合并进第一条 `user` 消息前缀。
- 若第一条 user 内容是多模态数组，则插入 `{ type: 'text', text: ... }` 前缀。
- 其它 provider 的消息结构不变。

## 验证

- `node --check oct-gateway/ai.js`

