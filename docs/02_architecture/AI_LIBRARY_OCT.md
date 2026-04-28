# AI.library / Project Library Integration

> Last updated: 2026-04-28  
> Status: default built-in project library core, Python knowledge search split out

## Current Product Boundary

AI.library is now treated as OCT's built-in project library core. The default client no longer depends on the old Python `resources/ai_library/api_server.py` service for book upload, chapter splitting, or project chapter reads.

The default built-in scope is:

| Capability | Status |
|------------|--------|
| Upload `.txt` / `.md` books | Built into Electron main process |
| Split chapters | Built into Electron main process |
| List books and chapters | Built into Electron main process |
| Read full chapter text | Built into Electron main process |
| Current project context | Frontend `ProjectContext` + Gateway prompt injection |
| Professional audio RAG search | Disabled by default; future optional module |

## Runtime Shape

The project library uses Electron main process storage under userData:

| Path | Purpose |
|------|---------|
| `userData/ai_library_data/library/library.json` | Book and chapter index |
| `userData/ai_library_data/library/sources/` | Uploaded source text |

Electron exposes the same renderer IPC contract as before:

| IPC | Purpose |
|-----|---------|
| `library:list` | List books |
| `library:get` | Get one book |
| `library:chapters` | List chapter metadata |
| `library:chapter` | Read chapter text |
| `library:pickFile` | Native file picker |
| `library:upload` | Import a local `.txt` / `.md` file |
| `library:delete` | Delete a book and its source file |

For Gateway compatibility, Electron also starts a lightweight local HTTP server on `127.0.0.1:8001` when AI.library auto-start is enabled. It serves:

| Method | Path |
|--------|------|
| GET | `/health` |
| GET | `/api/library/list` |
| GET | `/api/library/{book_id}` |
| GET | `/api/library/{book_id}/chapters` |
| GET | `/api/library/{book_id}/chapter/{chapter_index}` |
| DELETE | `/api/library/{book_id}` |

The HTTP bridge keeps existing Gateway code paths working, including project chapter fetches during chat and script-adapter batch runs.

## What Was Split Out

The old AI.library Python project contained a separate professional knowledge retrieval system:

- PDF / Markdown document ingestion
- Text chunking
- ChromaDB vector indexes
- `sentence-transformers` embeddings
- DeepSeek / OpenAI QA-pair generation
- OCR for scanned PDFs via PaddleOCR, PaddlePaddle, OpenCV, pdf2image, and Tesseract

Those capabilities are not required for the project library workflow. They are disabled by default through `ai_library.knowledge_search_enabled = false` and should return later only as an optional module.

## Packaging Rule

The default client must not package the old Python source tree or its build artifacts:

- `resources/ai_library/`
- `resources/ai_library/build/`
- `resources/ai_library/dist/`
- virtualenvs
- PyInstaller outputs

The built-in project library core lives in Electron code and uses the renderer IPC + local HTTP bridge described above.

## Gateway Behavior

Gateway still receives `AI_LIBRARY_URL=http://127.0.0.1:8001` from Electron so project chapter reads keep working.

Professional `search_knowledge` is now considered disabled unless `ai_library.knowledge_search_enabled` is explicitly enabled by a future module. Context injection silently skips it when disabled.
