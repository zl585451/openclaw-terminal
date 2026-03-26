# 已知问题汇总

> 最后更新：2026-03-22

---

| # | 严重度 | 问题 | 影响 | 修复状态 |
|---|--------|------|------|----------|
| 1 | 🔴 致命 | `detectAndSaveFeedback` 未在 onDone 中调用 | 反馈永远不写入 | ✅ 已修复 (2026-03-20) |
| 2 | 🔴 致命 | `clarification_memory.js` 不存在 | 追问偏好学习完全没有 | 🚧 待实现 |
| 3 | — | 自评系统 + 模式提炼 | 评分不准确，规则质量不可控 | 🔇 已停用 (2026-03-20，index.js 注释调用，SOUL.md 自动规则已删除) |
| 4 | — | SOUL.md 自动学习规则 | 由模式提炼写入，质量不可控 | 🔇 已删除 (2026-03-20，不再写入) |
| 5 | 🟡 中等 | 所有异步调用 `.catch(() => {})` 静默吞错 | 出了问题完全看不到 | 🚧 待修复 |
| 6 | 🟡 中等 | Nocturne 偶尔掉线 | 所有记忆功能全部静默失效 | ✅ 已修复待观察 |
| 7 | 🟡 中等 | `cleanupOldHistory` 只打日志不真删 | 历史数据无限增长 | 🚧 待完善 |
| 8 | 🔵 低 | `hypothesis.js` 需确认是否真正接入 | 可能额外浪费 API 调用 | 🚧 待确认 |
| 9 | 🔵 低 | 两套提示词目录并存 | 可能写错地方 | 🚧 待统一 |
| 10 | 🔴 致命 | `truncateHistory` 截断导致孤立 tool 消息 | API 返回 400 错误，会话中断 | ✅ 已修复 (2026-03-22) |
| 11 | 🟡 中等 | Windows 中文路径编码导致工具失败 | 找不到文件错误 | ✅ 已修复 (2026-03-22) |

---

## 修复记录

### 2026-03-22 Gateway 稳定性修复
- **问题 1**：复杂调研时 API 返回 400 错误 "messages with role 'tool' must be a response to a preceeding message with 'tool_calls'"
- **原因**：`truncateHistory` 函数简单截断消息列表，可能在 `assistant.tool_calls` 和对应的 `tool` 消息之间截断，导致孤立的 `tool` 消息
- **修复**：
  - 重写 `truncateHistory`：智能查找安全截断点（以 `user` 消息为边界）
  - 新增 `validateAndFixMessages`：防御性地移除孤立的 `tool` 消息
- **问题 2**：Windows 上包含中文的文件路径导致工具执行失败
- **原因**：PowerShell 默认使用 GBK 编码，无法正确处理 UTF-8 中文路径
- **修复**：`exec_command` 在 Windows 上先执行 `chcp 65001` 切换到 UTF-8 编码

### 2026-03-20 BUG3 修复
- **问题**：反馈检测未在 onDone 中调用
- **修复**：在 `index.js` 的 `onDone` 回调中添加 `detectAndSaveFeedback` 调用
- **验证**：发送「好的」后终端看到 `[Memory] 反馈已写入:`

### 2026-03-20 停用自评系统
- **问题**：自评评分不准确，模式提炼写入的规则质量不可控
- **修复**：`index.js` 注释 `selfEval.evaluateReply` 和 `maybeDistill` 调用；`SOUL.md` 删除「## 🤖 自动学习规则」段落
- **替代**：用户反馈检测 (`detectAndSaveFeedback`) 作为核心学习信号