# 2026-05-26 Dependency Refactor Phase 0 Baseline

## Scope

This is the baseline checkpoint for the dependency refactor branch
`codex/dependency-refactor-2026-05-26`.

No dependency, lockfile, or runtime code changes were made in this phase.

## Baseline Findings

- Root `npm ls --depth=0` succeeds but reports one existing extraneous package:
  `@emnapi/runtime@1.8.1`.
- `oct-gateway npm ls --depth=0` succeeds.
- Root production audit currently reports 11 vulnerabilities:
  4 moderate and 7 high.
- `oct-gateway` production audit currently reports 10 vulnerabilities:
  1 low, 3 moderate, 5 high, and 1 critical.
- The known critical gateway audit chain is tied to
  `@xenova/transformers -> onnxruntime-web -> onnx-proto -> protobufjs`.

## Verification

Passed:

```powershell
node oct-gateway/test/gatewaySmoke.test.js
node oct-gateway/test/toolLoaderLazyInit.test.js
node oct-gateway/test/imageService.test.js
npx vitest run src/ui/chat/renderProtocolV3Golden.test.ts src/hooks/__tests__/settings.test.ts
npx tsc --noEmit
npx tsc -p tsconfig.electron.json --noEmit
```

Expected baseline failures:

```powershell
npm audit --omit=dev --registry=https://registry.npmjs.org
npm audit --omit=dev --registry=https://registry.npmjs.org
```

Both audit commands fail because the current dependency baseline has known
vulnerabilities. Later phases must reduce this count without using forced major
upgrades.
