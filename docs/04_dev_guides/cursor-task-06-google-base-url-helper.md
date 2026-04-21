# Cursor Task 06

你现在在 OpenClaw Terminal 仓库里工作。

严格遵守以下规则：

- 只完成这次消息里的任务，不要顺手重构别的地方。
- 只修改任务里允许修改的文件。
- 如果发现还需要改更多文件，先停止并汇报，不要自行扩展范围。
- 不要修改 `src/ui/chat/ChatTab.v2.tsx`、`src/hooks/useMessages.ts`、`oct-gateway/index.js`。
- 做完当前任务后停止，不要开始下一个任务。

## 任务

统一 Google OpenAI 兼容 base URL 清洗逻辑，但只处理纯函数层，不改大调用链。

## 目标

- 找出仓库里重复的 Google base URL 清洗逻辑
- 抽成共享 helper
- 保持行为不变

## 允许修改的文件

- `oct-gateway/config.js`
- `electron/main.ts`

如果需要新增共享文件，允许新增其中一种：

- `electron/shared/googleBaseUrl.ts`
- `oct-gateway/shared/googleBaseUrl.js`

你只能选择一种最小方案，不要建立复杂新目录结构。

## 禁止修改的文件

- 所有设置页文件
- `oct-gateway/index.js`
- `oct-gateway/ai.js`

## 要求

- 只处理 URL 清洗纯函数
- 不要顺手重构别的 helper
- 不要修改调用时机
- 如果发现 CommonJS / TypeScript 共享方式不顺，停止并汇报，不要硬做大改

## 完成标准

- 重复 URL 清洗逻辑统一到一个 helper 或一个主实现
- 现有调用行为不变
- 构建通过

## 必须执行的验证

- `npx vitest run`
- `npm run build`

## 最终输出格式

- 改动文件
- 重复点来自哪里
- 最终怎么统一的
- 验证结果
- 剩余技术债

做完必须停止，不要继续下一任务。
