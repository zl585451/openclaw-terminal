# FEATURE_MAP.md — OCT 项目功能活地图（轻量索引）

> **维护规则**：每次新增/修改功能后，必须更新对应详情文件，然后在此添加标题索引。  
> **最后更新**：2026-03-20 by AMY（按 Claude 方案重构）

---

## 阅读说明

- 此文件只保留**功能标题索引**（约 41 行）
- 详细内容在 `docs/feature-map/xxx.md`
- 每个详情文件包含：做什么、文件、调用链、写到哪、验证方法、状态

---

## 第一层：基础设施

- [1.1 Gateway WebSocket 服务器](docs/feature-map/gateway-websocket.md)
- [1.2 AI 对话引擎](docs/feature-map/ai-engine.md)
- [1.3 System Prompt 加载](docs/feature-map/system-prompt.md)
- [1.4 会话管理](docs/feature-map/session-management.md)
- [1.5 配置系统](docs/feature-map/config-system.md)
- [1.6 Nocturne 记忆后端](docs/feature-map/nocturne-backend.md)

---

## 第二层：对话后自动处理管线

- [2.1 对话历史保存](docs/feature-map/history-save.md)
- [2.2 自我评估评分](docs/feature-map/self-eval.md)
- [2.3 模式提炼（规则学习）](docs/feature-map/pattern-distill.md)
- [2.4 用户反馈检测](docs/feature-map/feedback-detect.md)
- [2.5 停车场待办检测](docs/feature-map/parking-detect.md)
- [2.6 自动记忆提炼](docs/feature-map/memory-extract.md)
- [2.7 追问偏好学习](docs/feature-map/clarification-memory.md)

---

## 第三层：前置思考管线

- [3.1 假设生成（Hypothesis）](docs/feature-map/hypothesis.md)

---

## 第四层：记忆搜索与启动加载

- [4.1 记忆搜索](docs/feature-map/memory-search.md)
- [4.2 启动反馈加载](docs/feature-map/boot-feedback.md)
- [4.3 历史清理](docs/feature-map/history-cleanup.md)

---

## 第五层：图片与文件处理

- [5.1 图片分析](docs/feature-map/image-analysis.md)
- [5.2 文件上传优化](docs/feature-map/file-upload.md)

---

## 第六层：Slash 命令

- [Slash 命令列表](docs/feature-map/slash-commands.md)

---

## 第七层：Electron 桌面应用

- [7.1 Nocturne 后端管理](docs/feature-map/electron-nocturne.md)
- [7.2 本地任务系统](docs/feature-map/electron-tasks.md)
- [7.3 授权验证](docs/feature-map/electron-license.md)
- [7.4 会话状态持久化](docs/feature-map/electron-session.md)
- [7.5 Gateway 日志面板](docs/feature-map/electron-logpanel.md)

---

## 第八层：提示词系统

- [提示词文件说明](docs/feature-map/prompts-system.md)

---

## 第九层：工具系统

- [9.1 内置工具](docs/feature-map/tools.md)
- [9.2 权限检查](docs/feature-map/permission-check.md)

---

## 更新日志

| 日期 | 内容 | 来源 |
|------|------|------|
| 2026-03-20 | 按 Claude 方案重构：轻量索引 + 多详情文件 | 系统升级 |
| 2026-03-20 | 文件上传优化（大文件只传元数据） | 功能更新 |
