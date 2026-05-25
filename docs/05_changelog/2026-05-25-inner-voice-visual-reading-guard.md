# Inner Voice Visual Reading Guard

## Change

- Updated `oct-gateway/script_adapter/innerVoiceSpanExtractor.js` so visually read text is not lifted as character OS.
- Added a left-context guard for written/read/display cues such as `写着`, `记录着`, `显示`, `看到`, and `辨认出`.
- Replaced book-specific action-subject names in `isNarrativeAction` with a generic 1-4 Chinese-character subject pattern.
- Added regression coverage for notebook/record text that should remain narration.

## Validation

- `npx vitest run oct-gateway/test/innerVoiceSpanExtractor.test.js`
