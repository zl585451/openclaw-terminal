# 2026-05-01 Inner Voice / OS MVP implementation

## Changed

- Added `innerVoiceSpanExtractor` for rule-first extraction of unquoted protagonist OS from narration gaps.
- Integrated OS extraction into the `span_attribution` text pipeline as `inner_voice_extract`.
- Extended `spanScriptComposer` to split narration gaps and insert `inner_monologue` segments without duplicating text in narration.
- Added Basic QC detection for third-person action text misclassified as `inner_monologue`.
- Added Vitest coverage for OS extraction and composer insertion.

## Notes

- This MVP intentionally avoids a second LLM call for OS attribution. Strong OS candidates are assigned to the inferred viewpoint speaker.
- The payload remains compatible: OS is represented as `type = inner_monologue`; downstream display can render it as `[角色][OS]`.
