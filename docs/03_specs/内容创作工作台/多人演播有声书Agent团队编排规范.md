# 多人演播有声书 Agent 团队编排规范

## 文档状态

- 版本：v1.0
- 状态：MVP 定版草案，作为小说改编多人演播有声书第一条真实执行链路的团队模板
- 团队模板 ID：`audiobook_multicast.v1`
- 生效范围：内容创作工作台、多人演播有声书样章制作、后续 Gateway mock 执行链路
- 修订原则：先串行跑通，再扩展并行；先稳定产物，再优化效率

---

## 1. 团队定位

多人演播有声书 Agent 团队负责把小说正文加工成可供多人演播制作使用的样章台本和制作说明。

当前 MVP 目标：

`小说原文 -> AI 初读分析 -> 用户确认策略 -> 口语化台本 -> 角色音标注 -> 演播设计 -> 质检报告 -> 交付包`

本团队不负责：

1. 大纲重写。
2. 影视化改编。
3. 最终 CV 商务分配。
4. 录音棚工程混音。
5. 成片音频生成。

---

## 2. 适用条件

### 2.1 适用素材

适合进入本团队的素材：

1. 小说正文。
2. 有章节结构的长篇叙事文本。
3. 旁白和对白混合的剧情文本。
4. 悬疑、刑侦、都市、现实向小说优先。

### 2.2 不适用素材

不建议默认进入本团队的素材：

1. 论文。
2. 新闻稿。
3. 演讲稿。
4. 课程稿。
5. 纯访谈稿。
6. 无叙事结构的资料汇编。

如果用户强行选择，应先触发冲突确认，不得直接进入正式制作。

---

## 3. 默认执行链

MVP 默认串行执行：

```text
parser.source_document@1.0
  -> task.intake_planner@1.0
  -> business.content_analyzer@1.0
  -> 用户确认修改策略
  -> orchestrator.content_task@1.0
  -> adapter.audiobook_text_rewriter@1.0
  -> classifier.voice_role_marker@1.0
  -> designer.performance_audio@1.0
  -> reviewer.production_quality@1.0
  -> packager.content_delivery@1.0
```

说明：

1. `parser.source_document@1.0` 可以先由普通解析服务或 mock 服务承接。
2. `orchestrator.content_task@1.0` 可以先由 Gateway 规则逻辑承接。
3. `packager.content_delivery@1.0` MVP 阶段可以只生成结构化交付清单，不要求真实导出文件。

---

## 4. 团队成员

### 4.1 素材解析 Agent

- Agent ID：`parser.source_document@1.0`
- 用户展示名：文件解析员
- 定位：基础服务 / 通用 Agent

职责：

1. 抽取文本。
2. 清洗格式。
3. 识别章节、段落和基础结构。
4. 生成 `SourceDocument` 和 `SourceProfile`。

输入：

1. `RawAsset`

输出：

1. `SourceDocument`
2. `SourceProfile`

不负责：

1. 判断改编策略。
2. 改写正文。
3. 生成演播标注。

---

### 4.2 任务安排初步分析 Agent

- Agent ID：`task.intake_planner@1.0`
- 用户展示名：任务安排员
- 定位：任务安排 Agent
- 规则文档：`任务安排初步分析Agent规则.md`

职责：

1. 判断素材类型和结构特征。
2. 推荐目标产物。
3. 推荐处理范围。
4. 生成 Agent 预分配。

输入：

1. `RawAsset`
2. `SourceDocument`
3. `SourceProfile`
4. 用户入口初始目标

输出：

1. `IntakeReport`
2. `TaskDraft`
3. `AgentPreAllocation`
4. `IntakeWarnings`

不负责：

1. 深度剧情分析。
2. 生成修改策略。
3. 正式改写文本。

---

### 4.3 AI 初读分析 Agent

- Agent ID：`business.content_analyzer@1.0`
- 用户展示名：作品分析师
- 定位：业务分析 Agent

职责：

1. 阅读用户确认的目标范围。
2. 分析当前文本问题。
3. 提取问题证据。
4. 给出可选修改策略。
5. 推荐默认策略。
6. 说明后续 Agent 和产物影响。

输入：

1. `SourceDocument`
2. `SourceProfile`
3. `TaskBrief`
4. `OutputTarget`
5. `WorkScope`

输出：

1. `AnalysisReport`
2. `ModificationStrategyOptions`
3. `ExecutionImpact`

不负责：

1. 直接改稿。
2. 做最终角色音绑定。
3. 输出完整演播设计。

人工闸门：

1. 输出后进入 `strategy_confirmation`。
2. 用户确认修改策略后，才能进入正式制作队列。

---

### 4.4 任务编排 Agent

- Agent ID：`orchestrator.content_task@1.0`
- 用户展示名：制作统筹
- 定位：编排 Agent / Gateway 规则层

职责：

1. 根据用户确认策略生成 `AgentExecutionPlan`。
2. 锁定本轮任务执行单。
3. 生成开工确认书。
4. 为每个生产 Agent 生成 `AgentWorkPacket`。

输入：

1. `TaskBrief`
2. `OutputTarget`
3. `WorkScope`
4. `AnalysisReport`
5. `ModificationStrategy`
6. `ExecutionBoundary`

输出：

1. `AgentExecutionPlan`
2. `TaskExecutionSheet`
3. `ReviewGate[]`

不负责：

1. 亲自改稿。
2. 亲自质检。
3. 替用户跳过确认。

---

### 4.5 文本改编 Agent

- Agent ID：`adapter.audiobook_text_rewriter@1.0`
- 用户展示名：文本改编师
- 定位：生产 Agent
- 规则文档：`多人演播有声小说改编规则.md`

职责：

1. 将书面小说改成更适合口播的文本。
2. 优化旁白听感。
3. 优化对白可演性。
4. 保留剧情、人物关系、线索和悬念顺序。
5. 输出可供后续角色音标注的改编台本。

输入：

1. `SourceDocument`
2. `WorkScope`
3. `AnalysisReport`
4. `ModificationStrategy`
5. `ExecutionBoundary`
6. `PlotLock`

输出：

1. `AdaptedScript`
2. `RewriteNotes`
3. `RiskFlags`

必须遵守：

1. 只改表达，不改事实。
2. 只改听感，不改结构。
3. 不提前解释悬疑。
4. 不创造关键新剧情。

---

### 4.6 角色音标注 Agent

- Agent ID：`classifier.voice_role_marker@1.0`
- 用户展示名：角色音统筹
- 定位：生产 Agent
- 规则文档：`多人演播角色音分类标注规则.md`

职责：

1. 区分旁白、明确角色对白、未定来源角色音、功能性声音、群像声音和转述性语音化内容。
2. 为未确认声音建立稳定占位。
3. 标注 `已确认`、`待确认`、`独立占位`、`可回绑`、`可兼配` 等状态。
4. 输出剧组统筹可使用的角色音结构。

输入：

1. `AdaptedScript`
2. `SourceDocument`
3. `CharacterProfile` 或 `CharacterCandidateList`
4. `ExecutionBoundary`

输出：

1. `VoiceRegistry`
2. `VoiceRoleMarkers`
3. `UnresolvedVoiceList`

必须遵守：

1. 未确认来源声音不得强行归旁白。
2. 未确认声音优先占位。
3. 单章模式默认保守判断。
4. 可回绑信息必须保留。

人工闸门：

1. 如果存在高风险未定角色音，应生成 `voice_role_confirmation`。

---

### 4.7 演播设计 Agent

- Agent ID：`designer.performance_audio@1.0`
- 用户展示名：演播设计师
- 定位：生产 Agent
- 规则文档：`多人演播演播设计规则.md`

职责：

1. 补充 BGM 状态。
2. 补充 SFX / AMB 音效建议。
3. 标注 CV 情绪强度。
4. 标注气息、停顿、重音和动作感。
5. 给出声场和转场建议。

输入：

1. `AdaptedScript`
2. `VoiceRegistry`
3. `WorkScope`
4. `ExecutionBoundary`

输出：

1. `PerformanceDesign`
2. `AudioCueList`
3. `CvDirectionNotes`

必须遵守：

1. 演播设计只做增强，不改正文。
2. 不用音乐或音效暗示未揭示真相。
3. 标注必须克制、清楚、可执行。

---

### 4.8 质检 Agent

- Agent ID：`reviewer.production_quality@1.0`
- 用户展示名：质检审校
- 定位：审核 Agent
- 规则文档：`多人演播质检规则.md`

职责：

1. 对照原文检查改编是否失真。
2. 检查角色音标注是否合理。
3. 检查演播设计是否越权或过密。
4. 输出问题等级、位置、原因和返工建议。
5. 给出通过、修改后通过或打回重做结论。

输入：

1. `SourceDocument`
2. `AdaptedScript`
3. `VoiceRegistry`
4. `PerformanceDesign`
5. `ExecutionBoundary`

输出：

1. `ReviewReport`
2. `IssueList`
3. `ReviewConclusion`

人工闸门：

1. P0 必须打回。
2. P1 必须等待用户或统筹确认后再进入下一步。
3. 通过后才能进入打包交付。

---

### 4.9 打包交付 Agent

- Agent ID：`packager.content_delivery@1.0`
- 用户展示名：交付打包员
- 定位：交付 Agent

职责：

1. 汇总本轮产物。
2. 整理交付清单。
3. 输出剧组可读的最终包结构。
4. 记录版本、范围和复核状态。

输入：

1. `AdaptedScript`
2. `VoiceRegistry`
3. `PerformanceDesign`
4. `ReviewReport`

输出：

1. `FinalPackage`
2. `DeliveryManifest`

MVP 阶段：

1. 可以先只输出结构化预览。
2. 不要求真实导出 docx、xlsx 或 zip。

---

## 5. 关键产物

### 5.1 `PlotLock`

剧情锁定表。

建议包含：

1. 角色名单。
2. 时间地点。
3. 关键事件。
4. 关键线索。
5. 伏笔与保密点。
6. 不可改信息。

MVP 阶段可由 `business.content_analyzer@1.0` 生成轻量版本。

### 5.2 `AdaptedScript`

口语化改编台本。

建议包含：

1. 场景 ID。
2. 段落 ID。
3. 旁白文本。
4. 角色对白。
5. 改写说明。
6. 原文引用。

### 5.3 `VoiceRegistry`

角色音注册表。

建议包含：

1. 声音 ID。
2. 声音分类。
3. 显示名。
4. 归属状态。
5. 回绑候选。
6. 统筹提示。

### 5.4 `PerformanceDesign`

演播设计稿。

建议包含：

1. 场景声场。
2. BGM 状态。
3. 音效提示。
4. CV 情绪。
5. 气息和停顿。
6. 转场提示。

### 5.5 `ReviewReport`

质检报告。

建议包含：

1. 结论。
2. 评分。
3. P0 / P1 / P2 问题清单。
4. 返工建议。
5. 是否允许交付。

---

## 6. 确认闸门

### 6.1 素材确认

- Gate：`source_confirmation`
- 发生在：文件解析和轻量识别后
- 用户确认：素材、字数、章节、素材类型
- 通过后：允许生成 `TaskDraft`

### 6.2 目标范围确认

- Gate：`target_scope_confirmation`
- 发生在：任务安排初步分析后
- 用户确认：目标产物和处理范围
- 通过后：允许进入 AI 初读分析

### 6.3 修改策略确认

- Gate：`strategy_confirmation`
- 发生在：AI 初读分析后
- 用户确认：怎么改、改多深、调用哪些生产 Agent
- 通过后：允许生成开工确认书和执行队列

### 6.4 角色音复核

- Gate：`voice_role_confirmation`
- 发生在：角色音标注后
- 触发条件：存在高风险未定角色音、关键角色占位或跨章回绑冲突
- 用户确认：保留占位、人工指定、延后确认

### 6.5 质检确认

- Gate：`quality_review_confirmation`
- 发生在：质检完成后
- 用户确认：通过、局部返工、打回重做

---

## 7. 并行策略

### 7.1 MVP 默认不并行改稿

MVP 阶段不并行执行以下 Agent：

1. 文本改编 Agent。
2. 角色音标注 Agent。
3. 演播设计 Agent。
4. 质检 Agent。

原因：

1. 下游强依赖上游产物。
2. 当前优先跑通闭环。
3. 避免多个 Agent 同时影响同一正文。

### 7.2 可轻并行的候选任务

后续可以并行的辅助任务：

1. 角色候选抽取。
2. 章节摘要。
3. 风险扫描。
4. 证据片段整理。
5. 术语标准化。

这些任务只能输出候选和分析，不直接改正文。

---

## 8. 失败与返工

### 8.1 失败类型

常见失败：

1. 输入产物缺失。
2. 输出格式不合法。
3. 触发执行边界冲突。
4. 质检发现 P0。
5. 用户要求修改方向。

### 8.2 处理方式

1. 输入缺失：回到上游补产物。
2. 输出格式不合法：同 Agent 重试。
3. 边界冲突：进入人工确认。
4. P0 问题：打回对应生产 Agent。
5. 用户修改方向：重新生成 `ModificationStrategy` 和 `AgentExecutionPlan`。

### 8.3 局部重跑

局部重跑必须保留：

1. 原始输入快照。
2. 上一次输出产物。
3. 返工原因。
4. 新版本号。

不得覆盖旧产物。

---

## 9. UI 映射

面向用户的开工确认书不展示技术字段。

用户可见团队：

1. 文本改编师
2. 角色音统筹
3. 演播设计师
4. 质检审校
5. 交付打包员

用户可见交付：

1. 多人演播样章台本
2. 角色音标注表
3. 演播设计提示
4. 质检问题清单
5. 制作交付包

用户可见保护条款：

1. 不改核心剧情。
2. 不提前解释悬疑。
3. 不把未定角色音强行归旁白。
4. 需要确认的地方会停下来问用户。

技术细节默认折叠：

1. Agent ID。
2. 输入产物。
3. 输出产物。
4. 规则文档。
5. 运行状态。

---

## 10. MVP 验收标准

第一阶段跑通后，应至少满足：

1. 用户能从创建任务进入开工确认书。
2. 系统能生成 `AgentExecutionPlan`。
3. 每个 Agent 都有明确输入和输出。
4. 每个阶段都能生成结构化 mock 产物。
5. 质检能输出通过、修改后通过或打回重做。
6. 前端能展示团队成员、交付清单和保护条款。
7. 技术细节能追溯 Agent ID 和产物链路。

---

## 11. 后续扩展

### 11.1 单章模式升级到跨章模式

跨章模式需要补充：

1. 跨章角色库。
2. 占位声音回绑。
3. 伏笔追踪。
4. 长篇一致性质检。

### 11.2 有声书升级到广播剧

广播剧不能直接复用本模板，需要独立团队模板。

可复用：

1. 素材解析。
2. AI 初读分析。
3. 角色抽取。
4. 质检基础能力。

需独立：

1. 场景戏剧化。
2. 对白重构。
3. 冲突强化。
4. 分集节奏。
5. 广播剧演播设计。

### 11.3 图书馆模块复用

图书馆模块可复用：

1. `parser.source_document@1.0`
2. 章节识别能力。
3. 角色候选抽取能力。
4. 作品画像能力。
5. 基础检索和摘要能力。

图书馆模块不应默认调用：

1. `adapter.audiobook_text_rewriter@1.0`
2. `designer.performance_audio@1.0`
3. `packager.content_delivery@1.0`

除非用户明确创建内容制作任务并通过确认闸门。
