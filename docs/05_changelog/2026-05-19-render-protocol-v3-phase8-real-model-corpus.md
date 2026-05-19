# Render Protocol v3 Phase 8 Real Model Corpus

日期：2026-05-19

## Summary

新增真实模型 corpus scaffold，将 Gemini 与 DeepSeek 的 8 条截图审查结果整理成稳定的 provider/case 矩阵。此阶段只固化样本结构和审计结论，不修改运行时代码。

## Changes

- 新增 `docs/04_dev_guides/2026-05-19-render-protocol-v3-phase8-real-model-corpus.md`。
- 新增 `docs/test-results/render-v3-real-model/README.md`。
- 新增 `docs/test-results/render-v3-real-model/corpus.json`，记录 4 个 case、8 个 provider run、期望 block、观察 block、缺失 block 和失败层。
- 新增 `docs/test-results/render-v3-real-model/raw-output-capture-template.md`，用于后续补录完整 raw model output。
- 更新 `docs/04_dev_guides/2026-05-19-render-protocol-v3-plan.md`，加入 Phase 8 状态和执行范围。

## Runtime Impact

无。此阶段不修改 Gateway、前端、parser、provider adapter 或系统提示词。

## Verification

- `ConvertFrom-Json` validates `corpus.json`
- `git diff --check`
