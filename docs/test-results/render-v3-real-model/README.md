# Render Protocol v3 Real Model Corpus

This directory contains the Phase 8 scaffold for real-model Render Protocol v3 evaluation.

The current corpus is screenshot-derived. It intentionally does not include full raw model outputs yet, because the captured evidence was visual screenshots rather than copyable response text.

## Files

| File | Purpose |
|---|---|
| `corpus.json` | Provider/case matrix, expected blocks, screenshot-derived verdicts and raw-output capture status. |
| `raw-output-capture-template.md` | Manual template for capturing raw Gemini / DeepSeek outputs in future runs. |

## Rules

- Do not invent raw model output from screenshots.
- Keep each provider/case entry stable so future tests can reference it by `id`.
- Once raw outputs are captured, add them verbatim or link to a raw log artifact.
- A screenshot that looks good is not enough for pass; expected block assertions must match.
