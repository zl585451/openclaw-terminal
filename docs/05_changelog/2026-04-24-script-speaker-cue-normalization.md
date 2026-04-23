# Script Speaker Cue Normalization

## Summary

- Added a small `speakerCueNormalizer` module to clean role candidates like `周佳宁应了一声` into `周佳宁`.
- Wired the normalization into script parsing, document character mention extraction, workbench persistence restore, and current-chapter role-detect input/output handling.
- Reduced polluted role-library entries caused by prose speaker-cue phrases being treated as standalone character names.

## Files

- `src/utils/speakerCueNormalizer.ts`
- `src/utils/dialogueDetector.ts`
- `src/utils/characterExtractor.ts`
- `src/workbench/DocumentStore.ts`
- `src/workbench/plugins/scriptPlugin.tsx`

## Behavior Change

- Colon-style cue lines now normalize common trailing speech/action fragments before becoming dialogue speaker names.
- Existing role candidates sent to `/api/script-role-detect` are normalized first.
- Role-detect results and restored script role libraries also pass through the same normalization step.

## Example

- Before: `周佳宁应了一声：` could create a role named `周佳宁应了一声`
- After: the same cue is normalized to `周佳宁`
