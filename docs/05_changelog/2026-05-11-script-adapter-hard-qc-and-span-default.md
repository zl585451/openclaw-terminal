# 2026-05-11 script adapter hard QC and span default

## Summary

- Changed the audiobook text pipeline default to `span_attribution`; `classify_first` is now an explicit fallback.
- Made `quality_review` `reject` a hard failure before delivery packaging.
- Added a packager-side guard so rejected QC reports cannot be exported as final packages through alternate paths.
- Removed deterministic gender guessing from fallback voice hints; uncertain roles now stay neutral and require human review.

## Files

- `oct-gateway/script_adapter/agents/textRewriterAgent.js`
- `oct-gateway/script_adapter/agentRunner.js`
- `oct-gateway/script_adapter/agents/deliveryPackagerAgent.js`
- `oct-gateway/script_adapter/agents/voiceClassifierAgent.js`
- `oct-gateway/config.js`
- `oct-gateway/config.json`
- `docs/00_ai_entry/content-creation-entry.md`
- `docs/02_architecture/内容创作Agent分层与确认闸门.md`
- `docs/03_specs/内容创作工作台/内容创作Gateway执行桥接协议.md`
- `docs/03_specs/内容创作工作台/Quote-Span-Attribution-MVP执行计划.md`
- `docs/03_specs/内容创作工作台/单章MVP交付包Payload规范.md`
