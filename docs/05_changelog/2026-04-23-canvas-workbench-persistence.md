# 2026-04-23 Canvas Workbench Persistence

## Summary

- Added local persistence for Canvas / Workbench documents.
- Canvas documents now survive app restarts instead of resetting to an empty in-memory state.

## What Changed

- `WorkbenchProvider` now restores persisted UI/document state from `localStorage` during startup.
- Workbench document changes are automatically serialized back to `localStorage`.
- Added defensive restore logic so corrupted or outdated persisted entries do not break Canvas startup.

## User Impact

- Document-type Canvas artifacts, AI-generated notes, code drafts, and similar workbench items remain available after closing and reopening the app.
- If the stored snapshot is malformed, the app safely falls back to an empty workbench instead of crashing.
