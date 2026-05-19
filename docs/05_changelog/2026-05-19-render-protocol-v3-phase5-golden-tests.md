# Render Protocol v3 Phase 5 Golden Tests

Date: 2026-05-19

## Summary

Phase 5 adds a repeatable golden stability test bench for Render Protocol v3. The test bench freezes the four real prompt cases from `docs/test-results/stability_test_prompts.md` into typed fixtures and verifies the full deterministic path:

1. raw model output
2. Gateway normalized output
3. `render_blocks`
4. frontend parsed result
5. verdict and failure layer

## Changes

- Added `src/ui/chat/__fixtures__/renderProtocolV3GoldenFixtures.ts`.
- Added `src/ui/chat/renderProtocolV3Golden.test.ts`.
- Hardened `oct-gateway/services/renderBlocksNormalizer.js` so fenced `render_blocks` JSON can contain Markdown code fences inside string content.
- Extended `oct-gateway/test/renderBlocksNormalizer.test.js` with a nested-fence regression.
- Updated `docs/04_dev_guides/2026-05-19-render-protocol-v3-plan.md` and `docs/05_changelog/CHANGELOG.md`.

## Verification

- `npx vitest run src/ui/chat/renderProtocolV3Golden.test.ts`
- `node oct-gateway/test/renderBlocksNormalizer.test.js`

## Notes

- The golden fixtures are deterministic stand-ins for model output; they do not call live model APIs.
- The test report structure is embedded in the Vitest assertion payload so failures identify whether the breakage came from model output, Gateway normalization, or frontend rendering.
- Legacy parsing is not removed. The golden tests keep checking that symbol explanation text does not fall back into accidental pills detection.
