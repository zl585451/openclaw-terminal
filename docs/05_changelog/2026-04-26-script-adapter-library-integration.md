# Changelog: Week 4 Track 1 — 书库 × 工作台（Electron IPC 直连 AI.library）

日期：2026-04-26

## 摘要

在内容创作工作台开工确认书区域增加 **从书库选章节**（`LibrarySelector`），与原有 **粘贴测试原文** textarea **并列**；选章后写入 `sourceText` 并显示来源 badge；开工仍走既有 `startGatewayExecution` → `sourceText` → Gateway。**不**经 Gateway 转发书库；**不**改 AI.library Phase 2 六个接口语义。

## 改动文件（7）

| 路径 | 说明 |
|------|------|
| `electron/main.ts` | `getAiLibraryBase` + `aiLibraryFetch`；IPC `library:list` / `library:get` / `library:chapters` / `library:chapter` |
| `electron/preload.ts` | `electronAPI.library.*` |
| `src/types/electronAPI.ts` | `library` 类型 |
| `src/modules/script-adapter/services/aiLibraryClient.ts` | 新建：`listBooks`、`listChapters`、`getChapterText` |
| `src/modules/script-adapter/ui/Workbench/LibrarySelector.tsx` | 新建：书 → 章 → 取入 |
| `src/modules/script-adapter/ui/Workbench/WorkbenchView.tsx` | 接入 `LibrarySelector`、`pickedMeta` badge；textarea 去掉 4000 硬上限，超长提示 |
| `src/modules/script-adapter/styles/scriptAdapter.module.css` | `.librarySelector*`、`.librarySourceBadge`、`.sourceLengthWarn` |

## 新增 IPC 通道

| Channel | 参数 | 行为 |
|---------|------|------|
| `library:list` | `{ limit?, offset? }` | `GET /api/library/list?...` |
| `library:get` | `{ bookId }` | `GET /api/library/{id}` |
| `library:chapters` | `{ bookId }` | `GET /api/library/{id}/chapters` |
| `library:chapter` | `{ bookId, chapterIndex }` | `GET /api/library/{id}/chapter/{index}` |

返回值：`{ success: true, data: <AI.library JSON> }` 或 `{ success: false, error: string }`（离线/HTTP 错误不抛）。

## 演示路径

1. 确保 AI.library 在 8001 有书（Week 3 Phase 2 可用 curl 上传）。
2. OCT 打开内容创作工作台 → 开工确认书：上方选书、选章 →「取入测试输入框」→ textarea 填充；badge 显示《书名》·章节。
3. 确认开工 → 与 Week 3 相同，`sourceText` 经既有 IPC 到 Gateway；日志可见 `sourceTextLen`。

## 已知限制

- 单段 `sourceText` 超过约 **4000** 字时，Week 3 文本改编师会 `TEXT_REWRITER_TOO_LONG`，产物为占位，**pipeline 不中断**；**本周不做**超长自动切片（Week 5）。
- **无**书库管理 UI（上传/删除仍 curl 或外部流程，Week 5+）。
- 书库为空或 AI.library 离线时，`LibrarySelector` 显示错误文案，**textarea 仍可手动粘贴**。

## 与 Week 3 的衔接

- 复用 `sourceText`、`startGatewayExecution`、`script-adapter-run-start`，**未改** Gateway 书库相关逻辑。
- 书库 HTTP 仅由 **Electron main** `fetch` 调用，与 oct-gateway 解耦。

## 文档

- `docs/03_specs/内容创作工作台/00_项目接手指南.md`（V2.24、3.2 代码索引）
- `docs/02_architecture/script-adapter-gateway-protocol.md`（Electron 书库 IPC 小节）
