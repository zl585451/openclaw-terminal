# OCT Memory Governor / 记忆管理 Agent 设计方案 v1

> 目标：在保留 Nocturne 作为记忆底座的前提下，给 OCT 补上一层“记忆治理系统”，避免长期使用后记忆库垃圾场化。  
> 适用范围：`oct-gateway/` 现有 Nocturne 接入链路、相关记忆注入、历史摘要、反馈闭环、偏好系统、自适应问答系统。  
> 当前状态：Phase 1 / 1.5 已落地，Phase 2 最小骨架已接入运行中。

---

## 1. 先说结论

现在的 OCT 记忆系统已经具备“会记”的能力：

- 会写历史摘要
- 会写反馈
- 会做自动记忆提炼
- 会做相关记忆搜索与注入
- 会加载偏好与追问规则

但还缺一层更关键的东西：

**它缺少“记忆治理”。**

所以我们下一阶段不应该继续往系统里堆“更多记忆功能”，而应该做一个：

**Memory Governor（记忆治理器）**

它的职责不是“多写一点记忆”，而是：

- 决定什么该写
- 决定写到哪一层
- 决定什么该进入当前上下文
- 决定什么该降级、归档、合并、清理

一句话：

**Nocturne 是记忆底座，Memory Governor 才是 OCT 的记忆操作系统。**

---

## 1.1 当前落地进度（2026-04-05）

这份文档最初是实施方案，现在已经进入“方案 + 已落地现状”阶段。

### 已完成

- `oct-gateway/memory_governor.js` 已建立并投入使用
- 写入前清洗已接入，CoT / think / redacted_thinking 会在记忆链路中被剥离
- 已接入 Governor 的入口：
  - `extractAndSaveMemory()`
  - `memory_history.js`
  - `memory_feedback.js`（已于 2026-05-25 删除）
  - `clarification_memory.js`
  - `tools/shared.js` 中的 `memory_write`
  - 相关记忆注入筛选
- `core://agent/review_queue/...` 已作为候选层启用
- `review_queue` 已有统一结构、保留时长、过期提示
- `review_queue_maintenance.js` 已可低频后台扫描并软过期弱候选
- `memory_management_agent.js` 已接入最小巡检骨架，可输出治理报告

### 已验证

- AI CoT / 内心 OS 不再写入相关记忆
- `memory_write` 的测试路径（如 `core://test/...`）已被 Governor 拦截
- 相关记忆注入已开始偏向：
  - `core://my_user/preferences/*`
  - `core://my_user/profile/*`
  - `project://*`
  - `core://agent/*`
  - `core://amy/*`

### 仍在继续

- 更强的 `promote / hold / reject` 规则
- review queue 的汇总报告和后续审查工作流
- Memory Management Agent 的进一步自治能力
- 后续 Dashboard / 审计视图

### 方案执行状态总览

| 阶段 | 状态 | 当前说明 |
|------|------|----------|
| Phase 1：Governor 核心接入 | ✅ 已完成 | 已统一接管历史摘要、反馈、自动提炼、追问偏好、`memory_write`、相关记忆注入筛选 |
| Phase 1.5：review queue 治理基础 | ✅ 已完成 | 已有标准候选结构、保留时长、过期提示、低频维护器 |
| Phase 2：分层与晋升规则强化 | 🟡 进行中 | 已有 `promote / hold / reject`、测试记忆拦截、长期命名空间保护，但规则仍在继续收紧 |
| Phase 3：后台治理 Agent | 🟡 已启动 | 已有 `memory_management_agent.js` 巡检骨架、热点统计、治理建议、digest 日志；尚未进入自动合并/降级/归档 |
| Phase 4：审计界面 / Dashboard | ⏳ 未开始 | 尚未做可视化 review、timeline、diff、rollback 操作界面 |

### 现在可以怎么理解

- **地基已经搭好了**：Governor、候选层、维护器、管理 Agent 雏形都已经在跑
- **核心目标已经开始生效**：不该直接进长期层的内容，开始会被拦、被 hold、被降权
- **还没到“全自动自治”**：现在更像“会治理的系统”，还不是“完整自治的记忆操作系统”

---

## 2. 为什么现在必须做

结合当前项目现状，问题已经不是理论上的：

### 2.1 已经出现的真实问题

- CoT / 内心 OS 混入相关记忆
- 历史摘要被当作高价值相关记忆注入
- 自动提炼与反馈、偏好、追问规则之间缺少统一治理
- 相关记忆命中了，但不一定值得注入
- 写入路径逐渐增多，但缺少“谁是稳定节点、谁是临时节点”的规则

### 2.2 当前系统的天然短板

现有写入入口很多，但治理入口几乎没有：

- `memory_history.saveHistorySummary()`
- `memory_feedback.detectAndSaveFeedback()`（已删除）
- `extractAndSaveMemory()`
- `clarification_memory.detectAndSaveClarification()`
- `memory_search.searchMemory()` 的结果注入

这些入口各自都“有道理”，但系统层面会出现：

- 重复写
- 写错层
- 注入过多
- 旧内容长期不清
- 同类记忆分散在不同路径下

所以如果不做治理层，系统会越来越像：

**能存很多东西，但越来越不知道该信哪条。**

---

## 3. 当前 OCT 记忆系统现状

基于当前仓库代码和现有接入情况，当前大致是这样：

### 3.1 已启用能力

- `read_memory`
- `create_memory`
- `update_memory`
- `delete_memory`
- `search_memory`

### 3.2 已接入的 OCT 侧记忆链路

- 启动加载核心记忆与反馈：`oct-gateway/ai.js`
- 相关记忆检索与注入：`oct-gateway/index.js`
- 对话历史摘要：`oct-gateway/memory_history.js`
- 用户反馈闭环：`oct-gateway/memory_feedback.js`（已删除）
- 自动记忆提炼：`oct-gateway/index.js` 中 `extractAndSaveMemory()`
- 追问偏好学习：`oct-gateway/clarification_memory.js`

### 3.3 尚未启用但值得参考的 Nocturne 能力

- `system://boot`
- `system://glossary`
- `add_alias`
- `manage_triggers`
- Dashboard / diff / 回滚能力

### 3.4 与记忆直接相关的 OCT 模块

- 自适应问答系统：`docs/01_system_prompts/adaptive-questioning-system.md`
- 追问偏好协议：`docs/01_system_prompts/CLARIFICATION_PROTOCOL.md`
- 用户偏好相关节点：`core://my_user/preferences/...`
- SOUL / IDENTITY / USER / MEMORY 提示词加载链

所以这不是一个“单纯的 memory_search 优化”问题。

这是一个：

**记忆、偏好、追问、反馈、上下文注入，已经开始互相耦合的系统治理问题。**

---

## 4. Memory Governor 的产品定义

### 4.1 它不是什么

它不是：

- 又一个聊天 Agent
- 又一个会写 memory 的工具
- 一个 UI 面板先行的大项目

### 4.2 它是什么

它是一个后台治理模块，负责四类动作：

1. `sanitize`：写入前清洗
2. `classify`：记忆分层与分类
3. `promote_or_hold`：晋升 / 暂存 / 拒写
4. `select_for_injection`：注入筛选

### 4.3 它的最终目标

让系统从：

- “能记”

升级为：

- “会治理”

---

## 5. 第一原则（必须先定死）

### 5.1 不是所有信息都配进长期记忆

默认规则应该是：

- 先怀疑它是临时信息
- 只有满足条件，才升到长期层

### 5.2 检索命中 ≠ 值得注入

相关记忆注入必须受预算控制：

- 每轮最多注入少量高价值节点
- 历史摘要不默认参加
- 临时记忆不默认参加

### 5.3 历史不是长期记忆本体

`my_user/history/...` 应视为：

- 档案层
- 回顾素材
- 分析输入

而不是：

- 默认人格记忆
- 默认上下文注入主来源

### 5.4 纠错节点单独保护

类似：

- `core://agent/corrections`

这类节点属于核心规则资产：

- 不纳入自动清理
- 不允许治理器轻易重写
- 只能做只读、审计、人工确认

---

## 6. 记忆分层设计（第一版）

这是最核心的一层。

### 6.1 建议分层

#### A. `scratch://`（临时草稿层）

用途：

- 本轮推断出的候选记忆
- 待确认的偏好
- 尚未验证的任务背景
- 自动提炼出的候选项

特点：

- 默认短生命周期
- 不进入启动记忆
- 不默认参与相关记忆注入

#### B. `session://`（当前会话层）

用途：

- 当前会话有效的上下文
- 临时项目目标
- 当前局部约定
- 这轮任务的短期状态

特点：

- 会话内高可用
- 跨会话默认降权
- 可由 Governor 判断是否晋升

#### C. `project://`（项目知识层）

用途：

- 架构、术语、里程碑
- 项目决策
- 项目偏好
- 稳定实现约定

特点：

- 比用户人格层更具体
- 与当前项目强绑定

#### D. `core://my_user/*`（用户长期层）

用途：

- 用户偏好
- 用户风格
- 长期稳定需求
- 反复确认过的工作习惯

特点：

- 进入 boot memory 候选
- 优先级高
- 变更应谨慎

#### E. `archive://` / 现有 `core://my_user/history/*`（档案层）

用途：

- 对话摘要
- 历史素材
- 后验分析数据

特点：

- 默认不直接注入 prompt
- 只有明确“回顾历史”场景时读取

### 6.2 现阶段过渡方案

因为 Nocturne 当前已经落地的是 `core://...` 风格，我们不必一次性大迁移。

可以先在 OCT 里做“逻辑分层”：

- `core://my_user/history/*` → 归为 `archive`
- `core://my_user/preferences/*` → 归为 `core-user`
- `core://agent/feedback/*` → 历史遗留路径（2026-05-25 后不再新增）
- `core://agent/self_eval/*` → 归为 `governance`
- `core://project/*` / `core://my_user/project_*` → 归为 `project`
- 新候选区可先落到：
  - `core://agent/review_queue/...`
  - 或 `core://agent/scratch/...`

也就是说：

**第一版可以先用“路径映射 + 规则映射”来模拟分层，而不是立即重建整个 URI 体系。**

---

## 7. 晋升机制（Promote / Hold / Reject）

### 7.1 当前最大问题

现在很多自动流程是：

- 一提炼出来
- 就直接写长期记忆

这会导致噪音快速累积。

### 7.2 新规则

任何自动抽取的信息，先经过三选一：

#### `promote`
直接晋升为长期记忆

适用条件：

- 用户明确说“记住”
- 被连续多轮提到
- 是稳定偏好或稳定项目事实
- 明显影响后续行为

#### `hold`
进入候选池 / review queue

适用条件：

- 看起来有价值，但还不确定长期性
- 当前轮次出现一次，未复现
- 更像会话事实，不像长期事实

#### `reject`
不写入长期系统

适用条件：

- 一次性任务细节
- 冗余上下文
- CoT / 推理过程
- 纯礼貌回复
- 可以从历史回放中获得，无需记忆化

### 7.3 第一版实现建议

新增一个轻量决策模块：

- `oct-gateway/memory_governor.js`

暴露：

- `classifyCandidate(userMsg, assistantReply, source)`
- `shouldPromote(candidate)`
- `sanitizeForMemory(content)`

并先接入：

- `saveHistorySummary()`
- `detectAndSaveFeedback()`
- `extractAndSaveMemory()`
- `clarification_memory.detectAndSaveClarification()`

---

## 8. 注入治理（相关记忆筛选）

### 8.1 当前问题

当前相关记忆注入链路会：

- 搜关键词
- 拼接内容
- 再补最近几条历史摘要

这会带来两个问题：

1. 历史类内容太容易污染上下文
2. 命中的内容不一定值得注入

### 8.2 新规则

相关记忆注入前，增加 Governor 筛选：

#### 注入优先级（建议）

1. 核心身份 / 用户偏好
2. 当前活跃项目节点
3. 最近确认过的稳定规则
4. 相关但低风险的历史片段

#### 默认不注入

- `history/*` 档案层
- 低优先级候选层
- 长期未访问、长期未确认内容
- 含 CoT、冗余摘要、长段原文

### 8.3 注入预算

每轮注入建议控制为：

- 最多 3~5 条节点
- 每条截断到安全长度
- 严格按优先级排序

### 8.4 第一版实现点

在 `oct-gateway/index.js` 构建 `[相关记忆]` 的地方增加：

- `memoryGovernor.filterForInjection(results, context)`

输出结构建议：

- `mustInject`
- `optionalInject`
- `archiveOnly`
- `rejected`

这样后面很好扩展到日志和审计视图。

---

## 9. 清洗治理（Sanitize）

### 9.1 必须清洗的内容

- `[cot]...[/cot]`
- `<think>...</think>`
- `<redacted_thinking>...</redacted_thinking>`
- 过长代码块
- 工具调用回显
- 与用户意图无关的流程性废话

### 9.2 当前已完成基础修复

已经做过：

- 历史摘要写入前剥离 CoT
- 反馈写入前剥离 CoT
- 记忆搜索返回前剥离 CoT
- 相关记忆注入前剥离 CoT

### 9.3 下一步

把目前的 `cot_sanitize.js` 升级为更通用的：

- `memory_sanitize.js`

新增能力：

- strip CoT
- strip raw tool traces
- compress oversized content
- normalize duplicated whitespace
- classify unsafe memory payload

---

## 10. 巡检与垃圾回收

这部分建议做成后台异步 Agent，而不是主对话实时执行。

### 10.1 Governor 后台巡检职责

- 找出低价值长期记忆
- 找出重复节点
- 找出长期未访问节点
- 找出需要人工确认的冲突节点
- 定期生成“记忆整理任务”

### 10.2 第一版不要做自动 delete

先做：

- 标记为 stale
- 移入 archive/review
- 合并建议

而不是直接删除。

### 10.3 可执行动作

#### `demote`
长期层 → 候选层 / 档案层

#### `merge`
同主题多节点 → 合并到 canonical node

#### `archive`
移动到档案区，不再默认注入

#### `flag`
标记冲突，等待人工或主 Agent 决策

---

## 11. 与偏好系统 / 自适应问答系统的关系

这是 OCT 特别要处理好的地方。

### 11.1 偏好系统

偏好类记忆不应该和普通历史摘要混在一起。

建议：

- 偏好永远走专用路径
- 偏好变化必须有来源
- 偏好更新时保留 `last_confirmed_at`

### 11.2 自适应问答系统

问答系统不要直接自由写长期记忆。

建议规则：

- 追问得到的新偏好 → 先进入候选层
- 同类偏好二次确认后 → 再晋升到长期偏好节点

### 11.3 反馈系统

反馈应作为“修正证据”，而不是默认事实本体。

建议：

- feedback 写入链路已删除（历史说明保留作迁移参考）
- Governor 再决定是否反向修改 `preferences/*` 或 `rules/*`

也就是说：

**偏好、反馈、追问，不应彼此直接改写，而应通过 Governor 统一协调。**

---

## 12. Memory Governor 的模块设计

### 12.1 第一版模块文件

建议新增：

- `oct-gateway/memory_governor.js`

### 12.2 第一版职责

建议先包含这些函数：

```js
sanitizeMemoryPayload(payload)
classifyMemoryCandidate(candidate)
shouldPromote(candidate)
filterForInjection(results, context)
shouldArchive(node)
shouldMerge(nodeA, nodeB)
```

### 12.3 第一版不要做的事

- 不直接控制 UI
- 不直接替代 memory.js
- 不负责底层 Nocturne API
- 不直接修改 `core://agent/corrections`

它只负责：

**治理决策**

---

## 13. 推荐实施顺序

### Phase 1：Governor 核心接入（最小可用）

目标：

- 建立统一治理入口

实施：

1. 新增 `memory_governor.js`
2. 接入写入前 sanitize
3. 接入 related memory 注入筛选
4. 新增候选层 / review queue 逻辑

完成标准：

- CoT / 垃圾内容不再进入长期记忆
- 历史摘要不再默认污染相关记忆
- 自动抽取默认先进候选层

### Phase 2：分层与晋升

目标：

- 实现“默认暂存，条件晋升”

实施：

1. 定义 path mapping 规则
2. 明确 `promote / hold / reject`
3. 给偏好、反馈、项目事实分别配置规则

完成标准：

- 长期记忆增长速度显著降低
- 新记忆更稳定、更少重复

### Phase 3：后台治理 Agent

目标：

- 自动巡检、归档、合并、降级

实施：

1. 周期巡检任务
2. stale/duplicate/conflict 标记
3. 生成 review queue

完成标准：

- 记忆库不再只增不减
- 垃圾场趋势可控

### Phase 4：审计界面

目标：

- 让人能看见记忆如何变化

实施：

1. review queue
2. merge / archive / promote 按钮
3. timeline / diff / rollback 视图

完成标准：

- 记忆治理变得可见、可控

---

## 14. 第一版实施建议（我建议马上这样做）

如果我们现在就要开始落实，我建议只做下面 4 项：

1. 新建 `memory_governor.js`
2. 接管：
   - `memory_history.js`
   - `memory_feedback.js`（已删除）
   - `extractAndSaveMemory()`
   - 相关记忆注入筛选
3. 新增 `core://agent/review_queue/...` 作为候选层
4. 历史摘要默认降为 archive，不再作为常规相关记忆主来源

这样做的好处是：

- 不需要大迁移
- 不会推翻 Nocturne 现有结构
- 能立刻提升系统质量
- 和你现有偏好系统、自适应问答系统兼容

---

## 15. 我们这次要产出的落地结果

下一步真正的实施目标，不是“讨论 Memory Agent 要不要做”，而是：

### 15.1 代码层

- `memory_governor.js`
- 第一批接入点改造
- 候选层路径约定

### 15.2 文档层

- 更新 `docs/02_architecture/FEATURE_MAP.md`
- 更新记忆架构文档
- 增加 Governor 设计说明

### 15.3 验收层

验证这些问题是否改善：

- CoT 不再进入相关记忆
- 历史摘要不再污染 prompt
- 自动提炼不会直接把垃圾写进长期层
- 偏好 / 反馈 / 追问不再互相踩写

---

## 16. 最终结论

AMY 说“做一个记忆管理 Agent”，我赞成。

但更准确地说，我们第一步该做的是：

**先把它做成 Memory Governor。**

原因很简单：

- 你们已经会记了
- 你们现在最缺的是治理
- 治理先于自治

所以这套方案的真正目标是：

**把 OCT 的记忆系统，从“可写的 Nocturne 接入层”，升级成“可治理的记忆操作系统”。**
