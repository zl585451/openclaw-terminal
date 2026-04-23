# 2026-04-23 Workbench Script View Toggle

## Summary

- Added a temporary toolbar toggle so markdown text documents can switch between `document` and `script` rendering modes.

## What Changed

- `WorkbenchPanel` now shows a `切到 Script` / `切到 Document` button for markdown artifacts whose current type is `document` or `script`.
- The toggle updates the current workbench document's `artifactType` in place without changing the import classifier logic.

## User Impact

- Users can quickly preview how the same text looks in the normal document view versus the script editor view.
- This helps evaluate whether more content should eventually default to the script-style editor.
