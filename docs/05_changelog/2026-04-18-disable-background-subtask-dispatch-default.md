# 2026-04-18 · 关闭后台派子任务链路（默认）

## 问题
- 用户在主会话中触发“帮我查/帮我搜”等请求时，orchestrator 会将任务异步派发到后台队列。
- 主对话只收到“已派出去，我们继续聊”类回复，容易出现“无下文/断链”体验。

## 调整
1. `oct-gateway/config.js`
- 新增配置：`ENABLE_BACKGROUND_TASK_DISPATCH`，默认 `false`。

2. `oct-gateway/orchestrator.js`
- `tryDispatchAsTask()` 增加开关门禁：仅当 `ENABLE_BACKGROUND_TASK_DISPATCH=true` 才允许派发后台任务。
- 默认路径下不再派发子任务，主会话按常规工具调用同步执行并返回结果。

3. `oct-gateway/runtime/contextBuilder.js`
- 仅在后台派发开关开启时，才注入“已派发后台任务”的系统提示。
- 仅在后台派发开关开启时，才注入“后台任务结果”上下文。

## 结果
- 默认行为改为：不派子任务、不绕圈子，用户请求直接在当前回合给出结果。
- 如需恢复旧行为，可显式设置 `ENABLE_BACKGROUND_TASK_DISPATCH=true`。
