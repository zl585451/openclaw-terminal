# 内容创作 Agent 分层与确认闸门

## 文档状态

- 版本：v1.1
- 状态：已定版，作为下一阶段后台业务逻辑设计起点
- 范围：内容创作多 Agent 系统，不局限于有声书

---

## 1. 设计目标

内容创作系统不应把所有 Agent 放在同一个平面里直接调度。

更合理的结构是：

1. 通用基础 Agent 先处理素材和任务理解。
2. 目标产物 Agent 团队再处理具体创作任务。
3. 人工确认闸门决定是否进入下一阶段。

这样可以同时支持多人演播有声书、广播剧、短剧脚本和其他未来内容制作团队。

---

## 2. Agent 分层

### 2.1 通用基础层

负责所有内容创作任务都会遇到的问题。

代表 Agent：

1. 文件解析 Agent
2. 内容识别 Agent
3. 章节识别 Agent
4. 任务安排初步分析 Agent：`task.intake_planner@1.0`
5. 任务摘要 Agent
6. 冲突检测 Agent

输出对象：

1. `RawAsset`
2. `SourceDocument`
3. `SourceProfile`
4. `IntakeReport`
5. `TaskDraft`
6. `AgentPreAllocation`
7. `TaskBrief`
8. `ExecutionBoundary`

### 2.2 产物团队层

负责某一类目标产物的专业制作。

当前团队：

1. 多人演播有声书 Agent 团队

未来团队：

1. 广播剧 Agent 团队
2. 短剧脚本 Agent 团队
3. 作品分析 Agent 团队
4. 漫画分镜 Agent 团队

输出对象：

1. `AgentPlan`
2. 阶段产物
3. 交付包

### 2.3 统筹确认层

负责把 AI 自动判断交给人确认。

代表能力：

1. 素材确认
2. 执行方案确认
3. 初读分析确认
4. 改编方向确认
5. 质检确认

输出对象：

1. `ExecutionGate`
2. `ReviewDecision`
3. `RevisionRequest`

---

## 3. 创建任务阶段的两个闸门

### 3.1 素材确认闸门

触发时机：

1. 用户上传、粘贴或选择已有文档后。

系统动作：

1. 保存原始文件为 `RawAsset`。
2. 抽取、清洗和标准化文本，生成 `SourceDocument`。
3. 建立章节、段落和轻量索引，生成 `SourceProfile`。
4. 调用 `task.intake_planner@1.0`。
5. 生成 `IntakeReport`、`TaskDraft`、`AgentPreAllocation` 和 `IntakeWarnings`。

用户确认后：

1. 素材进入任务草案。
2. 初步分析结果回填第 2 步规划面板。
3. 系统允许用户确认目标产物、处理范围和本轮要求。

### 3.2 执行确认闸门

触发时机：

1. 用户选择目标产物、处理范围和本轮要求后。

系统动作：

1. 生成任务摘要。
2. 检查冲突。
3. 生成 Agent 团队结构。

用户确认后：

1. 锁定本轮执行方案。
2. 进入业务分析 Agent。

---

## 4. 后台调度原则

1. 未通过确认闸门的内容只保存为草稿，不进入正式执行队列。
2. Agent 预分配不等于 Agent 已执行。
3. AgentPlan 必须由用户确认后的任务摘要生成。
4. 任何会改变剧情事实、产物类型或执行范围的要求，都必须回到确认闸门。
5. 后台应记录每次确认时的快照，方便回看、追责和版本比较。
6. 任务安排初步分析 Agent 必须保持轻量，不能代替第二步之后的业务分析 Agent。

---

## 5. 下一阶段建议

下一步优先设计以下内容：

1. 任务创建 API 的请求和响应 schema。
2. 文件解析和 SourceProfile 的 mock 服务。
3. Agent 注册表，区分通用 Agent 和产物团队 Agent。
4. ExecutionGate 的状态机。
5. 创建任务 UI 和 Gateway 的最小闭环。

---

## 6. 当前实现备注（P0）

1. `quality_review` Gate 已从展示性文案升级为真实运行期闸门。
2. 章运行到 Gate 后会写入持久化层，`chapter_runs.status` 进入 `awaiting_review`，批次循环暂停。
3. 人工批准后，同一章会基于已保存的 `sheet` 继续执行剩余 Agent，而不是从头丢失上下文。
4. Gateway 断线重连场景下，批次事件通过订阅表补投递；单次运行和 Gate 决策都写入 SQLite，支持重启恢复与追踪。
