# 第二层：对话后自动处理管线

> 最后更新：2026-03-20 | 这些功能全部在 `index.js` 的 `onDone` 回调里通过 `setImmediate()` 异步触发，不阻塞用户对话。

---

## 2.1 对话历史保存

| 项目 | 内容 |
|------|------|
| 做什么 | 每轮对话压缩后写入 Nocturne |
| 文件 | `oct-gateway/memory_history.js` → `saveHistorySummary()` |
| 调用链 | onDone → saveHistorySummary(userMsg, fullReply) → memory.createMemory() |
| 写到哪 | `core://my_user/history/YYYY-MM-DD/HH-MM-SS` |
| 前置条件 | `config.memory.auto_save_history === true` + Nocturne 在线 |
| 验证 | 终端看到 `[Memory] 对话摘要已写入:` |
| 状态 | ✅ 正常（有日志） |

---

## 2.2 自我评估评分

| 项目 | 内容 |
|------|------|
| 做什么 | 用 AI 对 AMY 的回复打 1-5 分，记录优缺点 |
| 文件 | `oct-gateway/self_eval.js` → `evaluateReply()` |
| 调用链 | onDone → evaluateReply(userMsg, fullReply) → AI 打分 → memory.writeMemory() |
| 写到哪 | `core://agent/self_eval/YYYY-MM-DD/HH-MM-SS` |
| 额外消耗 | 每条回复额外调一次 AI API（评估用） |
| 验证 | 终端看到 `[SelfEval] 评分：X/5` |
| 状态 | 🔇 已停用（2026-03-20，评分不准确） |

---

## 2.3 模式提炼（规则学习）

| 项目 | 内容 |
|------|------|
| 做什么 | 每积累约 20 条评估，用 AI 提炼改进规则，写入 SOUL.md |
| 文件 | `oct-gateway/self_eval.js` → `maybeDistill()` + `distillPatterns()` + `updateLearnedRulesInSoul()` |
| 调用链 | evaluateReply 完成后 → maybeDistill() 检查计数 → distillPatterns() AI 提炼 → writeMemory() 存 Nocturne + SOUL.md 写入 `## 🤖 自动学习规则` 段落 |
| 写到哪 | Nocturne `core://agent/learned_patterns/YYYY-MM-DD` + 本地 `SOUL.md` |
| 验证 | 终端看到 `[SelfEval] 触发模式提炼` 和 `[SelfEval] SOUL.md 已更新学习规则` |
| 状态 | 🔇 已停用（2026-03-20，依赖自评） |

---

## 2.4 用户反馈检测

| 项目 | 内容 |
|------|------|
| 做什么 | 检测「好/不对/应该是/记住」等反馈词，自动记录到 Nocturne |
| 文件 | `oct-gateway/memory_feedback.js` → `detectAndSaveFeedback()` |
| 调用链 | onDone → detectAndSaveFeedback(userMsg, fullReply) → detectFeedbackType() → memory.createMemory() |
| 写到哪 | `core://agent/feedback/positive/...`、`core://agent/feedback/negative/...`、`core://agent/corrections/...` |
| 启动加载 | `loadFeedbackForBoot()` 在 system prompt 生成时注入最近反馈 |
| 前置条件 | `config.memory.auto_save_feedback === true` + Nocturne 在线 |
| 验证 | 发「好的」后终端看到 `[Memory] 反馈已写入:` 或 `[Feedback]` 相关日志 |
| 状态 | ✅ 正常（2026-03-20 修复：已在 onDone 调用） |

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
