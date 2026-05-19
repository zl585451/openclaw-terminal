# Render Protocol v3 Phase 7 Real Model Evaluation

日期：2026-05-19

## Summary

新增真实模型输出审计文档，记录 Gemini 与 DeepSeek 在 4 条渲染协议稳定性口令上的表现。此阶段只做评估和后续测试规划，不修改运行时代码。

## Changes

- 新增 `docs/04_dev_guides/2026-05-19-render-protocol-v3-phase7-real-model-evaluation.md`。
- 更新 `docs/04_dev_guides/2026-05-19-render-protocol-v3-plan.md`，加入 Phase 7 状态和执行范围。
- 明确当前结论：DeepSeek 在 Markdown、表格、代码块和误触发防护上更稳；Gemini 能触发问询卡片，但更容易违反“不生成按钮”的约束。
- 建议后续建立 real model golden corpus，保存真实 Gemini / DeepSeek raw outputs 并做自动断言。

## Runtime Impact

无。此阶段不修改 Gateway、前端、parser、provider adapter 或系统提示词。

## Verification

- `git diff --check`
