# 2.1 对话历史保存

> **最后更新**：2026-03-20 | **状态**：✅ 正常

---

## 做什么
每轮对话压缩后写入 Nocturne

## 文件
`oct-gateway/memory_history.js` → `saveHistorySummary()`

## 调用链
```
onDone → saveHistorySummary(userMsg, fullReply) → memory.createMemory()
```

## 写到哪
`core://my_user/history/YYYY-MM-DD/HH-MM-SS`

## 前置条件
- `config.memory.auto_save_history === true`
- Nocturne 在线

## 验证方法
终端看到 `[Memory] 对话摘要已写入:`

## 状态
✅ 正常（有日志）

---

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-03-20 | 初始拆分 |
