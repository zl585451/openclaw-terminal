# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

OCT (OpenClaw Terminal) is an Electron-based AI desktop assistant with two main components:

1. **Frontend (React + Vite)** — `src/` directory, dev server on port `5176`
2. **oct-gateway (Node.js WebSocket server)** — `oct-gateway/` directory, WebSocket on port `18789`, HTTP on port `18790`

### Running Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Vite Dev Server | `npx vite` (from root) | 5176 | Serves React frontend |
| oct-gateway | `node --watch index.js` (from `oct-gateway/`) | 18789 (WS), 18790 (HTTP) | AI backend; starts without API key but AI chat won't work |

- The gateway reads `.env` from the project root for `DASHSCOPE_API_KEY`, `DEEPSEEK_API_KEY`, etc.
- Without an API key, the gateway starts normally but AI responses will fail. The UI will show a "思考中" (thinking) spinner indefinitely.
- Nocturne Memory Server (Python, port 8000) is optional; the gateway logs a warning and continues if it's offline.

### Key Commands

- **Tests**: `npm test` or `npx vitest run` — runs Vitest unit tests (4 test files, ~42 tests)
- **Type check (frontend)**: `npx tsc --noEmit`
- **Type check (electron)**: `npx tsc -p tsconfig.electron.json --noEmit`
- **Build**: `npm run build` — runs tsc + vite build + electron tsc
- **No ESLint** configured in this project.

### Gotchas

- The `email_reader` tool may fail to load due to a missing transitive dependency (`ip-address`). This is a known non-blocking issue; it only affects the email reader tool.
- The gateway uses `require()` (CommonJS), not ES modules.
- The `postinstall` script is set to `echo skip rebuild` — native module rebuilding (e.g. `node-pty`) is intentionally skipped in `npm install`. This is fine for development where you won't run Electron directly (the Vite dev server doesn't need native modules).
- In a headless cloud VM, Electron cannot launch (no display), so testing is limited to the Vite frontend (port 5176) and gateway (ports 18789/18790).
