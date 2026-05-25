# 2026-05-26 Dependency Refactor Phase 5

## Scope

- Recorded the dependency advisories that remain outside the safe refactor boundary.
- Documented separate migration criteria for root renderer/Electron, core gateway, and optional tool dependency surfaces.

## Verification

- `npm run deps:check`
- `npm run deps:gateway`
- `npm run deps:optional-tools`
- `npm run audit:prod`
- `npm run audit:gateway`
- `npm run audit:optional-tools`
- `npm run build`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `node oct-gateway/test/gatewaySmoke.test.js`
- `node oct-gateway/test/toolLoaderLazyInit.test.js`
- `node oct-gateway/test/bootstrapEnvironment.test.js`
- `node oct-gateway/test/imageService.test.js`
- `npx vitest run src/ui/chat/renderProtocolV3Golden.test.ts src/hooks/__tests__/settings.test.ts`
