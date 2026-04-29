# 2026-04-27 Script Adapter 任务创建链路重排

## 这次改了什么

本次不新增 Agent 能力,只重排用户决策顺序,让最后工作台从“继续配置”变成“开工确认书”。

## 用户体验变化

1. 第 1 步现在锁定素材和处理范围:
   - 单章试产
   - 小批量范围
   - 全书规划
2. 第 2 步不再重新决定章节范围,只展示第 1 步锁定结果;需要修改时返回第 1 步。
3. 第 3 步确认修改策略和交付内容:
   - 多人演播台本
   - 角色音表
   - 质检报告
   - CV 演播指导
   - BGM/SFX 建议
4. 工作台最后页不再出现章节选择器,只展示:
   - 任务合同摘要
   - 试产模式
   - 预算
   - 交付物摘要
   - 开工保护条款

## 代码变更

- `src/modules/script-adapter/ScriptAdapterApp.tsx`
  - 新增任务合同状态,从创建流程传入工作台
  - 第 1 步增加范围选择
  - 第 3 步增加交付项确认
- `src/modules/script-adapter/ui/ScriptAdapterLayout.tsx`
  - 透传任务合同到 Workbench
- `src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx`
  - 移除最后页章节选择器
  - 改为开工确认书和预算拍板页
- `src/modules/script-adapter/types/batch.ts`
  - 新增 `TaskCreationContract`
- `src/modules/script-adapter/styles/scriptAdapter.module.css`
  - 增加合同摘要、范围选择、交付项确认样式

## 验证

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`

结果:均通过。
