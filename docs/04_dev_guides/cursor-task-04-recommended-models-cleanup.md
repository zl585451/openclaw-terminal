# Cursor Task 04

你现在在 OpenClaw Terminal 仓库里工作。

严格遵守以下规则：

- 只完成这次消息里的任务，不要顺手重构别的地方。
- 只修改任务里允许修改的文件。
- 如果发现还需要改更多文件，先停止并汇报，不要自行扩展范围。
- 不要修改 `electron/main.ts`、`src/ui/chat/ChatTab.v2.tsx`、`src/hooks/useMessages.ts`、`oct-gateway/index.js`。
- 做完当前任务后停止，不要开始下一个任务。

## 任务

把设置面板里和“推荐模型”有关的静态元数据进一步收口，做无行为变化整理。

## 目标

- 把 beginner 模式下的推荐模型配置集中管理
- 避免在多个文件里散落同一套模型推荐逻辑
- 保持现有行为不变

## 允许修改的文件

- `src/hooks/settings/recommendedModels.ts`
- `src/ui/settings/tabs/ConnectionTabView.Beginner.tsx`
- `src/hooks/settings/useApiKeys.ts`

## 禁止修改的文件

- `electron/main.ts`
- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/components/SettingsPanel.tsx`
- 任何 `oct-gateway/` 文件

## 要求

- 不要改 API key 保存流程
- 不要改测试连接逻辑
- 不要改 provider 推断逻辑
- 只整理推荐模型元数据和读取方式

## 完成标准

- 推荐模型逻辑集中到单一来源
- Beginner 页面不再内嵌重复推荐模型数据
- 构建通过

## 必须执行的验证

- `npx vitest run`
- `npm run build`

## 最终输出格式

- 改动文件
- 完成内容
- 未改动内容
- 验证结果
- 风险或后续建议

做完必须停止，不要继续下一任务。
