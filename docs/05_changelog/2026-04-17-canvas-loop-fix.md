# fix: 终止 Canvas 重复调用循环并增强缺参自修复提示

> Date: 2026-04-17  
> Type: Bug Fix  
> Scope: `oct-gateway/ai.js`, `oct-gateway/tools/canvas.js`, `oct-gateway/runtime/toolLoop.js`

## 问题

复杂创作任务中出现 `canvas(action=create)` 重复调用，最终可能以 `unexpected_state` 收尾失败。

## 修复

- 调整工具重复签名计算：`buildToolSignature` 不再包含 `tool_call.id`，只比较工具名与参数内容。
- 收紧工具循环保护阈值：
  - `MAX_TOOL_ROUNDS: 10 -> 8`
  - `MAX_IDENTICAL_TOOL_SIGNATURES: 4 -> 2`
- 优化 `canvas create` 缺少 `content` 时的报错文案，明确告知缺失字段与重试方式。
- 优化 `toolLoop` 的 graceful stop 文案，改为通用任务场景提示。

## 预期效果

- 同参数重复 `canvas create` 可更早命中循环保护并优雅停止。
- 当模型漏传 `content` 时，得到更明确反馈，提升下一轮自纠成功率。
- 降低长任务在工具链收尾阶段卡住的概率。
