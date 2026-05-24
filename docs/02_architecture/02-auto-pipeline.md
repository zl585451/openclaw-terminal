# 第二层：对话后自动处理管线

> 最后更新：2026-03-20 | 这些功能全部在 `index.js` 的 `onDone` 回调里通过 `setImmediate()` 异步触发，不阻塞用户对话。

---

## 2.1 对话历史保存

| 项目 | 内容 |
|------|------|
| 做什么 | 每轮对话结束后写入本地 raw turn JSONL |
| 文件 | `oct-gateway/memory_raw_log.js` → `saveRawTurn()` |
| 调用链 | onDone → `PostProcessor.process()` → `saveRawTurn()` |
| 写到哪 | `~/.openclaw/memory/turns/YYYY-MM-DD.jsonl` |
| 前置条件 | `config.memory.auto_save_history === true` |
| 验证 | 终端看到 `[RawLog] 原始对话已写入` |
| 状态 | ✅ 正常 |

---

## 2.2 自我评估评分（已删除）

| 项目 | 内容 |
|------|------|
| 做什么 | 历史上用 AI 对 AMY 的回复打 1-5 分，记录优缺点 |
| 文件 | 已删除（2026-05-25 瘦身：移除 `oct-gateway/self_eval.js`） |
| 调用链 | 已删除；不再从 onDone 触发 |
| 写到哪 | 历史数据可能仍存在于 `core://agent/self_eval/YYYY-MM-DD/HH-MM-SS`，但不再新写入 |
| 额外消耗 | 无 |
| 验证 | 不应再出现 `[SelfEval]` 新评分日志 |
| 状态 | ❌ 已删除（2026-05-25，评分不准确且长期停用） |

---

## 2.3 模式提炼（规则学习，已删除）

| 项目 | 内容 |
|------|------|
| 做什么 | 历史上每积累约 20 条评估，用 AI 提炼改进规则，写入 SOUL.md |
| 文件 | 已删除（随 `oct-gateway/self_eval.js` 移除） |
| 调用链 | 已删除；当前不再自动蒸馏长期规则到记忆层 |
| 写到哪 | 无 |
| 验证 | 不应再出现 `[SelfEval] 触发模式提炼` 或写回 SOUL.md 的日志 |
| 状态 | ❌ 已删除（2026-05-25，依赖已删除的自评链路） |

---

## 2.4 用户反馈检测

| 项目 | 内容 |
|------|------|
| 做什么 | 检测明确反馈或纠正，按规则写入 Memory v2 |
| 文件 | 已删除 |
| 调用链 | 已删除 |
| 写到哪 | 历史数据可能仍存在，但不再新写入 |
| 启动加载 | 已删除 |
| 前置条件 | 无 |
| 验证 | 发「好的」后终端看到 `[Memory] 反馈已写入:` 或 `[Feedback]` 相关日志 |
| 状态 | ❌ 已删除（2026-05-25 瘦身：移除 `memory_feedback.js`、启动回注与 `/memory feedback` 入口） |

---

## 2.5 停车场待办检测

| 项目 | 内容 |
|------|------|
| 做什么 | 检测对话中的待办事项，自动写入停车场 |
| 文件 | `oct-gateway/index.js` → `detectAndSaveParking()` |
| 调用链 | onDone → detectAndSaveParking(userMsg, sessionKey) → AI 判断是否有待办 → memory.writeMemory() |
| 写到哪 | `core://my_user/daily/YYYY-MM-DD/parking_lot/HH-MM` |
| 验证 | 终端看到 `[Parking] 已停车:` |
| 状态 | ✅ 正常 |

---

## 2.6 自动记忆提炼

| 项目 | 内容 |
|------|------|
| 做什么 | 检测「记住/我喜欢/决定了」等信号词，用 AI 提炼值得记忆的内容 |
| 文件 | `oct-gateway/index.js` → `extractAndSaveMemory()` |
| 调用链 | onDone → extractAndSaveMemory(userMsg, fullReply) → AI 提炼 → memory.writeMemory() |
| 写到哪 | AI 自行决定 URI（如 `core://my_user/preferences/xxx`） |
| 触发词 | 记住、记一下、我喜欢、我不喜欢、以后、永远、项目、决定、完成了、发布了 |
| 验证 | 终端看到 `[Memory] 自动提炼写入:` |
| 状态 | ✅ 正常 |

---

## 2.7 追问偏好学习

| 项目 | 内容 |
|------|------|
| 做什么 | 记录用户在追问中的选择偏好 |
| 文件 | **不存在**（`clarification_memory.js` 从未创建） |
| 状态 | 🚧 未实现 |
