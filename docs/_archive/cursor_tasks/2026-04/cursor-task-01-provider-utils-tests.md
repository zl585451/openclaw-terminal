# Cursor Task 01

你现在在 OpenClaw Terminal 仓库里工作。

严格遵守以下规则：

- 只完成这次消息里的任务，不要顺手重构别的地方。
- 只修改任务里允许修改的文件。
- 如果发现还需要改更多文件，先停止并汇报，不要自行扩展范围。
- 不要修改 `electron/main.ts`、`src/ui/chat/ChatTab.v2.tsx`、`src/hooks/useMessages.ts`、`oct-gateway/index.js`。
- 做完当前任务后停止，不要开始下一个任务。

## 任务

只为 provider 相关工具函数补测试，不改业务逻辑。

## 目标

- 为已有 provider 判断逻辑补单元测试
- 覆盖常见 key 格式、baseUrl 推断、边界输入
- 不修改生产逻辑，除非测试暴露出明显拼写级 bug

## 允许修改的文件

- `src/utils/providerUtils.ts`
- 新增测试文件：`src/utils/providerUtils.test.ts`

## 禁止修改的文件

- 所有设置页面文件
- `electron/main.ts`
- 所有 `oct-gateway/` 文件

## 要求

- 先读懂现有函数行为，再写测试
- 不要为了“你认为更合理”而改变当前逻辑
- 如果发现现有行为很怪，先按现状写测试并在总结里说明

## 完成标准

- 补上覆盖主要公开函数的测试
- 测试通过
- 不引入生产逻辑的大改

## 必须执行的验证

- `npx vitest run`

## 最终输出格式

- 改动文件
- 新增测试覆盖点
- 是否改了生产代码
- 验证结果
- 当前行为备注

做完必须停止，不要继续下一任务。
