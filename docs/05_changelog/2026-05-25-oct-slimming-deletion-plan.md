# 2026-05-25 OCT 瘦身删除施工计划收口

## 背景

用户明确要求 OCT 瘦身从“懒加载/可选化”回到“删代码”本身，计划书不能继续停留在“可能删除”的描述。

## 更新

- 将 `docs/02_architecture/oct-slimming-map-2026-05.md` 改为“删除施工版”。
- 新增明确 P0 删除目标：
  - 已停用 `self_eval` 自评估旧链路。
  - 已移除但仍残留的本地 BLIP 图片理解代码与 IPC 空壳。
  - 已跟踪的仓库杂物文件。
- 将 Render Protocol legacy fallback、ProviderRouter 本地 fallback、hypothesis sidecar 标为 P1，并写明进入删除批次前必须满足的验证门槛。

## 已执行删除

- 删除 `oct-gateway/self_eval.js` 与 `index.js` 中停用的 selfEval 注释引用。
- 删除仓库杂物：`oct-gateway/$null`、`oct-gateway/permission_test.txt`、`oct-gateway/stress_test_report.json`、`oct-gateway/task-board.md`。
- 删除本地 BLIP 残留：`oct-gateway/image_analyzer_local.js`、Electron local vision 状态 helper、三个 local vision IPC 空壳和 preload 暴露 API。

## 验证

- 本次只更新计划文档，未删除运行时代码。
- 删除候选来自 `rg` 引用扫描、`git ls-files` 跟踪状态检查和目标文件行数统计。
