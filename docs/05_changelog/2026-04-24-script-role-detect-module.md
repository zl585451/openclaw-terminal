# 2026-04-24 Script Role Detect Module

## Summary

- Added a lightweight `识别当前章角色` module inside the script panel.
- The module only scans the currently visible chapter, stores a reusable character color library on the current workbench document, and colors inferred dialogue lines in place.

## What Changed

- Added `scriptCharacterLibrary` and `scriptChapterAttributions` to workbench documents so role colors and chapter-level speaker attributions persist with the document.
- Added `POST /api/script-role-detect` in `oct-gateway` for current-chapter role detection.
- The script toolbar now includes a `识别当前章角色` action.
- Inferred dialogue lines in prose/script text are colored by the detected speaker without rewriting the original text structure.

## User Impact

- Users can detect likely speakers for the currently open chapter only.
- Detected roles get stable colors that are reused in later chapters of the same document.
- The feature is modular and limited to in-panel recognition, without coupling to any downstream audiobook flow.
