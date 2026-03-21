# 第四层：记忆搜索与启动加载

---

## 4.1 记忆搜索

| 项目 | 内容 |
|------|------|
| 做什么 | 基于 Nocturne glossary 索引做关键词模糊匹配 |
| 文件 | `oct-gateway/memory_search.js` |
| 调用链 | `/memory search 关键词` → searchByKeyword() → glossary 缓存匹配 → 读取匹配节点内容 |
| 缓存 | 启动时预热（warmGlossaryCache），TTL 5 分钟 |
| 验证 | `/memory search 测试` 返回结果 |
| 状态 | ✅ 正常 |

---

## 4.2 启动反馈加载

| 项目 | 内容 |
|------|------|
| 做什么 | 启动时读取最近反馈，注入 system prompt |
| 文件 | `oct-gateway/memory_feedback.js` → `loadFeedbackForBoot()` |
| 调用链 | ai.js loadSystemPrompt() → loadFeedbackForBoot() → 读 Nocturne 反馈节点 → 拼成文本注入 prompt |
| 前置条件 | `config.memory.load_feedback_on_boot === true` + Nocturne 在线 |
| 验证 | `/memory feedback` 看是否有记录 |
| 状态 | ⚠️ 依赖 2.4 写入，2.4 失效则此处永远为空 |

---

## 4.3 历史清理

| 项目 | 内容 |
|------|------|
| 做什么 | 启动时清理超过 N 天的历史记录 |
| 文件 | `oct-gateway/memory_history.js` → `cleanupOldHistory()` |
| 调用链 | Gateway 启动 → cleanupOldHistory() → 列出过期日期节点 → 打日志（实际删除需 Nocturne delete 接口） |
| 已知限制 | Nocturne 目前可能没有 delete 接口，只打日志不真删 |
| 状态 | ⚠️ 半实现（只打日志） |
