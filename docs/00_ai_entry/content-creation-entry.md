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
   采用双确认流程：第一步确认素材参数和 Agent 预分配，第二步确认目标产物、处理范围、本轮目标、特别要求和 Agent 团队结构。
3. `任务工作台`
   进入内容制作工作台，展示 AI 初读分析、原文依据、建议改法和执行方向。

## 双确认入口规则

1. Chat/AMY 入口可以预填素材和任务要求，但仍然必须经过两个确认闸门。
2. 主动入口没有上下文，所以第一步必须让用户提交或选择素材。
3. 素材确认后只生成任务草案和 Agent 预分配，不直接执行改写。
4. 执行确认后才进入 AI 初读分析。
5. 两种入口最终都应产生同一套 `SourceDocument`、`TaskBrief`、`AgentPlan` 和 `ExecutionGate` 对象。

## 后续接入点

1. 上传文件解析。
2. 文本粘贴和已有文档选择。
3. 创建任务 schema。
4. ExecutionGate 状态机。
5. Gateway 执行任务。
   - 开工确认书可传 `sourceText` 到 Gateway；开关与专用端点可用顶层 `SCRIPT_ADAPTER_*` 或 `config.json` 嵌套 `scriptAdapter`（运行时读 `config.scriptAdapter`）。首个 Agent 可走真实 LLM 时，后续四个 mock 会读取已产出的 `adapted_script` 对齐 speaker 与 `segmentId`。详见 `docs/02_architecture/script-adapter-gateway-protocol.md` 与 `docs/05_changelog/` 下 Track 1 相关 changelog。
6. 任务持久化和最近任务列表。
