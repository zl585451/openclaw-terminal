# 2026-04-26 — 书库 Phase 1：AI.library 迁入与数据路径 userData 化

## 摘要

将 AI.library 纳入仓库 `resources/ai_library/`，`audio_knowledge_base.Config` 支持 `AI_LIBRARY_DATA_ROOT` / `AI_LIBRARY_DOCS_ROOT`；FastAPI 启动时创建数据目录。Electron 在未配置 `OCT_AI_LIBRARY_PATH` 时自动选用内嵌目录，并在 spawn 时把向量与 SQLite 等数据指向 `userData/ai_library_data/`。

## 变更文件

| 路径 | 说明 |
|------|------|
| `resources/ai_library/` | 内嵌源码（自本机 `E:\AI.library` 同步；排除 `data/`、`documents/`、venv） |
| `resources/ai_library/.gitignore` | 忽略运行时 data、documents、缓存与 venv |
| `resources/ai_library/audio_knowledge_base.py` | `Config` 环境变量化；新增 `LIBRARY_DATA_ROOT`（供后续 Phase 2） |
| `resources/ai_library/api_server.py` | `ensure_data_dirs()` + `@app.on_event("startup")`；CORS 增加 5176 |
| `electron/main.ts` | `resolveBundledAiLibraryRoot()`；默认路径；spawn 注入 `AI_LIBRARY_*` |
| `.gitignore` | 根仓库忽略 `resources/ai_library/data/` 等 |
| `package.json` | `electron-builder` `extraResources`：将 `resources/ai_library` 复制到安装包 `resources/ai_library` |
| `docs/02_architecture/AI_LIBRARY_OCT.md` | 内嵌与 userData 数据根说明 |

## 未包含（按 Phase 1 约定）

- `/api/library/*` 书库专用接口（Phase 2）

## 验证建议

1. 设置 `OCT_AI_LIBRARY_AUTO_START=1`，`OCT_AI_LIBRARY_PATH` 留空或删除，重启 OCT。
2. 确认 `%APPDATA%/…/ai_library_data/`（或本机 userData）被创建。
3. `GET http://127.0.0.1:8001/health` 返回 200。
4. 原有 `POST /api/search` 行为不变（需已安装 `resources/ai_library/requirements.txt` 依赖）。
