# Dependency Boundaries

This project keeps three dependency surfaces separate:

| Surface | Manifest | Purpose |
| --- | --- | --- |
| Frontend and Electron shell | `package.json` | React/Vite UI, Electron build tooling, renderer libraries, and root-level tests. |
| Core gateway | `oct-gateway/package.json` | Gateway startup, WebSocket/HTTP handling, provider calls, native storage, and always-on runtime dependencies. |
| Optional tools | `oct-gateway/optional-tools/package.json` | Tool-only dependencies for document parsing and email workflows. These must not be required by core gateway startup. |

## Rules

- Keep always-on gateway dependencies in `oct-gateway/package.json`.
- Keep document and email tool dependencies in `oct-gateway/optional-tools/package.json`.
- Optional tool modules must load optional dependencies at execution time through `oct-gateway/tools/optionalDependency.js`.
- Static tool discovery must remain safe when optional dependencies are absent from the core gateway package.
- If a package is imported by frontend TypeScript or renderer code, it belongs in the root manifest.
- If a package is imported by Electron main/preload code, it belongs in the root manifest unless it is gateway-only and loaded from packaged gateway resources.
- If a package is imported by gateway startup, provider routing, WebSocket/HTTP transport, native persistence, or shared gateway services, it belongs in `oct-gateway/package.json`.
- Do not add new dependencies for refactors unless the plan explicitly requires them.

## Validation Commands

- `npm run deps:check`
- `npm run deps:gateway`
- `npm run deps:optional-tools`
- `npm run audit:prod`
- `npm run audit:gateway`
- `npm run audit:optional-tools`
- `npm run build`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`

## Known Audit Boundary

- `oct-gateway` currently inherits a `protobufjs` advisory through `@google/genai`.
- `oct-gateway/optional-tools` currently inherits the `xlsx` advisory. It is isolated from the core gateway runtime and has no fix in the current `xlsx` line.
- Root audit still includes renderer/document pipeline advisories that require separate major-version or replacement decisions.
