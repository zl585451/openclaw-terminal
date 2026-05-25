# 2026-05-26 Dependency Refactor Phase 2

## Scope

- Removed unused direct frontend dependencies:
  - `@xterm/addon-fit`
  - `react-syntax-highlighter`
  - `@types/react-syntax-highlighter`
- Reclassified `@types/prismjs` as a direct dev dependency because the frontend imports Prism language modules.
- Removed unused gateway direct dependencies:
  - `@xenova/transformers`
  - `https-proxy-agent`
- Updated the dependency spec to document `prismjs` as the active code highlighting runtime.
- Removed a stale React Syntax Highlighter line-number selector from `src/styles/CodeBlock.css`.

## Verification

- `npm ls --depth=0`
- `npm --prefix oct-gateway ls --depth=0`
- `npm run build`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `node oct-gateway/test/gatewaySmoke.test.js`
- `node oct-gateway/test/toolLoaderLazyInit.test.js`
- `node oct-gateway/test/bootstrapEnvironment.test.js`
- `node oct-gateway/test/imageService.test.js`
- `npx vitest run src/ui/chat/renderProtocolV3Golden.test.ts src/hooks/__tests__/settings.test.ts`

## Remaining Dependency Risk

- Root audit still reports inherited issues in `@xmldom/xmldom`, `dompurify`, and `uuid`.
- Gateway audit still reports inherited issues in `@google/genai` via `protobufjs`, and `xlsx` until optional tool dependency isolation is completed.
