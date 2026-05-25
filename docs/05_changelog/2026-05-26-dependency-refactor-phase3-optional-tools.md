# 2026-05-26 Dependency Refactor Phase 3

## Scope

- Split optional document and email tool dependencies out of the core gateway package.
- Added `oct-gateway/optional-tools/package.json` and lockfile ownership for:
  - `imapflow`
  - `mammoth`
  - `nodemailer`
  - `pdf-parse`
  - `xlsx`
- Added an optional dependency resolver used by document and email tools.
- Kept static tool discovery loadable even when optional tool dependencies are absent from the core gateway package.
- Updated Electron packaging resources to include `oct-gateway/optional-tools/node_modules`.

## Verification

- `npm --prefix oct-gateway ls --depth=0`
- `npm --prefix oct-gateway/optional-tools ls --depth=0`
- `node oct-gateway/test/toolLoaderLazyInit.test.js`
- `node oct-gateway/test/gatewaySmoke.test.js`
- `node oct-gateway/test/bootstrapEnvironment.test.js`
- `node oct-gateway/test/imageService.test.js`
- `npm run build`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npx vitest run src/ui/chat/renderProtocolV3Golden.test.ts src/hooks/__tests__/settings.test.ts`

## Remaining Dependency Risk

- Optional `xlsx` still has a known audit advisory with no upstream fix available in the current package line.
- Core gateway audit no longer includes the optional tool dependency tree.
