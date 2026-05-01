# 2026-05-01 Quote Span Attribution MVP implementation

## Changed

- Added quote span extraction for Chinese quotes, straight quotes, and full-width bracket system voice spans.
- Added speaker candidate extraction for pre-cue, post-cue, scene voice, group cue, system cue, and continuous dialogue hints.
- Added `quoteAttributionAgent` with strict `quoteId|voiceType|speaker|confidence|evidence` line protocol.
- Added deterministic `spanScriptComposer` to build `AdaptedScriptPayload` from quote spans and attributions.
- Added `SCRIPT_ADAPTER_TEXT_PIPELINE=span_attribution` switch in `textRewriterAgent`; default classify-first pipeline remains unchanged.
- Hardened Basic QC against speaker protocol residue and dialogue duplicated in narration.
- Added Vitest coverage for extractor, candidate extraction, attribution parser, composer, and new QC rules.

## Notes

- `system_voice` is mapped to compatible `dialogue` segments with `speaker = 系统音` for the current payload schema.
- This MVP prioritizes structural correctness over narration oralization; narration rewrite can be reintroduced after the first real product validation.
