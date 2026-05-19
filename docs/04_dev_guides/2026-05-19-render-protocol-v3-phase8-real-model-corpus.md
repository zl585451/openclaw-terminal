# Render Protocol v3 Phase 8 Real Model Corpus

日期：2026-05-19

分支：`codex/render-protocol-v3-structured-blocks`

## Summary

Phase 8 将 Gemini 与 DeepSeek 的真实模型测试结果整理成 corpus scaffold。当前可用证据来自截图和 Phase 7 审查结论，尚未保存完整 raw model output，因此本阶段不伪造模型原文，只固定：

- 测试口令来源。
- provider / model 组合。
- 期望组件断言。
- 截图观察到的实际表现。
- 失败归因。
- 后续补录 raw output 的位置。

该 corpus 后续可升级为自动化 golden test 输入。

## Corpus Layout

```text
docs/test-results/render-v3-real-model/
  README.md
  corpus.json
  raw-output-capture-template.md
```

## Evidence Boundary

| Evidence Type | Status | Notes |
|---|---|---|
| Test prompts | Available | Source: `docs/test-results/stability_test_prompts.md` |
| Gemini screenshots | Available | Used for Phase 7 manual review |
| DeepSeek screenshots | Available | Used for Phase 7 manual review |
| Raw Gemini outputs | Missing | Must be captured in a future live run or copied from raw logs |
| Raw DeepSeek outputs | Missing | Must be captured in a future live run or copied from raw logs |
| Automated corpus assertions | Not yet wired | Should be added only after raw outputs are available |

## Expected Blocks

| Case | Expected Blocks |
|---|---|
| Case 1 | `markdown`, `code`, `table`, `pills` |
| Case 2 | `markdown` only; no interactive components |
| Case 3 | `markdown`, `clarify_card`; all requested dimensions must be present |
| Case 4 | `markdown`, `tasklist`, `pills` |

## Current Model Findings

| Provider | Case | Verdict | Primary Failure |
|---|---|---|---|
| Gemini | Case 1 | Partial | Final pills not reliably rendered |
| Gemini | Case 2 | Fail | Generated CTA pills despite negative instruction |
| Gemini | Case 3 | Partial | Inquiry appeared, but visible progress suggested missing dimension |
| Gemini | Case 4 | Partial | TaskList appeared, pills did not reliably appear |
| DeepSeek | Case 1 | Pass | No primary failure observed from screenshot |
| DeepSeek | Case 2 | Pass | No primary failure observed from screenshot |
| DeepSeek | Case 3 | Partial | Inquiry appeared, but visible progress suggested missing dimension |
| DeepSeek | Case 4 | Partial | Good document output, but exact `tasklist + pills` protocol compliance was weak |

## Next Automation Step

After raw outputs are captured, add a test that executes this pipeline:

1. Load each `rawOutput`.
2. Run Gateway `renderBlocksNormalizer`.
3. Run frontend `renderBlocksAdapter` or legacy parser fallback.
4. Compare actual block types with `expectedBlocks`.
5. Report failure layer:
   - `model_output`
   - `gateway_normalizer`
   - `frontend_renderer`

## Non-Goals

- Do not modify runtime code in this phase.
- Do not infer missing raw outputs from screenshots.
- Do not mark partial visual success as protocol pass.
- Do not remove legacy protocol support.

## Acceptance Criteria

- Corpus directory exists under `docs/test-results/render-v3-real-model/`.
- `corpus.json` records all 8 provider/case observations.
- Missing raw outputs are explicitly marked as missing.
- The v3 plan points to this corpus scaffold as Phase 8 evidence.
