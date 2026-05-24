# OCT Optional Capability Boundary (Phase F)

> Date: 2026-05-24  
> Status: Phase F-2. Baseline capability snapshot exists; static ToolLoader tools, the gateway `script_adapter` runtime, image analyzer fallback, and AI.library knowledge client are now lazy-loaded on first use.

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

Notes:

- `memory` 包当前主要覆盖搜索、摘要、governance、raw turn/history 等子能力。
- 原 feedback 子能力（`memory_feedback.js`）已在 2026-05-25 从运行时主链删除，不再计入当前 optional capability 边界。

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

This lets the UI and diagnostics observe optional capability boundaries before broader physical lazy-loading is introduced.

## Phase F-2 runtime boundary

Static tools, `script_adapter`, image analyzer fallback, and AI.library knowledge search are the first runtime packages moved behind lazy gateway boundaries:

- `oct-gateway/tool_loader.js` no longer loads every static `tools/*.js` module at require time. It loads static tools on the first `getDefinitions()`, `executeTool()`, or `getToolMeta()` call, then reuses the loaded registry.
- `oct-gateway/index.js` no longer eagerly imports chapter pipeline, batch/intake/analysis/handoff orchestrators, persistence, connection registry, or `script_adapter/messageHandler.js` during gateway startup.
- `oct-gateway/script_adapter/lazyMessageHandler.js` gates loading to real `scriptAdapter.*` requests and keeps non-scriptAdapter traffic on the normal router without touching the content workflow runtime.
- If the script-adapter runtime has already been loaded, new connections are still subscribed to running batches; if it has not been loaded, ordinary chat/settings/image traffic does not initialize that optional package.
- `src/App.tsx` lazy-loads the frontend `ScriptAdapterApp` only after the user enters “内容制作工作台” or “项目素材库”. The normal chat view no longer statically imports the full script-adapter UI module at app boot.
- `oct-gateway/services/imageService.js` now accepts an analyzer factory. Inline-vision models still send image parts directly without loading `oct-gateway/image_analyzer.js`; the analyzer fallback is loaded only for non-vision models with image attachments.
- `oct-gateway/runtime/lazyAiLibrary.js` defers `oct-gateway/tools/ai_library.js` until `/status`, explicit `search_knowledge`, or enabled knowledge-search context injection needs it. Normal chat skips AI.library knowledge lookup unless `ai_library.knowledge_search_enabled === true`.

This phase keeps the existing tool definitions/execution contract, `scriptAdapter.*` method shapes, image attachment payload shape, text-only fallback behavior, and `search_knowledge` tool contract intact. It does not yet split the frontend workbench bundle or make packages dynamically uninstallable.

## Non-goals in this phase

- Do not unload or delete tool/script/image/memory modules yet.
- Do not change chat behavior based on optional package status yet.
- Do not remove `ai.js` local provider fallback in Phase F; that is a separate high-risk provider behavior decision.
