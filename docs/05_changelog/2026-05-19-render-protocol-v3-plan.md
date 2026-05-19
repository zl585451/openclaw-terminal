# 2026-05-19 Render Protocol v3 执行计划

## Summary

新增 Render Protocol v3 执行计划，用于从“Markdown + 标签 + 自动检测”的混合渲染协议，升级到“结构化 Render Blocks + Gateway 校验 + 前端确定性渲染”的协议架构。

## Motivation

Google 渠道稳定性测试暴露出单点 parser 修复不足以覆盖多模型输出差异：

- TaskList 与 PillOptionBox 可能因为模型输出格式差异而互相影响。
- 同一交互意图在不同模型中会呈现为标签、符号、Markdown checkbox、加粗 checkbox 或自然语言说明。
- 继续依赖前端正则猜测，会让协议稳定性长期受模型输出风格影响。

## Added

- `docs/04_dev_guides/2026-05-19-render-protocol-v3-plan.md`
  - Phase 0：现状盘点与风险冻结
  - Phase 1：Render Blocks Schema
  - Phase 2：Gateway Render Normalizer
  - Phase 3：前端 Render Blocks 渲染层
  - Phase 4：Provider Adapter 与提示词分层
  - Phase 5：Golden Tests 与稳定性压测
  - Phase 6：Legacy 收敛

## Notes

本次只新增计划文档，不改运行时代码。
