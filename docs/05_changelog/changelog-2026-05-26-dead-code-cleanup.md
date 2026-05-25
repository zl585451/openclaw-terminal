## 2026-05-26 死代码清理

### 清理

- `src/styles/dialog.css` — 零导入，已删除（git 和磁盘上均已不存在）
- `renovate.json` — 可选，已删除（git 和磁盘上均已不存在）

### 归档

- `DEAD_CODE_REPORT.md` 移入 `docs/archive/`，替换为当前真实状态报告

### 治理规范

- 死代码信息只存在两个地方：`DEAD_CODE_REPORT.md`（当前状态）和任务看板（待执行项）
- 不写入记忆系统、不写在对话记录中
- 文件删除后立即更新 `DEAD_CODE_REPORT.md` 状态
- 超过 30 天的死代码报告需重新验证后再执行
