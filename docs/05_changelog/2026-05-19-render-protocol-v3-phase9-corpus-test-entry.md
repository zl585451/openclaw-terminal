# Render Protocol v3 Phase 9：Raw Output Corpus 测试入口

日期：2026-05-19

## 变更摘要

- 新增 `src/utils/renderProtocolV3Corpus.test.ts`，作为 Phase 9 的最小 raw output corpus Vitest 测试入口。
- 测试仅读取本地 `docs/test-results/render-v3-real-model/corpus.json`，不调用 Gemini、DeepSeek 或任何外部模型 API。
- 覆盖以下最小闭环检查：
  - `corpus.json` 可被解析为合法 JSON。
  - 每个 run 都能匹配到 corpus 中声明的 `caseId`。
  - `rawOutputStatus` 为 `missing` 的 run 以 `skip` 标记为 pending，不作为失败处理。
  - `expectedBlocks`、`missingBlocks`、`unexpectedBlocks` 字段为数组，且条目为非空字符串。

## 范围说明

- 未修改 Gateway normalizer。
- 未修改前端 renderer。
- 未修改 `optionBoxParser`。
- 未修改 corpus 中已有审查结论。
- 未新增真实模型 API 调用。