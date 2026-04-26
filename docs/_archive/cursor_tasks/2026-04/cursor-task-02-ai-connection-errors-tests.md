# Cursor Task 02

你现在在 OpenClaw Terminal 仓库里工作。

严格遵守以下规则：

- 只完成这次消息里的任务，不要顺手重构别的地方。
- 只修改任务里允许修改的文件。
- 如果发现还需要改更多文件，先停止并汇报，不要自行扩展范围。
- 不要修改 `electron/main.ts`、`src/ui/chat/ChatTab.v2.tsx`、`src/hooks/useMessages.ts`、`oct-gateway/index.js`。
- 做完当前任务后停止，不要开始下一个任务。

## 任务

为 AI 连接错误的人类可读提示逻辑补测试，不改产品行为。

## 目标

- 给错误映射工具补测试
- 覆盖不同 provider、常见错误文案、兜底分支
- 保持生产行为不变

## 允许修改的文件

- `src/utils/aiConnectionErrors.ts`
- 新增测试文件：`src/utils/aiConnectionErrors.test.ts`

## 禁止修改的文件

- 所有设置页 UI 文件
- `electron/main.ts`
- 所有 `oct-gateway/` 文件

## 要求

- 不要改提示文案，除非有明显错字或代码错误
- 先补测试
- 如果确实必须改生产代码，只允许做最小修复

## 完成标准

- 关键错误映射有测试覆盖
- `vitest` 通过

## 必须执行的验证

- `npx vitest run`

## 最终输出格式

- 改动文件
- 测试覆盖点
- 是否改了生产逻辑
- 验证结果
- 风险说明

做完必须停止，不要继续下一任务。
