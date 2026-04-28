# 2026-04-28 Nocturne Root Node Repair

## 变更摘要

- 修复 Nocturne 空库只有表结构但缺少固定根节点时，初始化核心记忆失败的问题。
- 在 Electron 启动 Nocturne 前，使用 gateway 随包的 `better-sqlite3` 对 SQLite 空库补根节点。
- 在 `SQLiteClient.init_db()` 创建表结构后补充根节点自修：
  `00000000-0000-0000-0000-000000000000`。
- 对当前开发环境的 `nocturne_memory.db` 做了一次非破坏修复：先备份，再只插入缺失根节点。

## 背景

设置页点击“初始化预设记忆”时，写入 `core://agent/identity` 返回 HTTP 500。
诊断日志显示 SQLite 外键失败：`edges.parent_uuid` 指向固定根节点，但 `nodes`
表里没有该根节点。

## 影响范围

- `resources/nocturne_memory/backend/db/sqlite_client.py`
- `electron/main.ts`
- `docs/02_architecture/nocturne-backend.md`

## 验证

- 当前本地 Nocturne `/health` 返回 `database: connected`。
- 已成功写入 7 条核心预设记忆。
- `GET /browse/domains` 返回 `core` domain。
