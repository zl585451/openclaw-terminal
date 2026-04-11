# 2026-04-12 Workbench Foundation Phase 1

## Summary

- Introduced a new `src/workbench/` foundation layer to separate artifact document state from the old `CanvasContext`.
- Added a `WorkbenchBus` so chat and transport code can talk to the workbench through commands instead of directly owning canvas event types.
- Started the compatibility migration by keeping `CanvasContext`, `CanvasHost`, and plugin resolution working as legacy entry points.

## What Changed

### Frontend foundation

- Added [src/workbench/types.ts](/e:/windows-window/OpenClaw-Terminal/src/workbench/types.ts) for shared `WorkbenchDocument`, `WorkbenchEvent`, `WorkbenchCommand`, and roundtrip context types.
- Added [src/workbench/DocumentStore.ts](/e:/windows-window/OpenClaw-Terminal/src/workbench/DocumentStore.ts) as a pure reducer-based document state layer.
- Added [src/workbench/WorkbenchContext.tsx](/e:/windows-window/OpenClaw-Terminal/src/workbench/WorkbenchContext.tsx) to own workbench state and document lifecycle.
- Added [src/workbench/WorkbenchBus.ts](/e:/windows-window/OpenClaw-Terminal/src/workbench/WorkbenchBus.ts) to decouple chat transport from direct context ownership.

### Compatibility layer

- [src/contexts/CanvasContext.tsx](/e:/windows-window/OpenClaw-Terminal/src/contexts/CanvasContext.tsx) now re-exports `Workbench` APIs so existing canvas consumers keep working.
- Added [src/components/workbench/WorkbenchHost.tsx](/e:/windows-window/OpenClaw-Terminal/src/components/workbench/WorkbenchHost.tsx) and [src/components/workbench/WorkbenchPanel.tsx](/e:/windows-window/OpenClaw-Terminal/src/components/workbench/WorkbenchPanel.tsx) as the new host/panel entry points.
- Added [src/workbench/plugins/index.ts](/e:/windows-window/OpenClaw-Terminal/src/workbench/plugins/index.ts) so future workbench renderers can move behind a new namespace without breaking old canvas plugin imports.
- Added [src/hooks/useWorkbenchBridge.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useWorkbenchBridge.ts) as a forward-looking alias for the existing bridge hook.

### App and transport

- [src/App.tsx](/e:/windows-window/OpenClaw-Terminal/src/App.tsx) now mounts the workbench host globally instead of limiting it to the chat tab.
- [src/hooks/useWebSocket.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useWebSocket.ts) now accepts both `canvas` and `workbench` event envelopes.
- [src/hooks/useMessages.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useMessages.ts) now reads shared roundtrip types from the new workbench layer.

### Gateway compatibility

- [oct-gateway/tools/canvas.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/tools/canvas.js) now returns both `canvasEvent` and `workbenchEvent`.
- [oct-gateway/runtime/toolLoop.js](/e:/windows-window/OpenClaw-Terminal/oct-gateway/runtime/toolLoop.js) now forwards `workbenchEvent` to the frontend transport.

## Verification

- `npx tsc --noEmit`
- `npm run build`
