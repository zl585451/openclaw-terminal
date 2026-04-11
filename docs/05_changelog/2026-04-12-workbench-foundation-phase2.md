# 2026-04-12 Workbench Foundation Phase 2

## Summary

- Moved chat-side workbench roundtrip reads onto `workbenchBus`, so the message pipeline no longer needs `useCanvasBridge` to send artifact context back to the gateway.
- Message transport now dispatches incoming workbench commands directly through the bus.

## What Changed

- [src/hooks/useMessages.ts](/e:/windows-window/OpenClaw-Terminal/src/hooks/useMessages.ts) now:
  - dispatches incoming `canvas/workbench` events through `workbenchBus`
  - reads roundtrip context from `workbenchBus.getContext('continue')`
  - no longer depends on `useCanvasBridge()` for transport-side workbench behavior

## Why It Matters

- The conversation layer is now less aware of Canvas-specific bridge semantics.
- Future workbench types can reuse the same message pipeline without introducing new chat-to-canvas coupling.

## Verification

- `npx tsc --noEmit`
- `npm run build`
