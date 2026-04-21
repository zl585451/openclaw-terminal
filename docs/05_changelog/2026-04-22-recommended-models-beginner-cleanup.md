# 2026-04-22：新手推荐模型元数据收口

## 摘要

将新手模式下的 provider 列表、卡片副标题、`isBeginnerProviderId` 与「首条推荐模型」读取集中到 `src/hooks/settings/recommendedModels.ts`；`ConnectionTabView.Beginner.tsx` 改为从该模块引用；`useApiKeys.ts` 增加对前述符号的再导出以便设置相关代码统一入口。无保存/测试连接/provider 推断行为变化。

## 涉及文件

- `src/hooks/settings/recommendedModels.ts`
- `src/ui/settings/tabs/ConnectionTabView.Beginner.tsx`
- `src/hooks/settings/useApiKeys.ts`
