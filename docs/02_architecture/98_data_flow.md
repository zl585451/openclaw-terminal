# 数据流向总览

> 最后更新：2026-04-26

---

## 前端聊天列表滚动（补充）

当会话消息数超过窗口展示上限时，`useScrollManager` 用 `visibleCount` + `messages.slice(-visibleCount)` 做尾部窗口。用户上滚接近顶部加载更早消息时，`visibleCount` 变大会在 DOM **上方**插入行；实现上在扩大前后记录 `scrollHeight` 并在 `useLayoutEffect` 内补偿 `scrollTop`，避免视口跳变。详见 `src/hooks/useScrollManager.ts`。

---

## 完整数据流

```
用户发消息
    │
    ▼
index.js 接收
    │
    ├─→ session.addMessage()          → 内存
    ├─→ ai.js streamChat()            → getProviderConfig() → OpenAI 兼容 API
    │       │
    │       ▼
    │   流式回复返回前端
    │       │
    │       ▼ (onDone)
    │
    ├─→ saveRawTurn()                 → Memory v2 JSONL (core://logs/raw/...)
    ├─→ detectAndSaveParking()        → Memory v2 notes (core://my_user/daily/.../parking_lot)
    └─→ detectAndSaveClarification()  → Memory v2 notes (core://my_user/preferences/...)
```

---

## 启动流程

```
Gateway 启动
    │
    ├─→ loadSystemPrompt()
    │       ├─→ loadBootMemory()    → Memory v2 (核心记忆)
    │       └─→ 读取本地 MD 文件     → SOUL.md / AGENTS.md / USER.md
    │
    ├─→ warmGlossaryCache()         → Memory v2 搜索预热
    ├─→ cleanupOldHistory()         → 兼容壳（当前不执行物理清理）
    └─→ startGateway()              → Node 进程 (Electron)
```

---

## 记忆节点命名规范

| 类型 | URI 格式 | 示例 |
|------|---------|------|
| 对话历史 | `core://my_user/history/YYYY-MM-DD/HH-MM-SS` | `core://my_user/history/2026-03-20/14-30-00` |
| 自我评估 | `core://agent/self_eval/YYYY-MM-DD/HH-MM-SS` | 🔇 已停用（历史数据仍存在） |
| 模式提炼 | `core://agent/learned_patterns/YYYY-MM-DD` | 🔇 已停用（依赖自评） |
| 纠正规则 | `core://agent/corrections/YYYY-MM-DD/HH-MM-SS` | `core://agent/corrections/2026-03-20/14-30-15` |
| 停车场 | `core://my_user/daily/YYYY-MM-DD/parking_lot/HH-MM` | `core://my_user/daily/2026-03-20/parking_lot/14-30` |
| 偏好 | `core://my_user/preferences/{category}` | `core://my_user/preferences/cost_vs_efficiency` |
