# Changelog: AI.library 书库 Phase 2（SQLite + `/api/library/*`）

日期：2026-04-26 | Track：Week 3 Track 2

## 摘要

在 `resources/ai_library/` 新增书库 SQLite 与章节切分模块；`api_server.py` **追加** `/api/library/*` 路由与启动时 `ensure_schema()`。支持 `.txt` / `.md` 上传、列表、详情、章节列表、单章正文、删除（库记录 + 源文件）。**未改动** `audio_knowledge_base.py` 中现有 `Config` 语义、`/api/search`、`/api/qa/search` 实现。

## 新增文件

| 文件 | 说明 |
|------|------|
| `resources/ai_library/library_db.py` | `books` / `chapters` 表；连接层 `PRAGMA foreign_keys = ON`；`ON DELETE CASCADE` |
| `resources/ai_library/chapter_splitter.py` | 中文章/回、英文 Chapter、Markdown `#` 标题；同起点去重，避免短文本多章被误杀 |
| `resources/ai_library/test_chapter_splitter.py` | 离线切分断言 |
| `resources/ai_library/test_library_phase2_smoke.py` | TestClient 全流程 + 删除后 chapters 行数为 0（验证外键级联） |

## 修改文件

| 文件 | 说明 |
|------|------|
| `resources/ai_library/api_server.py` | `startup` 调用 `library_db.ensure_schema()`；新增 upload/list/get/delete/chapters/chapter-text |
| `resources/ai_library/requirements.txt` | 增加 `python-multipart`（`File`/`Form` 上传） |

## 接口一览

| Method | Path | 用途 |
|--------|------|------|
| POST | `/api/library/upload` | multipart：`file` + `title` + 可选 `author`、`source_type`；仅 `.txt`/`.md` |
| GET | `/api/library/list` | 分页 `limit`/`offset` |
| GET | `/api/library/{book_id}` | 单本元数据 |
| DELETE | `/api/library/{book_id}` | 先删 DB（级联 chapters），再删 `LIBRARY_DATA_ROOT` 下源文件 |
| GET | `/api/library/{book_id}/chapters` | 章节列表 |
| GET | `/api/library/{book_id}/chapter/{chapter_index}` | 单章正文（UTF-8 源文件切片） |

数据：`${LIBRARY_DATA_ROOT}/library.sqlite3`，原文 `${LIBRARY_DATA_ROOT}/sources/<book_id>.<ext>`。

## 验证（本轮实际执行）

```bash
cd resources/ai_library
python test_chapter_splitter.py
python test_library_phase2_smoke.py
```

- `test_library_phase2_smoke.py` 使用临时 `AI_LIBRARY_DATA_ROOT`，覆盖上传 → list → get → chapters → chapter/0 → delete，并断言删除后 `chapters` 表中该书 `COUNT(*)=0` 且 `sources/<id>.txt` 不存在。

## 已知限制

- 仅 `.txt`/`.md`；不接 Gateway、无鉴权、无前端 UI（Phase 3）。
- 章节规则为启发式；复杂排版可能需后续调参。
- 未在本机对 `uvicorn` 常驻端口做 `curl` 联调（与 TestClient 等价覆盖 ASGI 路由）；若需对外联调，启动后可用 handoff 中的 curl 示例。

## 相关架构文档

- `docs/02_architecture/AI_LIBRARY_OCT.md` 已追加「书库 Phase 2」小节。
