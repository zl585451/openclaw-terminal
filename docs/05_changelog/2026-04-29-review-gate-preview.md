# 2026-04-29 ReviewGate 改前改后预览

## 变更

1. 新增 `ReviewGatePreview.tsx`，在章节展开区展示质检结论、最多 3 条问题和原文 / AI 台本代表性对比。
2. 批次执行改为“非阻塞质检提示”模式：质量审校仍产出报告，但不再把批次挂起为 `awaiting_review`，也不再要求人工点击“批准继续制作”。
3. `BatchProgressView` 移除批准 / 重跑 / 跳过三按钮，改为在章节详情中直接展示质检提示卡。
4. Gateway 启动时会自动把历史遗留的 `awaiting_review` 批次迁移为 `completed`，避免旧暂停批次继续劫持工作台视图。

## 验证

1. `npx tsc --noEmit`
