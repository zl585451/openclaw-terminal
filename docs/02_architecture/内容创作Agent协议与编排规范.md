# 内容创作 Agent 协议与编排规范

## 文档状态

- 版本：v1.0
- 状态：架构定版草案，作为内容创作工作台接入 Gateway 和真实 Agent 执行前的协议基线
- 生效范围：内容创作工作台、内容制作多 Agent 平台、后续 Gateway 执行状态机
- 修订原则：先稳定对象和闸门，再扩展并行、工具和团队模板

---

## 1. 文档目的

本文档用于定义内容创作多 Agent 系统的通用协议。

它不规定某个 Agent 如何改稿，而是规定：

1. Agent 如何注册。
2. Agent 拿到什么上下文。
3. Agent 输出什么结构化产物。
4. Agent 之间如何交接。
5. 哪些节点需要人工确认。
6. Gateway 如何驱动任务状态流转。

一句话：

`业务规则定义 Agent 怎么做事，编排协议定义 Agent 怎么协作。`

---

## 2. 核心原则

### 2.1 Agent 不共享大上下文

每个 Agent 应拿到最小必要工作包，而不是共享整个对话历史、整本书全文或所有上游中间结果。

这样做的目的：

1. 降低上下文污染。
2. 让 Agent 输出更稳定。
3. 方便失败重跑。
4. 方便后续并行执行。

### 2.2 产物优先

系统不以“Agent 回复了一段话”为主要结果，而以结构化产物为主要结果。

每次 Agent 执行至少应生成一个 `ArtifactEnvelope`。

### 2.3 闸门优先于执行

未通过人工确认闸门的任务，不允许进入会改动正文、生成正式交付物或产生长期项目影响的 Agent。

### 2.4 不确定性是一等数据

内容创作中常见的 `待确认`、`独立占位`、`可回绑`、`低置信度候选`、`需人工确认` 必须作为结构化字段保存，不应只写在备注里。

### 2.5 平台协议和团队模板分离

平台协议只负责通用调度。

团队模板负责定义某类任务的具体 Agent 队列，例如多人演播有声书、广播剧、短剧脚本。

---

## 3. Agent 注册表

每个可被编排的 Agent 都必须注册为 `AgentDefinition`。

建议字段：

```json
{
  "agent_id": "adapter.audiobook_text_rewriter@1.0",
  "display_name": "文本改编师",
  "layer": "production_team",
  "team_templates": ["audiobook_multicast.v1"],
  "responsibility": "把原文改成适合多人演播的口语化台本。",
  "input_artifacts": ["source_document", "work_scope", "modification_strategy", "plot_lock"],
  "output_artifacts": ["adapted_script"],
  "allowed_actions": ["rewrite_expression", "split_long_sentence", "clarify_reference"],
  "blocked_actions": ["change_plot", "reveal_hidden_truth", "create_key_character"],
  "tool_permissions": ["read_artifact", "write_artifact"],
  "requires_gate_before_run": true,
  "requires_gate_after_run": false,
  "can_run_parallel": false,
  "rule_docs": [
    "docs/03_specs/内容创作工作台/多人演播有声小说改编规则.md"
  ]
}
```

字段说明：

1. `agent_id`
   稳定 ID，格式建议为 `domain.capability@version`。
2. `display_name`
   面向用户或统筹展示的名称。
3. `layer`
   可选值建议为 `intake`、`analysis`、`production_team`、`review`、`delivery`。
4. `team_templates`
   该 Agent 可参与的团队模板。
5. `input_artifacts`
   必须存在的输入产物类型。
6. `output_artifacts`
   执行后必须生成的产物类型。
7. `allowed_actions`
   明确允许行为。
8. `blocked_actions`
   明确禁止行为。
9. `tool_permissions`
   可使用工具范围。
10. `requires_gate_before_run`
   执行前是否必须有人确认。
11. `requires_gate_after_run`
   输出后是否必须有人确认。
12. `can_run_parallel`
   是否允许和其他 Agent 同时执行。
13. `rule_docs`
   该 Agent 必须遵守的规则文档。

---

## 4. 团队模板协议

每条内容生产线应注册为 `TeamTemplate`。

建议字段：

```json
{
  "template_id": "audiobook_multicast.v1",
  "display_name": "多人演播有声书团队",
  "applicable_content_types": ["novel_body"],
  "applicable_targets": ["multicast_audiobook"],
  "default_scope_policy": "sample_first",
  "stages": [
    "analysis.initial_read",
    "production.text_adaptation",
    "production.voice_marking",
    "production.performance_design",
    "review.production_quality",
    "delivery.package"
  ],
  "required_gates": [
    "source_confirmation",
    "target_scope_confirmation",
    "strategy_confirmation",
    "quality_review_confirmation"
  ],
  "deliverables": [
    "adapted_script",
    "voice_registry",
    "performance_design",
    "review_report",
    "final_package"
  ]
}
```

团队模板必须回答：

1. 什么类型素材可以进入该团队。
2. 什么目标产物可以使用该团队。
3. 默认处理范围如何建议。
4. 需要哪些执行阶段。
5. 哪些闸门必须停下确认。
6. 最终交付哪些产物。

---

## 5. Agent 工作包

Gateway 不应直接把所有任务上下文塞给 Agent，而应生成 `AgentWorkPacket`。

建议字段：

```json
{
  "run_id": "run_001",
  "task_id": "task_001",
  "agent_id": "classifier.voice_role_marker@1.0",
  "team_template_id": "audiobook_multicast.v1",
  "stage_id": "production.voice_marking",
  "scope": {
    "source_id": "source_001",
    "chapter": "第1章",
    "range_label": "前半段"
  },
  "instructions": {
    "goal": "标注角色音、未定来源声音和旁白。",
    "must_preserve": ["不强行绑定未知声音", "保留可回绑占位"],
    "blocked_actions": ["改写正文", "决定最终 CV 分配"]
  },
  "input_artifact_refs": [
    "artifact_adapted_script_001",
    "artifact_character_profile_001"
  ],
  "rule_doc_refs": [
    "docs/03_specs/内容创作工作台/多人演播角色音分类标注规则.md"
  ],
  "expected_outputs": ["voice_registry"],
  "context_budget": {
    "include_full_source": false,
    "include_previous_outputs": true,
    "max_reference_chunks": 12
  }
}
```

工作包应遵守以下规则：

1. 只包含当前 Agent 必须使用的信息。
2. 必须引用输入产物，而不是复制全部历史。
3. 必须明确目标、边界和禁止行为。
4. 必须明确输出类型。
5. 必须记录规则文档引用。

---

## 6. 产物信封

每个 Agent 输出必须包装为 `ArtifactEnvelope`。

建议字段：

```json
{
  "artifact_id": "artifact_voice_registry_001",
  "task_id": "task_001",
  "run_id": "run_001",
  "artifact_type": "voice_registry",
  "producer_agent": "classifier.voice_role_marker@1.0",
  "source_artifact_refs": ["artifact_adapted_script_001"],
  "status": "ready",
  "confidence": "medium",
  "requires_review": true,
  "payload": {},
  "evidence_refs": [],
  "risk_flags": [
    {
      "level": "medium",
      "message": "存在未定来源角色音，需要统筹确认。"
    }
  ],
  "created_at": "2026-04-26T00:00:00+08:00"
}
```

`ArtifactEnvelope` 统一保存：

1. 产物类型。
2. 生产者。
3. 来源产物。
4. 状态。
5. 置信度。
6. 是否需要复核。
7. 结构化 payload。
8. 证据引用。
9. 风险标记。

---

## 7. 闸门协议

人工确认节点统一使用 `ReviewGate`。

建议字段：

```json
{
  "gate_id": "gate_strategy_confirmation_001",
  "task_id": "task_001",
  "gate_type": "strategy_confirmation",
  "status": "waiting_user",
  "required_before_stage": "production.text_adaptation",
  "summary": "确认修改策略后才能进入正式文本改编。",
  "confirmed_snapshot": null,
  "decision_options": [
    "approve",
    "revise",
    "cancel"
  ]
}
```

常见闸门：

1. `source_confirmation`
   确认素材和解析结果。
2. `target_scope_confirmation`
   确认目标产物和处理范围。
3. `strategy_confirmation`
   AI 初读后确认修改策略。
4. `voice_role_confirmation`
   确认未定角色音、占位和回绑建议。
5. `quality_review_confirmation`
   质检后确认是否通过、返工或打包。

闸门状态建议：

1. `draft`
2. `waiting_user`
3. `approved`
4. `revision_requested`
5. `cancelled`
6. `expired`

---

## 8. AgentRun 状态机

每次 Agent 执行记录为 `AgentRun`。

建议状态：

1. `queued`
   已进入队列。
2. `blocked_by_gate`
   等待人工确认。
3. `running`
   正在执行。
4. `succeeded`
   已成功输出产物。
5. `needs_review`
   成功输出，但需要人工复核。
6. `failed`
   执行失败。
7. `cancelled`
   被取消。
8. `retrying`
   正在重试。

状态流转：

```text
queued
  -> blocked_by_gate
  -> running
  -> succeeded
  -> needs_review
  -> queued(next)

running
  -> failed
  -> retrying
  -> running
```

规则：

1. `blocked_by_gate` 不得自动跳过。
2. `needs_review` 的产物可以被查看，但不能默认进入最终交付。
3. `failed` 必须保存错误原因和输入快照。
4. 重试必须基于同一个 `AgentWorkPacket` 或明确生成新版本工作包。

---

## 9. 编排状态机

任务级状态建议：

1. `draft`
   用户还在创建任务。
2. `source_confirmed`
   素材已确认。
3. `target_scope_confirmed`
   目标和范围已确认。
4. `analysis_ready`
   AI 初读分析已生成。
5. `strategy_confirmed`
   修改策略已确认。
6. `ready_to_run`
   开工确认书已生成。
7. `running`
   Agent 队列正在执行。
8. `waiting_review`
   等待人工复核。
9. `completed`
   已完成交付。
10. `failed`
   任务失败。
11. `cancelled`
   任务取消。

创建阶段状态流转：

```text
draft
  -> source_confirmed
  -> target_scope_confirmed
  -> analysis_ready
  -> strategy_confirmed
  -> ready_to_run
```

执行阶段状态流转：

```text
ready_to_run
  -> running
  -> waiting_review
  -> running
  -> completed
```

---

## 10. 串行与并行规则

### 10.1 MVP 默认串行

MVP 阶段默认串行执行，优先保证链路可解释和产物稳定。

串行适用场景：

1. 下游强依赖上游正文结果。
2. 会改动正文或生成正式交付物。
3. 输出需要人工确认后才能继续。

### 10.2 允许轻并行的任务

可并行任务应满足：

1. 不改正文。
2. 不写最终交付物。
3. 输出为分析、索引、证据或候选建议。
4. 互相之间不存在强依赖。

可并行候选：

1. 角色候选抽取。
2. 证据片段整理。
3. 风险扫描。
4. 章节结构识别。
5. 术语或人物名标准化。

### 10.3 禁止过早并行的任务

以下任务在 MVP 阶段不建议并行：

1. 文本改编和角色音标注。
2. 角色音标注和最终演播设计。
3. 演播设计和质检。
4. 会分别改动同一正文段落的两个 Agent。

---

## 11. Gateway 最小职责

Gateway 需要提供的最小能力：

1. 创建任务。
2. 保存 `RawAsset`、`SourceDocument`、`SourceProfile`。
3. 生成或保存 `TaskDraft`、`TaskBrief`、`AgentPlan`。
4. 创建 `ReviewGate`。
5. 根据 `AgentPlan` 生成 `AgentWorkPacket`。
6. 调用 Agent。
7. 保存 `AgentRun` 和 `ArtifactEnvelope`。
8. 返回任务状态。
9. 支持失败重试。
10. 支持人工确认后继续执行。

Gateway 不应把团队模板写死在代码里。

团队模板应优先以配置或注册表方式加载。

---

## 12. 和图书馆模块的关系

图书馆模块可以复用内容创作平台的部分基础 Agent，但不应复用所有生产 Agent。

建议边界：

1. 图书馆侧负责收集、入库、索引、检索和基础分析。
2. 内容创作侧负责确认任务、改编、演播设计、质检和交付。
3. 双方共享 `SourceDocument`、`SourceProfile`、`WorkProfile`、`CharacterProfile` 等基础对象。
4. 图书馆可调用通用分析 Agent，例如章节摘要、角色抽取、作品画像。
5. 图书馆不应直接调用文本改编 Agent 生成正式制作稿，除非用户进入内容创作任务流程并通过确认闸门。

这样可以避免重复造 Agent，也避免图书馆检索任务误触发深度改写。

---

## 13. 下一步落地建议

1. 先在前端 mock 层补齐接近真实的 TypeScript 类型。
2. 再实现一个本地 mock `AgentExecutionPlan` 生成器。
3. 再做 Gateway 任务状态接口。
4. 再接文件解析和 `SourceDocument` 持久化。
5. 最后接真实 Agent 调用。

不要先追求复杂并行。

第一阶段目标是让一条链稳定跑通：

`确认素材 -> 确认目标范围 -> AI 初读 -> 确认策略 -> 开工确认书 -> 文本改编 -> 角色音标注 -> 演播设计 -> 质检 -> 交付`
