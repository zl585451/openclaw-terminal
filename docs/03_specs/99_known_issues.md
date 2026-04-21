# 已知问题汇总

> 最后更新：2026-04-21

当前测试基线：7 个测试文件，79 个用例（截至 2026-04-21）

---

| # | 严重度 | 问题 | 影响 | 修复状态 |
|---|--------|------|------|----------|
| 1 | 🔴 致命 | `detectAndSaveFeedback` 未在 onDone 中调用 | 反馈永远不写入 | ✅ 已修复 (2026-03-20) |
| 2 | 🔴 致命 | `clarification_memory.js` 不存在 | 追问偏好学习完全没有 | ✅ 已修复 (2026-03-26，文件已创建并接入 onDone + boot load) |
| 3 | — | 自评系统 + 模式提炼 | 评分不准确，规则质量不可控 | 🔇 已停用 (2026-03-20，index.js 注释调用，SOUL.md 自动规则已删除) |
| 4 | — | SOUL.md 自动学习规则 | 由模式提炼写入，质量不可控 | 🔇 已删除 (2026-03-20，不再写入) |
| 5 | 🟡 中等 | 所有异步调用 `.catch(() => {})` 静默吞错 | 出了问题完全看不到 | 🚧 待修复 |
| 6 | 🟡 中等 | Nocturne 偶尔掉线 | 所有记忆功能全部静默失效 | 🟡 已优化待运行验证（重试/限流已加） |
| 7 | 🟡 中等 | `cleanupOldHistory` 只打日志不真删 | 历史数据无限增长 | 🚧 待完善 |
| 8 | 🔵 低 | `hypothesis.js` 需确认是否真正接入 | 可能额外浪费 API 调用 | ✅ 已接入 (2026-03-26，index.js 已调用 `selectBestApproach`) |
| 9 | 🔵 低 | 两套提示词目录并存 | 可能写错地方 | 🚧 待统一 |
| 10 | 🔴 致命 | `truncateHistory` 截断导致孤立 tool 消息 | API 返回 400 错误，会话中断 | ⚠️ 代码与文档不一致，需运行回归验证 |
| 11 | 🟡 中等 | Windows 中文路径编码导致工具失败 | 找不到文件错误 | ✅ 已修复 (2026-03-22) |
| 12 | 🔴 致命 | 多表格（含 `|---|`）在最终渲染阶段丢失 | 聊天内容缺行/整表消失 | ✅ 已修复 (2026-03-30，`optionBoxParser`：逐行处理 + 跳过表格行 + 修复双转义) |
| 13 | 🟡 中等 | 无语言标记的 fenced code block 被当成行内代码 | “代码框消失”（无 header/Copy/背景） | ✅ 已修复 (2026-03-30，`ChatTab.v2`：`code` 组件恢复 `inline` 判断) |
| 14 | 🟡 中等 | 设置页样式体系分裂（inline style + CSS 文件并存）| 维护成本增加，主题变量难统一 | 🚧 阶段 3 处理 |
| 15 | 🟡 中等 | Electron 28 → 41、Vite 5 → 8 大版本滞后 | 安全性与生态兼容风险 | 🚧 清理完成后单独 sprint |

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

### 2026-03-30 前端 Markdown/OptionBox 渲染修复
- **问题 1**：多表格在“最终渲染”阶段丢失（常伴随 `■` 选项行）
- **原因**：`optionBoxParser` 在符号选项处理里发生“双转义”（如 `split('\\n')`、`/^\\s*\\|/`），导致按行逻辑失效；以及未正确保护表格行
- **修复**：
  - 恢复真实换行：`split('\n')` / `join('\n')`
  - 表格保护：`/^\s*\|/` 命中行直接保留
  - 继续保护 fenced code block 内文本不参与解析
- **问题 2**：无语言标记的代码块被渲染成行内代码（代码框消失）
- **原因**：仅依赖 `className`（`language-`）与 `children.includes('\n')` 判定块级，在部分情况下不可靠
- **修复**：`ChatTab.v2.tsx` 的 `code` 组件使用 `!inline && (...)` 作为块级判定前置条件

### 2026-04-21 #5 静默吞错受影响范围补充

经全仓扫描（tech-debt-scan-2026-04-21.md），实际受影响文件清单扩大：

**Gateway 侧（已在阶段 1 修复）**：
- ✅ oct-gateway/transport/ws.js:120, :128
- ✅ oct-gateway/memory_feedback.js:245, :269, :292

**前端侧（待阶段 3 修复）**：
- ❌ src/components/SettingsPanel.tsx:176, :207
- ❌ src/ui/settings/tabs/MemoryTabView.tsx:235, :254, :333

**Electron 主进程（待后续评估）**：
- ❌ electron/main.ts:2149, :2919

**低优先级（可保留）**：
- src/hooks/useContextMenu.ts:24
- src/hooks/useFileAttachment.ts:103
- src/ui/chat/MessageList.tsx:97
- src/utils/clickSound.ts:6（建议加 /* intentional */ 注释）

---

## 运行验证清单（请按顺序执行）

### A. Nocturne 稳定性（对应 #6）
- [ ] 重启 Gateway 与 Electron，连续发送 20~30 条短消息，观察是否出现 memory 相关报错或静默失效
- [ ] 人为断开 Nocturne（或关闭后端）30 秒后恢复，继续发送消息，确认功能可恢复
- [ ] 检查日志中是否出现持续重试失败且无恢复的情况（若有，记录时间点与上下文）

### B. tool 调用链完整性（对应 #10）
- [ ] 连续触发 5~10 次会产生 `tool_calls` 的请求（如执行命令、读文件、搜索）
- [ ] 观察是否出现 400 错误：`messages with role 'tool' must be a response to a preceeding message with 'tool_calls'`
- [ ] 若未出现错误，记录“通过轮次/模型/请求类型”；若出现，保存完整请求前后日志片段

### C. 静默吞错排查（对应 #5）
- [ ] 手动触发一个可预期失败路径（例如故意填错设置中的服务地址）
- [ ] 确认界面或日志可见错误信息，而不是完全无反馈
- [ ] 对仍使用 `.catch(() => {})` 的模块建立后续改造任务清单（优先 `SettingsPanel.tsx` 与 `index.js`）

---

## 结构稳定性审查（跨维度）

2026-04-17 起，对「执行语义 / 能力协商 / 状态机 / 降级 / 观测性」做了专项梳理，条目与严重级别见：

`docs/05_changelog/2026-04-17-structure-vulnerability-review.md`

（与上表 #5 静默吞错、#10 tool 链等问题存在交叉引用。）
