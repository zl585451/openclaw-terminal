# 内容创作入口

## 定位

内容创作入口用于从 Chat 或独立面板创建内容制作任务。它不直接暴露 Agent 编排，而是先让用户明确任务目标。

## 入口类型

1. Chat/AMY 入口
   用户上传文件或表达创作需求后，系统提示创建内容制作任务。因为已有上下文，创建面板可以预填素材、目标和要求。
2. 主动入口
   用户点击 `内容创作` 后进入任务大厅，再从新建任务向导开始创建。因为没有上下文，必须先确认素材，再确认执行方案。

## 当前前端状态

当前实现为 mock UI：

1. `任务大厅`
   展示新建任务、继续样章工作台和可用任务类型。
2. `创建任务向导`
   采用三段确认流程：第一步确认素材和章节范围；第二步只确认工作目标和处理范围；第三步在业务分析 Agent 输出证据后确认修改方向、交付清单和制作队列。
3. `任务工作台`
   进入内容制作工作台，展示开工确认、执行进度和完成后的交付窗口。

## 创建入口规则

1. Chat/AMY 入口可以预填素材和任务要求，但仍然必须经过素材、目标范围和修改方向三个确认闸门。
2. 主动入口没有上下文，所以第一步必须让用户提交或选择素材。
3. 素材确认后只生成任务草案和 Agent 预分配，不直接执行改写；第 1 步默认不把 Agent 队列作为用户主视图。
4. 第 2 步由 `task.intake_planner@1.0` 驱动，只确认“要做成什么”和“处理哪一段”，不确认改稿深度。
5. 第 3 步由业务分析 Agent 驱动，才确认“怎么改、改多深、生成哪些交付物”。
6. 执行确认后才进入制作工作台和 Agent 队列。
7. 两种入口最终都应产生同一套 `SourceDocument`、`TaskBrief`、`AgentPlan` 和 `ExecutionGate` 对象。

## 后续接入点

1. 上传文件解析。
2. 文本粘贴和已有文档选择。
3. 创建任务 schema。
4. ExecutionGate 状态机。
5. Gateway 执行任务。
   - 开工确认书可传 `sourceText` 到 Gateway；开关与专用端点可用顶层 `SCRIPT_ADAPTER_*` 或 `config.json` 嵌套 `scriptAdapter`（运行时读 `config.scriptAdapter`）。
   - Week 5 起，`adapter.audiobook_text_rewriter@1.0`、`classifier.voice_role_marker@1.0`、`designer.performance_audio@1.0`、`reviewer.production_quality@1.0` 可按 `SCRIPT_ADAPTER_REAL_AGENTS` 走真实 LLM；`packager.content_delivery@1.0` 固定为纯 JS 收口，不调 LLM。
   - 任一真实 Agent 失败时 dispatcher 必须回退占位产物，不让 pipeline 中断；前端执行页会以红色边条标识失败产物，并允许继续复制 JSON / 查看交付预览。
   - Week 4 Track 1：可从 AI.library 书库选章经 **Electron `window.electronAPI.library.*`** 填入 `sourceText`（不经 Gateway）。详见 `docs/02_architecture/script-adapter-gateway-protocol.md` 与 `docs/05_changelog/` 下相关 changelog。
6. 任务持久化和最近任务列表。
