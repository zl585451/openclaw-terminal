# 2026-05-01 Quote Span + Attribution MVP 执行计划

## 背景

样书结构分析显示，文本改编链路的核心问题不是单条 prompt 规则不足，而是模型直接生成台本导致 speaker 污染、对白重复和归属不可验证。

## 文档

- 新增 `docs/03_specs/内容创作工作台/Quote-Span-Attribution-MVP执行计划.md`

## 内容

- 明确 “程序抽 span + Agent 判归属 + 程序合成台本” 的 MVP 架构。
- 拆分 Phase A-H：fixtures、quote span 抽取、speaker 候选、归属 Agent、deterministic composer、Hard QC、接入与样书回归。
- 定义成功标准、风险回退和暂不做范围。
