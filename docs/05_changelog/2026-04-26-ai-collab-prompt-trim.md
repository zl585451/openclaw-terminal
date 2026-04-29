# 2026-04-26 AI 协作提示词瘦身

## 本次改动

1. 收紧本地 `CLAUDE.md`，删除重复背景、旧协作口径和过长目录说明，只保留高频硬约束。
2. 精简 `.cursor/rules/multi-ai-workflow.mdc`，保留“收到外部方案先校验、再复述、再执行”的核心规则。
3. 精简 `.cursor/rules/architecture-rules.mdc`，保留跨系统边界、前端单向依赖、文件体量警戒线和网关模块约束。

## 目的

- 减少仓库级提示词长度，避免低价值背景占用上下文。
- 让模型更容易抓住真正重要的执行边界。
- 保留必要护栏，不把规则瘦到失去约束力。

## 未改动

- `before-coding-checklist.mdc`
- `local-doc-sync-preference.mdc`
- 运行中的 `docs/01_system_prompts/` 正文

这些文件本轮暂未收紧，避免和“仓库协作规则瘦身”混在一起。
