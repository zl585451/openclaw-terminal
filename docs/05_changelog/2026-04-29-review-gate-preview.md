# 2026-04-29 ReviewGate 改前改后预览

## 变更

1. 新增 `ReviewGatePreview.tsx`，在 `awaiting_review` 时展示质检结论、最多 3 条问题和原文/AI 台本代表性对比。
2. `BatchProgressView` 将原来的双按钮区升级为三选动作：批准继续、重跑此章、跳过标记待处理。
3. 工作台样式新增 ReviewGate 预览区视觉结构，支持原文加载中与 Library 离线降级提示。

## 验证

1. `npx tsc --noEmit`
