# 2026-05-18 Nocturne 资源卸载

## 背景

Memory v2 已成为默认记忆后端，Nocturne 不再参与 OCT 的默认启动、写入、搜索、摘要或向量召回链路。

## 变更

- Windows 打包不再执行 `build:nocturne`。
- Windows 打包不再携带 `resources/nocturne_memory` 与 `resources/nocturne_server`。
- 日志面板状态从 Nocturne 在线状态改为 Memory v2 本地状态。
- 前端不再轮询 `nocturne-health`。
- 设置页记忆区域默认展示 Memory v2 本地存储说明。

## 说明

仓库中的 `resources/nocturne_memory` 和 `resources/nocturne_server` 属于 bundled legacy 资源，当前环境删除时被 Windows 文件权限拦截；由于它们已从打包资源中移除，不再进入发布产物。后续可在非受限终端清理这两个目录。
