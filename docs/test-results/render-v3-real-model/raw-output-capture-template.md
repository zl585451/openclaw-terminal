# Raw Output Capture Template

Use this template when copying real model outputs into the corpus.

## Metadata

| Field | Value |
|---|---|
| Provider |  |
| Model |  |
| Case ID |  |
| Timestamp |  |
| Prompt source | `docs/test-results/stability_test_prompts.md` |
| Capture method | Raw log / copied message / WebSocket trace |

## Raw Model Output

```text
Paste the exact model output here.
Do not rewrite, summarize or normalize it.
```

## Gateway Normalized Output

```json
{}
```

## Frontend Observed Blocks

| Block Type | Present | Notes |
|---|---|---|
| markdown |  |  |
| code |  |  |
| table |  |  |
| tasklist |  |  |
| pills |  |  |
| question |  |  |
| clarify_card |  |  |

## Verdict

| Field | Value |
|---|---|
| Verdict | pass / partial / fail |
| Failure layer | model_output / gateway_normalizer / frontend_renderer / none_observed |
| Notes |  |
