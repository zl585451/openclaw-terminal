# 内容创作入口

## 定位

内容创作入口用于从 Chat 或独立面板创建内容制作任务。它不直接暴露 Agent 编排，而是先让用户明确任务目标。

## 入口类型

1. Chat/AMY 入口
   用户上传文件或表达创作需求后，系统提示创建内容制作任务。因为已有上下文，创建面板可以预填素材、目标和要求。
2. 主动入口
   用户点击 `内容创作` 后进入任务大厅，再从新建任务向导开始创建。因为没有上下文，必须先确认素材，再确认执行方案。

## 当前前端状态

当前创建向导仍保留部分前端原型能力，但第一个“确认素材”页已经接入 Gateway intake 状态机：

1. `任务大厅`
   展示新建任务、继续样章工作台和可用任务类型。
2. `创建任务向导`
   采用三段确认流程：第一步确认素材和章节范围，并由 `scriptAdapter.intake.start` 返回真实 `system/rule` 步骤状态；第二步只确认工作目标和处理范围，确认后通过 `scriptAdapter.analysis.start` 启动真实业务分析 Agent；第三步在业务分析 Agent 输出证据后确认修改方向和交付清单，再通过 `scriptAdapter.production.handoff` 生成制作执行合同和队列预览。
3. `任务工作台`
   进入内容制作工作台，展示开工确认、执行进度和完成后的交付窗口。

## 创建入口规则

1. Chat/AMY 入口可以预填素材和任务要求，但仍然必须经过素材、目标范围和修改方向三个确认闸门。
2. 主动入口没有上下文，所以第一步必须让用户提交或选择素材。
3. 素材确认后只生成素材摄入结果和任务草案，不直接执行改写；第 1 步不得把规则处理伪装成 Agent 队列。
4. 第 2 步只确认“要做成什么”和“处理哪一段”，不确认改稿深度；确认后才启动 `agent.business_analysis@1.0`。
5. 第 3 步由业务分析 Agent 驱动，才确认“怎么改、改多深、生成哪些交付物”。
6. 执行确认后先生成制作执行合同并进入制作工作台；制作 Agent 仍需在工作台开工页确认后才真正启动。
7. 两种入口最终都应产生同一套 `SourceDocument`、`TaskBrief`、`AgentPlan` 和 `ExecutionGate` 对象。

## 后续接入点

1. 上传文件解析。
2. 文本粘贴和已有文档选择。
3. 创建任务 schema。
4. ExecutionGate 状态机。
5. Gateway 执行任务。
   - 开工确认书可传 `sourceText` 到 Gateway；开关与专用端点可用顶层 `SCRIPT_ADAPTER_*` 或 `config.json` 嵌套 `scriptAdapter`（运行时读 `config.scriptAdapter`）。
   - Week 5 起，`adapter.audiobook_text_rewriter@1.0`、`classifier.voice_role_marker@1.0`、`designer.performance_audio@1.0`、`reviewer.production_quality@1.0` 可按 `SCRIPT_ADAPTER_REAL_AGENTS` 走真实 LLM；`packager.content_delivery@1.0` 固定为纯 JS 收口，不调 LLM。
   - 任一真实 Agent 失败时不得静默回退成 mock 产物；真实模式下失败必须暴露为失败状态，避免用户误判交付可信度。
   - Week 4 Track 1：可从 AI.library 书库选章经 **Electron `window.electronAPI.library.*`** 填入 `sourceText`（不经 Gateway）。详见 `docs/02_architecture/script-adapter-gateway-protocol.md` 与 `docs/05_changelog/` 下相关 changelog。
   - P0 起，批次执行通过 Gateway 维护运行中订阅表；主进程 WebSocket 重连后会自动补订阅正在执行的批次，避免进度事件在断线后静默丢失。
   - `quality_review` 改为非阻塞预览卡，不再要求“批准继续制作”才能完成当前章。
6. 任务持久化和最近任务列表。
   - P0 起，单次执行历史落盘到 SQLite；Gateway 重启会把未完成 run 恢复为 `interrupted`。
