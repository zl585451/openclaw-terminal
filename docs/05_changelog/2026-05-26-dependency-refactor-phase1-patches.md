# 2026-05-26 Dependency Refactor Phase 1 Patches

## Scope

Phase 1 applies only low-risk dependency patch/minor updates that were already
inside the dependency refactor plan. It does not perform major framework
migrations and does not remove packages.

## Updated Packages

Root project:

- `ws` to `8.21.0`
- `mermaid` to `11.15.0`
- `undici` to `6.26.0`
- `docx` to `9.7.0`
- `echarts` to `6.1.0`
- `vitest` to `4.1.7`
- `zustand` to `5.0.13`

`oct-gateway`:

- `ws` to `8.21.0`
- `undici` to `7.26.0`
- `@google/genai` to `1.52.0`
- `better-sqlite3` to `12.10.0`
- `imapflow` to `1.3.3`
- `nodemailer` to `8.0.8`

## Audit Result

- Root production audit improved from 11 vulnerabilities to 3 remaining
  vulnerabilities.
- `oct-gateway` production audit improved from 10 vulnerabilities to 6
  remaining vulnerabilities.
- Remaining gateway critical risk is still tied to the planned Phase 2 deletion
  of `@xenova/transformers`.
- Remaining `xlsx` risk is intentionally left for the optional tools phase.

## Verification

Passed:

```powershell
npm run build
npx tsc --noEmit
npx tsc -p tsconfig.electron.json --noEmit
node oct-gateway/test/gatewaySmoke.test.js
node oct-gateway/test/toolLoaderLazyInit.test.js
node oct-gateway/test/bootstrapEnvironment.test.js
node oct-gateway/test/imageService.test.js
npx vitest run src/ui/chat/renderProtocolV3Golden.test.ts src/hooks/__tests__/settings.test.ts
```
