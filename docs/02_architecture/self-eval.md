# 2.2 自我评估评分

> **最后更新**：2026-03-20 | **状态**：🔇 已停用（评分不准确，2026-03-20 起停用）

---

## 做什么
用 AI 对 AMY 的回复打 1-5 分，记录优缺点

## 文件
`oct-gateway/self_eval.js` → `evaluateReply()`

## 调用链
```
onDone → evaluateReply(userMsg, fullReply) → AI 打分 → memory.writeMemory()
```

## 写到哪
`core://agent/self_eval/YYYY-MM-DD/HH-MM-SS`

## 额外消耗
每条回复额外调一次 AI API（评估用）

## 验证方法
终端看到 `[SelfEval] 评分：X/5`

## 状态
🔇 已停用（2026-03-20）：评分不准确，改为依赖用户反馈检测。`index.js` 中调用已注释，可恢复。

---

## 更新日志
| 日期 | 内容 |
|------|------|
| 2026-03-20 | 停用：评分不准确，index.js 注释调用，SOUL.md 自动规则段落已删除 |
| 2026-03-20 | 初始拆分 |
