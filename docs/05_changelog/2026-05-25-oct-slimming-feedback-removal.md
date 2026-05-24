# 2026-05-25 OCT 瘦身：删除模型对话 feedback 策略

## 本次决策

在 OCT 瘦身过程中，原“模型对话失败 feedback 策略”已从保守保留改为**激进删除**。

删除范围：

- `oct-gateway/memory_feedback.js`
- 对话完成后的 feedback 自动检测入队
- 启动时最近 feedback 回注到 system prompt
- `/memory feedback` 观察入口
- `memory.auto_save_feedback` / `memory.load_feedback_on_boot` / `max_feedback_days` 配置项

## 删除原因

- 该链路不属于核心 `chat.send -> stream -> final chat event` 主链；
- 噪声和误判风险高，收益低；
- 会持续占用维护、测试、文档与理解成本；
- 当前瘦身目标是优先让 token 消耗换来结构性减负，而不是继续保留低收益旁支。

## 本次保留的边界

本轮**没有**删除：

- raw turn 历史保存
- parking / clarification / summarizer / vector recall
- memory governance / memory search

也就是说，删除的是 **feedback 子能力**，不是整个 memory 系统。

## 风险说明

- 历史上已写入 `core://agent/feedback/*` 的旧数据不会自动迁移或清理；
- `memory_management_agent.js` / `memory_governor.js` 中针对旧 feedback source/path 的兼容判断暂时保留，避免扩大改动面；
- 若后续要继续瘦身 memory，可再单独处理“历史 feedback 数据清理”和“兼容分支删除”。
