# Dependency Major-Version Boundaries

This note records dependency risks that were intentionally not changed during the 2026-05-26 dependency refactor because they require a separate migration decision, replacement evaluation, or packaged-app QA pass.

## Root Renderer and Electron Surface

| Area | Current risk | Boundary |
| --- | --- | --- |
| XML serialization pipeline | `@xmldom/xmldom` audit advisories | Keep as a tracked audit item until the owning package path and renderer usage are reviewed together. Any change must include XML/document rendering regression checks. |
| Sanitization pipeline | `dompurify` audit advisories | Do not change sanitizer behavior as a drive-by dependency refactor. Any migration must include markdown/render protocol tests and hostile HTML fixture coverage. |
| UUID transitive dependency | `uuid` audit advisory | Keep as a lockfile/transitive cleanup candidate. Validate whether the owning package can be upgraded without renderer or packaging churn. |

## Core Gateway

| Area | Current risk | Boundary |
| --- | --- | --- |
| Google provider SDK | `@google/genai` depends on vulnerable `protobufjs` range | Keep provider SDK migration separate from dependency slimming. Any change must verify Gemini/Google provider request formatting, proxy behavior, and gateway startup. |

## Optional Tools

| Area | Current risk | Boundary |
| --- | --- | --- |
| Spreadsheet parsing | `xlsx` has advisories with no fix in the current package line | The package is isolated under `oct-gateway/optional-tools`. Replacing it needs a separate tool-compatibility decision because it affects `.xlsx`, `.xls`, and `.csv` parsing behavior. |

## Migration Acceptance Criteria

Future major-version or replacement work should include:

- A concrete owner package path from `npm audit` or `npm why`.
- A before/after dependency tree for the affected surface.
- Targeted tests for the feature surface that imports the package.
- `npm run build`.
- `npx tsc --noEmit`.
- `npx tsc -p tsconfig.electron.json --noEmit`.
- Gateway smoke tests when `oct-gateway` or optional tools are affected.
- A changelog entry under `docs/05_changelog/`.
