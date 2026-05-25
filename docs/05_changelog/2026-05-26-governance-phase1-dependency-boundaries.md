# 2026-05-26 Governance Phase 1: Dependency Boundaries

## Scope

- Created `codex/oct-governance-phase1-dependency-boundaries` from the Phase 0 governance branch.
- Tagged the phase start as `governance-phase1-start-2026-05-26`.
- Merged `codex/dependency-refactor-2026-05-26` into the governance branch so the dependency boundary work is validated with the Phase 0 baseline.
- Restored the dependency governance scripts on this branch:
  - `deps:check`
  - `deps:gateway`
  - `deps:optional-tools`
  - `audit:prod`
  - `audit:gateway`
  - `audit:optional-tools`
- Restored the dependency boundary docs and optional tool package surface:
  - `docs/03_specs/dependency-boundaries.md`
  - `docs/03_specs/dependency-major-version-boundaries.md`
  - `oct-gateway/optional-tools/package.json`

## Verification

- `npm run deps:check`
- `npm run deps:gateway`
- `npm run deps:optional-tools`
- `npm run audit:prod`
- `npm run audit:gateway`
- `npm run audit:optional-tools`
- `npm test`
- `npm run build`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `node oct-gateway/test/gatewaySmoke.test.js`
- `node oct-gateway/test/toolLoaderLazyInit.test.js`
- `node oct-gateway/test/bootstrapEnvironment.test.js`
- `node oct-gateway/test/imageService.test.js`

## Known Audit Boundaries

- Root production audit still reports `@xmldom/xmldom`, `dompurify`, and `uuid`.
- Core gateway audit still reports `protobufjs` through `@google/genai`.
- Optional tool audit still reports `xlsx`, which has no fix in the current package line.

These are tracked as major-version or replacement boundaries rather than Phase 1 dependency-surface failures.

## Working Tree Note

- `project_structure.txt` remains untracked and was not touched.
