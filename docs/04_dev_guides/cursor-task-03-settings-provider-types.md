# Cursor Task 03

你现在在 OpenClaw Terminal 仓库里工作。

严格遵守以下规则：

- 只完成这次消息里的任务，不要顺手重构别的地方。
- 只修改任务里允许修改的文件。
- 如果发现还需要改更多文件，先停止并汇报，不要自行扩展范围。
- 不要修改 `electron/main.ts`、`src/ui/chat/ChatTab.v2.tsx`、`src/hooks/useMessages.ts`、`oct-gateway/index.js`。
- 做完当前任务后停止，不要开始下一个任务。

## 任务

统一设置面板里的 provider 类型定义，先做小范围无行为变化重构。

## 目标

- 统一 `ProviderEntry` 和相关 provider 类型来源
- 减少设置页内部重复类型定义
- 保持行为不变

## 允许修改的文件

- `src/hooks/settings/useApiKeys.ts`
- `src/ui/settings/tabs/ConnectionTabView.tsx`
- `src/ui/settings/tabs/ConnectionTabView.Beginner.tsx`

如果确实需要新增一个类型文件，允许新增：

- `src/ui/settings/providerTypes.ts`

## 禁止修改的文件

- `electron/main.ts`
- `electron/preload.ts`
- `src/components/SettingsPanel.tsx`
- 任何 `oct-gateway/` 下的文件

## 要求

- 不要改保存逻辑
- 不要改 provider 选择逻辑
- 不要改 UI 文案
- 只做类型和导入收口
- 如果发现需要改更多业务逻辑，停止并汇报

## 完成标准

- 设置页相关 provider 类型不再重复定义
- 项目能通过类型检查和构建

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
