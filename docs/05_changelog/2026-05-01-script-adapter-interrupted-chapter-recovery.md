# 2026-05-01 内容制作批次中断章节恢复

## 背景

单章真实制作过程中，如果 Gateway 重启或执行被外部中断，`batch_jobs` 会在启动恢复时从 `running` 改为 `paused`，但对应 `chapter_runs` 仍可能停留在 `running`。这会导致工作台出现“批次 paused、章节 running”的僵尸状态，用户无法判断是否仍在执行。

## 改动

- 新增 `persistence.recoverInterruptedChapterRuns()`。
- Gateway 启动时扫描所有 `chapter_runs.status = running` 的记录。
- 将这些章节标记为 `failed`，错误信息写入 `INTERRUPTED_BY_GATEWAY_RESTART`。
- 同步刷新批次完成/失败计数，并将受影响批次收口到 `failed`、`paused` 或 `completed`。

## 影响

- 中断后的章节不再无限显示 running。
- 用户可在工作台看到明确失败原因，并通过章节重跑入口重新执行。
