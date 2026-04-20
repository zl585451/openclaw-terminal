# 2026-04-20 · ClarifyCard 触发策略修正

- 统一 `SOUL.md`、`CLARIFICATION_PROTOCOL.md`、`USER.md`、`OCT_PROTOCOL.md` 的口径：
  - `clarify_card` 不再只隐含为“能力边界 / 越界确认”场景
  - 明确支持“边界模糊任务”“多字段约束采集”“精准提示词收集”
- 将“不能连续问超过 1 个澄清问题”改为更准确的规则：
  - 单条回复只推进 1 个澄清动作
  - 短追问最多 2 轮
  - 或使用 1 张 `clarify_card` 一次收集 2-4 个关键字段
- 在澄清协议中新增 `clarify_card` 的适用场景、结构化澄清模板、路由规则与格式约束
- 保留越界确认的 `variant=confirm` 用法，但不再让模型误解为卡片的唯一用途
