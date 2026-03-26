# 第七层：Electron 桌面应用

---

## 7.1 Nocturne 后端管理

| 项目 | 内容 |
|------|------|
| 做什么 | 启动/监控/重启 Nocturne Python 后端 |
| 文件 | `electron/main.ts` → `startNocturneBackend()` |
| 状态 | ⚠️ 修复过一次（2026-03-16），需持续观察 |

---

## 7.2 本地任务系统

| 项目 | 内容 |
|------|------|
| 做什么 | 本地 JSON 文件存储任务和停车场，支持从 Nocturne 迁移 |
| 文件 | `electron/main.ts` → tasks-read/tasks-write IPC |
| 写到哪 | `userData/tasks.json` |
| 状态 | ✅ 正常 |

---

## 7.3 授权验证

| 项目 | 内容 |
|------|------|
| 做什么 | License 激活码验证 |
| 文件 | `electron/main.ts` → `verifyLicenseCode()` |
| 状态 | ✅ 正常 |

---

## 7.4 会话状态持久化

| 项目 | 内容 |
|------|------|
| 做什么 | 保存/恢复会话状态到本地文件 |
| 文件 | `electron/main.ts` → `saveSessionState()`/`loadSessionState()` |
| 状态 | ✅ 正常 |

---

## 7.5 Gateway 日志面板

| 项目 | 内容 |
|------|------|
| 做什么 | 右侧面板展示 Gateway 日志，支持展开/收回、格式化、缩放、过滤 |
| 文件 | `src/components/LogPanel.tsx`、`src/styles/LogPanel.css` |
| 调用链 | main 进程 `openclaw-log-lines` IPC → ChatTab 接收 → LogPanel 展示 |
| 能力 | ① 展开 overlay 全屏查看 ② 解析 [TAG][TIME][LEVEL] 格式 + JSON 关键字段提取 ③ 模块颜色标签（Memory/Feedback/Gateway 等）④ A+/A- 字体缩放 ⑤ 过滤 pills（全部/错误/记忆/评估/Gateway）⑥ ESC 收回 |
| 验证 | 点击「↗ 展开」全屏查看、日志有色签、点 A+/A- 缩放、按 ESC 收回 |
| 状态 | ✅ 正常 |
