# 2026-04-29 批次开工页章节锁定保护

## 本次改动

1. 调整 [src/modules/script-adapter/ui/Workbench/BatchSetupPanel.tsx](/E:/windows-window/OpenClaw-Terminal/src/modules/script-adapter/ui/Workbench/BatchSetupPanel.tsx:1)，当工作台拿到了 `taskContract` 时，不再在章节校验失败后静默回退到第 1 章。
2. 新增“锁定章节不一致”拦截：如果开工页内部章节索引和任务合同不一致，会直接阻止开工并提示返回重新选章。
3. 调整 [src/modules/script-adapter/ui/Workbench/StartConfirmDialog.tsx](/E:/windows-window/OpenClaw-Terminal/src/modules/script-adapter/ui/Workbench/StartConfirmDialog.tsx:1)，在开工确认弹层里额外展示本次实际要跑的章节摘要，避免只看到“1 章 / 字数”却看不到具体是第几章。

## 解决的问题

在“新建任务 -> 开工确认”链路里，若工作台内部章节状态和任务合同发生偏差，旧逻辑可能静默落回素材库的第 1 章，最终生成错误章节的产物。

现在即使出现状态偏差，也不会默认跑第 1 章，而是直接拦住，让用户回到前一步重新确认。

## 验证

1. `npx tsc --noEmit`
