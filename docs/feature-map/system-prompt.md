# 1.3 System Prompt 加载

> **最后更新**：2026-03-20 | **状态**：✅ 正常

---

## 做什么
启动时从 Nocturne 加载记忆 + 本地 MD 文件拼接成 system prompt

## 文件
`oct-gateway/ai.js` → `loadSystemPrompt()`

## 调用链
```
Gateway 启动 → loadSystemPrompt(PROMPTS_DIR) → 尝试 Nocturne loadBootMemory 
→ 失败则读本地 SOUL.md/AGENTS.md/USER.md/MEMORY.md
```

## 写到哪
同步写回 `MEMORY.md`（让文件和 Nocturne 保持一致）

## 验证方法
终端看到 `[AI] System prompt 加载完成，长度：XXXX`

## 状态
✅ 正常

---

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-03-20 | 初始拆分 |
