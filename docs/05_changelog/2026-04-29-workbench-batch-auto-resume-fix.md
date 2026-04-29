# 2026-04-29 Workbench 批次自动恢复修复

## 本次改动

1. 调整 [src/modules/script-adapter/ui/Workbench/useWorkbenchBatchState.ts](/E:/windows-window/OpenClaw-Terminal/src/modules/script-adapter/ui/Workbench/useWorkbenchBatchState.ts:1)，为批次状态 hook 增加 `autoResumeActiveBatch` 开关。
2. 调整 [src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx](/E:/windows-window/OpenClaw-Terminal/src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx:1)，当用户是从“新建任务”带着 `taskContract` 进入工作台时，不再自动接回历史中的 `running/paused` 批次。

## 解决的问题

此前工作台初始化时会默认选中最近一个 `running` 或 `paused` 批次。  
如果用户刚在新建任务里选择了别的章节，但本地数据库里还残留一个旧的暂停批次，页面就会优先展示旧批次内容，造成“明明选了第 6 章，却看到第 1 章复核页”的错觉。

现在的行为是：

1. 从“新建任务”进入工作台：优先展示这次刚锁定的任务合同，等待用户手动开工。
2. 直接进入工作台或查看历史任务：仍然保留自动恢复旧批次的能力。

## 验证建议

1. 先保留一个旧的 `paused` 批次。
2. 重新新建一个任务，选择非第 1 章。
3. 进入第 4 步开工页时，应先看到新的任务合同，而不是直接落到旧批次的第 1 章复核页。
