# 2026-04-12 Workbench Foundation Phase 3

## Summary

- Promoted `src/workbench/plugins/` to the primary renderer registry.
- Demoted `src/components/canvas/plugins/*` into compatibility re-export entry points.

## What Changed

- Added workbench-native plugin definitions for `code`, `diagram`, `echart`, `html`, `markdown`, and `react-flow`.
- [src/workbench/plugins/index.ts](/e:/windows-window/OpenClaw-Terminal/src/workbench/plugins/index.ts) now owns `WORKBENCH_PLUGINS` and `resolveWorkbenchPlugin()`.
- [src/components/canvas/plugins/index.ts](/e:/windows-window/OpenClaw-Terminal/src/components/canvas/plugins/index.ts) now delegates to the workbench plugin registry.
- Legacy canvas plugin files now re-export the workbench plugin implementations instead of owning the logic.

## Why It Matters

- New artifact renderers can land under `workbench/plugins` without extending the old canvas namespace.
- The old canvas import surface still works, but ownership has moved to the workbench subsystem.

## Verification

- `npx tsc --noEmit`
- `npm run build`
