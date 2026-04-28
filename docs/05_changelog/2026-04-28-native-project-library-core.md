# 2026-04-28 Native Project Library Core

## Summary

Moved the default AI.library project-library workflow out of the Python service and into Electron main process code.

The default client now supports book upload, chapter splitting, book/chapter listing, chapter reads, and deletion without Python, FastAPI, ChromaDB, sentence-transformers, OCR, or PyInstaller runtime artifacts.

## Changes

- Added a native project-library store under `userData/ai_library_data/library`.
- Kept existing renderer IPC channels: `library:list`, `library:get`, `library:chapters`, `library:chapter`, `library:upload`, `library:delete`.
- Added a lightweight local HTTP bridge on `127.0.0.1:8001` for Gateway compatibility.
- Changed AI.library auto-start default to enabled.
- Removed `resources/ai_library` from default `electron-builder` `extraResources`.
- Disabled professional `search_knowledge` RAG by default with `ai_library.knowledge_search_enabled = false`.

## Rationale

The project library workflow only needs text import, chapter splitting, persistent metadata, and chapter reads. The old AI.library Python project also bundled professional audio RAG, vector search, QA generation, and OCR, which pulled in large and fragile dependencies that are not needed for the current project-library product surface.

## Follow-Up

Professional knowledge search can return later as an optional module with its own runtime, packaging boundary, and entitlement switch.
