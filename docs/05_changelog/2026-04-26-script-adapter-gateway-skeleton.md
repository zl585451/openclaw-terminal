# 2026-04-26 Script Adapter Gateway Skeleton

## Summary

- Split the script adapter mock execution pipeline into registry, runner, event emitter, and artifact factory modules.
- Added Gateway transport methods for `scriptAdapter.run.cancel` and `scriptAdapter.run.list`.
- Added Electron IPC/preload/frontend service APIs for cancel/list.
- Preserved frontend execution status compatibility by keeping `cancelled` as registry-only state.

## Verification Notes

- `scriptAdapter.run.start` still emits the existing sheet/agent/artifact/gate events.
- Cancel uses `AbortController` and emits `run_cancelled` with a failed-compatible sheet payload for the current UI.
- List returns lightweight registry snapshots sorted by `updatedAt`.
