# OCT Optional Capability Boundary (Phase F)

> Date: 2026-05-24  
> Status: Phase F baseline. This is a packaging and observability boundary, not yet lazy-loading.

## Core vs optional

Core chat path:

- local WS/HTTP transport
- `chat.send` routing
- context build
- model stream
- final `chat` event / Render Protocol payload

Optional capability packages:

| Package | Runtime owner | Current status source | Lazy-load candidate |
|---|---|---|---|
| `tools` | `oct-gateway/tool_loader.js` + `runtime/toolLoop.js` | loaded tool definition count | yes |
| `mcp_tools` | `oct-gateway/mcp/manager.js` | MCP server status | yes |
| `script_adapter` | `oct-gateway/script_adapter/*` + `src/modules/script-adapter` | `config.scriptAdapter.enabled` | yes |
| `image_analysis` | `services/imageService.js` + `image_analyzer.js` | `config.image_analysis.enabled` | yes |
| `memory` | `memory.js` + `bootstrap/memoryJobs.js` | `config.memory.enabled` | no; currently part of context quality path |
| `ai_library` | `tools/ai_library.js` | `config.ai_library.enabled` | yes |

## Gateway capability payload

`createGatewayCapabilitiesProvider()` now may include:

```json
{
  "optionalCapabilities": {
    "version": "2026-05-24",
    "packages": {
      "tools": {
        "status": "available",
        "loadedCount": 25,
        "lazyLoadCandidate": true,
        "entrypoints": ["oct-gateway/tool_loader.js", "oct-gateway/runtime/toolLoop.js"]
      }
    }
  }
}
```

This lets the UI and diagnostics observe optional capability boundaries before physical lazy-loading is introduced.

## Non-goals in this phase

- Do not unload or delete tool/script/image/memory modules yet.
- Do not change chat behavior based on optional package status yet.
- Do not remove `ai.js` local provider fallback in Phase F; that is a separate high-risk provider behavior decision.

