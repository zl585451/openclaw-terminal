# 2026-05-01 内容制作工作台后台状态显化

## 背景

真实批次执行时，前端只显示 `running`，但长时间 LLM 请求期间没有阶段反馈，用户会误以为界面卡死。

## 改动

- 批次模式透传 `agent_started`、`agent_failed`、`artifact_created`、`gate_updated` 等真实 Gateway 事件。
- 文本改编 Agent 内部新增阶段打点：分类切分、校验、旁白轻改写、分片处理、合并。
- 工作台批次面板新增后台心跳、当前章节/角色/阶段和最近活动流。
- 前端用最近 Gateway 事件时间判断“后台活跃 / 模型处理中 / 长时间无更新”，减少静止等待感。
- 更新 Gateway 执行桥接协议，明确批次事件用于真实状态展示，不使用脱离后台的假进度。

## 验证

- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npx vitest run oct-gateway/test/classificationParser.test.js oct-gateway/test/classifiedMerger.test.js oct-gateway/test/basicQCChecker.test.js`
