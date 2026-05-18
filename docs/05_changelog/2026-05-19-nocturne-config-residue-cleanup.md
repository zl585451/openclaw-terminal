# 2026-05-19 Nocturne 配置残留清理

## Summary

在将 Render Protocol v2 集成到 Memory v2 / Nocturne final removal 底座时，清理 Electron 默认配置中最后两个 Nocturne 命名字段，避免 UI 或后续维护误判 Nocturne 仍属于运行时配置。

## Changed

- 移除 `electron/main.ts` 默认配置中的 `NOCTURNE_BUSY_TIMEOUT`。
- 移除 `electron/main.ts` 默认配置中的 `OCT_NOCTURNE_AUTOSTART`。

## Notes

本次只清理运行时默认配置残留；历史文档和历史日志中的 Nocturne 记录保留，用于追溯旧架构演进。
