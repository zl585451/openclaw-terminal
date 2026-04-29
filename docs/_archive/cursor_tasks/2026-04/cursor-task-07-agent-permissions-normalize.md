# Cursor Task 07

你现在在 OpenClaw Terminal 仓库里工作。

严格遵守以下规则：

- 只完成这次消息里的任务，不要顺手重构别的地方。
- 只修改任务里允许修改的文件。
- 如果发现还需要改更多文件，先停止并汇报，不要自行扩展范围。
- 不要修改 `src/ui/chat/ChatTab.v2.tsx`、`src/hooks/useMessages.ts`、`oct-gateway/index.js`。
- 做完当前任务后停止，不要开始下一个任务。

## 任务

统一 agent permissions 的 normalize 逻辑，只做纯函数去重，不改权限策略行为。

## 目标

- 找出重复的 `normalizeAgentPermissions`
- 抽成共享实现或单一主实现
- 保持权限行为不变

## 允许修改的文件

- `electron/main.ts`
- `oct-gateway/config.js`
- `oct-gateway/security/agent_permissions_policy.js`

## 禁止修改的文件

- 所有设置页文件
- `oct-gateway/index.js`
- `src/ui/chat/ChatTab.v2.tsx`
- `src/hooks/useMessages.ts`

## 要求

- 只去重 normalize 逻辑
- 不改权限默认值
- 不改权限判断流程
- 不改 UI 提示文案
- 如果需要改超过 3 个调用点以外的更多业务逻辑，停止并汇报

## 完成标准

- normalize 逻辑不再重复维护
- 权限行为保持不变
- 构建通过

## 必须执行的验证

- `npx vitest run`
- `npm run build`

## 最终输出格式

- 改动文件
- 去重前重复点
- 去重后结构
- 明确没改哪些权限行为
- 验证结果
- 风险说明

做完必须停止，不要继续下一任务。
