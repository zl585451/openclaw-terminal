# 2026-04-27 Script Adapter Week 7 合并方案落地

## 这次做了什么

本次 Week 7 没有直接选用两份方案中的任意一份，而是按现有代码基线做了合并落地:

- 以后端批次执行骨架为主
- 以前端预算闸门和范围选择为前置控制
- 保留 Week 6 的单章测试入口和单章交付预览

## 代码变更

### Gateway / Electron

- 新增 `oct-gateway/script_adapter/persistence.js`
  - SQLite 持久化 `batch_jobs`、`chapter_runs`
- 新增 `oct-gateway/script_adapter/batchOrchestrator.js`
  - 串行批次调度
  - 单章失败隔离
  - 轻量角色音跨章累积
  - 重启恢复时 running → paused
- 更新 `oct-gateway/index.js`
  - 新增 `scriptAdapter.batch.*` 路由
- 更新 `electron/main.ts`
  - 新增批次 IPC 桥
- 更新 `electron/preload.ts`
  - 暴露 `scriptAdapterBatch.*`

### Frontend

- 新增 `src/modules/script-adapter/types/batch.ts`
- 新增 `src/modules/script-adapter/services/batchBudget.ts`
- 新增 `src/modules/script-adapter/services/gatewayBatch.ts`
- 新增 `src/modules/script-adapter/ui/Workbench/ChapterRangeSelector.tsx`
- 新增 `src/modules/script-adapter/ui/Workbench/BatchProgressView.tsx`
- 更新 `src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`
  - 批次入口
  - 预算闸门
  - 批次进度
  - 批次历史
- 更新 `src/modules/script-adapter/services/exportClient.ts`
  - 新增整批 Markdown 导出
- 更新 `src/modules/script-adapter/styles/scriptAdapter.module.css`

## 合并方案的处理方式

### 从“批量章节 / 全书级任务承接方案”采用

- `BatchJob -> ChapterRun` 二层模型
- SQLite 持久化
- 批次串行执行
- 失败隔离
- 批次历史
- 批次级 Markdown 合并导出

### 从“批量生产与预算闸门”采用

- 范围选择
- 预算估算
- 启动前确认
- `BGM / SFX / CV` 独立高成本开关

### 主动没有采用的部分

- 四档完整交付模式
- 费用上限自动暂停
- JSON store 过渡层
- pause / resume 真正恢复执行
- 完整 BookBible 一致性层

## 验证

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npx vitest run`
- `node -e "require('./oct-gateway/script_adapter/persistence'); require('./oct-gateway/script_adapter/batchOrchestrator')"`

结果:

- 前端类型检查通过
- Electron 类型检查通过
- Vitest `9` 个文件、`109` 个测试全部通过
- 新增 Gateway 批次模块可正常加载

## 留到下一步

1. `pause / resume`
2. 费用上限自动暂停
3. 独立失败章节清单导出
4. 完整交付模式裁剪
5. 角色别名归并与更完整的跨章一致性
6. `.docx / .epub` 整书导出
