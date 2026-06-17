# Chat Pipeline 全链路审查与收口计划（代码 / 工具 / 协议）

> 创建于 2026-06-18。
> **本文档面向"无对话上下文的执行者（含 AI Agent）"，必须自包含。** 执行前请通读第 0、1、2 节。
> 目标：**系统性找出整条对话链路里的冲突与冗余，全部修掉，并删除多余/死链路**——不是再打一个补丁，而是让一整类对话 BUG 结构性消失。
>
> 关联文档（执行前请一并阅读，本计划是它们的"收口与审查层"）：
> - `chat-protocol-unification-plan.md` —— 协议统一（TurnOutcome）
> - `chat-streaming-block-protocol-plan.md` —— 流式块协议 B0–B4（**B4「删补丁」尚未执行，本计划接管**）
> - `B3-tool-group-render-plan.md` —— 工具组分组渲染
> - `turn-ui-state-execution-plan.md` —— 当前分支 `codex/turn-ui-state` 的 UI 投影
> - `chat-pipeline-slimming-plan.md` —— 早期瘦身计划

---

## 0. 给执行者：如何使用本文档

1. **先做阶段 0（trace 探路），再动手。** 本计划大量结论依赖"哪条路径真的活着"。不要凭代码静态阅读就删东西——必须用运行期 trace 确认。
2. **每个任务都有「验收标准」和「验证方式」。** 没有通过验收，不算完成。
3. **删除前三重确认**：① grep 全仓无引用 ② 相关测试仍绿 ③ 阶段 0 的 trace 未命中该路径。三者缺一不可。
4. **每修一个冲突，补一条回归测试。** 现有测试基座见第 2.3 节。
5. **证据标注**：写结论时区分 `代码证据`（直接读到的 file:line）与 `推断`（基于证据的推论），沿用兄弟文档惯例。
6. 改动顺序严格按第 7 节阶段推进；阶段 1（止血）风险最低、优先做。

---

## 1. 背景与已知样本 BUG（worked example）

### 1.1 系统现状：一次"半完成的协议重构"

整条链路正处在从"扁平文本流"向"内容段/块协议"迁移的中途，**新旧多套表示法并存**。代码注释中可见大量过渡态标记：`影子`、`B2 阶段只构建状态`、`does not replace turnFSM`、`与旧 delta 双发，前端先忽略`。这种"半迁移"状态是冲突与冗余的主要来源。

### 1.2 样本 BUG（必须作为回归用例固化）

**现象**：用户问"帮我搜一下今天的 AI 新闻，整理成要点"。AMY 主对话执行了两轮搜索工具（并行调研 + 2 次 web_search），但**最终没有产出任何新闻要点报告**，只输出了一句过渡句"再补搜几个角度，确认今天的最新动态"，且该句**重复出现两次**。此外模型把日期当成了"4 月 19 日"（实际为 6 月 18 日）。

**根因（已定位）**：

- `代码证据` 主对话工具循环的"空答兜底"只覆盖**完全空白**：`oct-gateway/ai.js:1425` 的条件是 `!String(fullText||'').trim() && hasToolEvidence && toolChoice !== 'none' && !_forcedFinalAttempt`。本次最终文本是**非空但极短的过渡句**，从该缝隙漏过，被当成最终答案。
- `代码证据` 后台 Agent 路径 `oct-gateway/agents/agent_runner.js` **有三重收尾兜底**，主对话路径**没有**：
  - `agent_runner.js:366-378`：最终回复 `< 200` 字 → 强制再走一轮要求完整报告。
  - `agent_runner.js:433-453`：达 `maxTurns` → 发不带工具的收尾请求强制出报告。
  - `agent_runner.js:469-487`：循环退出后 `finalResult < 100` 字 → 再补一次收尾；仍空则诚实兜底文案。
- `代码证据` `oct-gateway/runtime/toolLoop.js:83-103` 的循环上限/重复 guard 会发 "⚠️ 工具探索轮次已达上限" 文案——本次**未触发**（说明轮次 < 上限、重复 < 阈值），印证是"模型 stop 在过渡句"而非"撞上限"。
- `推断` 日期错误（4 月 19 日）来自时间注入未生效或被搜索结果带偏，是诱发模型空转重搜的因素之一。见任务 C1。

**这不是孤立 BUG，是一类 BUG 的样本**：凡"分多段产出 / 多轮续写 / 工具前后都有正文"的场景，都可能出现重复或丢结论。审查目标是消除这一整类。

---

## 2. 审查方法

### 2.1 冲突的统一定义

1. **双算冲突**：同一份内容被两套机制各算一遍，结果可能不一致（重复、丢失、顺序错乱）。
2. **双实现不对齐**：同一职责存在两份实现，行为却不同（如两个工具循环、两个状态机）。
3. **兜底缺口 / 非法状态**：终止/兜底条件有缝隙（如样本 BUG），或状态机出现未声明转移。

### 2.2 trace 探路（阶段 0 必做）

- 打开前端调试开关：`src/core/turnFSM/turnFSM.ts` 的 `TURN_FSM_DEBUG`、`src/core/streamRouter/streamRouter.ts` 的 `STREAM_ROUTER_DEBUG` 置 `true`。
- 后端：`oct-gateway/ai.js` 已有 `finishReason`、`tool_calls`、`request done` 等 info 日志；按需提升关键路径日志级别。
- 跑 3 个典型回合，各自记录"实际触发了哪些模块/分支"：
  1. **纯聊天**（无工具）：例如"用三句话介绍你自己"。
  2. **带搜索**（复现样本 BUG）："帮我搜一下今天的 AI 新闻，整理成要点"。
  3. **带后台 Agent**：触发 Researcher 的调研类任务。
- 产出物：一张「模块 → 是否命中」对照表，作为后续"删/留"判断的唯一依据。

### 2.3 验证基座（现有测试，改动后必须保持绿）

```
npm test                 # 前端 + 通用 vitest
```
重点关注：
- `oct-gateway/test/messageRouterRegression.test.js`
- `oct-gateway/test/chatEngine.test.js`
- `oct-gateway/test/chatRequestHandler.test.js`
- `oct-gateway/test/slashHandlerRegression.test.js`
- `oct-gateway/test/toolLoopReasoningContent.test.js`
- `src/core/__tests__/turnFSM.test.ts`、`turnSegments.test.ts`、`turnUiState.test.ts`、`streamRouter.test.ts`、`blockRouter.test.ts`

类型检查：
```
npx -p typescript tsc --noEmit -p tsconfig.json
npx -p typescript tsc --noEmit -p tsconfig.electron.json
```

---

## 3. 协议层审查（A）—— 最高优先的结构问题

**核心问题：一份内容当前有 4 种表示法并存，缺少单一事实源（single source of truth）。**

| # | 表示法 | 关键文件 | 现状 |
|---|---|---|---|
| 1 | 原始 delta 文本流 | `oct-gateway/runtime/streamController.js`、`onDelta` 回调 | 仅保留为内部 chunk 信号，不再对外作为正文渲染流 |
| 2 | 段协议 segment（open/delta/close/finish） | `oct-gateway/runtime/turnSegmentTracker.js` → `src/core/turnSegments.ts` | 对外正文流事实源 |
| 3 | 结构化 render blocks v3 | `src/types/renderProtocol.ts` | 最终消息用 |
| 4 | optionBox 解析段 | `src/core/blockRouter.ts` + `blockAdapter.ts` + `src/utils/optionBoxParser` | legacy option/task 解析；流式 BlockIngest 桥已删 |

### 任务 A1 —— 确定唯一渲染事实源
- **决策建议**：以**段协议 segment（#2）**为唯一渲染事实源。理由：它结构上"跨段永不拼接"（`turnSegments.ts` 头注：不同 segId 永不拼接），从机制上根治跨轮/跨段重复。
- 其余三套的归宿：要么降级为"喂给段协议的输入"（如 #3 render blocks 作为 final 段的结构化载荷），要么删除（见 A3）。
- **验收**：写出一页《内容表示法归属表》，明确每套的"保留 / 降级 / 删除"去向 + 理由，落入本文档第 9 节。

### 任务 A2 —— 收口 "delta + segment 双发"
- `代码证据` `oct-gateway/runtime/chatEngine.js` 在内部把 smoothed text chunk 交给 `TurnSegmentTracker`，由段事件外发；`chatRequestHandler` 不再把 `onDelta` chunk 包成外部 `payload.delta`。
- 用阶段 0 的 trace 确认前端渲染到底用 delta 还是 segment（见 `src/hooks/useMessages.ts` 的 `onChatSeg` / `segProtocolActiveRef`）。
- **若 segment 已接管**：删除前端 delta 渲染分支，后端保留 delta 仅作为段事件的内部输入，不再对外双发。
- **验收**：trace 显示渲染只来自一条路径；样本 BUG 的"重复两次"在该用例下不再出现。

### 任务 A3 —— 清理 optionBox 旧桥（#4）
- 确认 `blockRouter / blockAdapter / optionBoxParser` 是否仍被 `src/ui/chat/MessageList.tsx` 实际使用。
- `代码证据` `src/core/blockIngest.ts` 已无生产引用并删除；`blockRouter / blockAdapter / optionBoxParser` 仍服务 legacy option/task 渲染，暂不整组删除。
- **验收**：grep 全仓无生产代码引用（测试除外）→ 整组删除（含对应 test）→ `npm test` 与 tsc 全绿。

---

## 4. 代码层审查（B）

### 4.1 后端主链路
`oct-gateway/runtime/chatRequestHandler.js` → `oct-gateway/orchestrator.js` → `oct-gateway/runtime/chatEngine.js` → `oct-gateway/ai.js`（`streamChat` / `streamChatRaw`）→ `oct-gateway/runtime/toolLoop.js`

### 任务 B1 ⭐ —— 统一"两个工具循环"的收尾兜底（直接根治样本 BUG）
- **问题**：存在两个独立工具循环，兜底强度不一致。
  - `oct-gateway/agents/agent_runner.js`：三重兜底（见 1.2）。
  - `oct-gateway/runtime/toolLoop.js` + `oct-gateway/ai.js:1425`：仅兜"完全空白"。
- **做法（二选一，推荐前者）**：
  1. 抽出共享模块 `runtime/finalAnswerGuard.js`：输入（fullText、hasToolEvidence、toolRound、已强制标志），输出"是否需要强制收尾 + 收尾 prompt"。两条循环都调用它。
  2. 或最小改动：把 `ai.js:1425` 的判定从"仅空白"放宽到"空白 **或** 短于阈值且本轮用过工具且未强制过"，触发一次 `tool_choice:'none'` 的强制收尾（复用现有 `_forcedFinalAttempt` 重入）。
- **阈值**：建议"最终文本 `< 60` 字且 `hasToolEvidence`"判为可疑（普通短回答不带工具证据，不受影响）。阈值需用阶段 0 的纯聊天用例验证不误伤。
- **验收**：
  - 样本 BUG 用例稳定产出**包含结论要点的报告**（或诚实说明"查到了什么、还缺什么"），不再只回过渡句。
  - 新增回归测试：mock 一个"工具后只回短过渡句"的响应，断言触发强制收尾。
  - 纯聊天短回答用例不被误触发强制收尾。

### 任务 B2 —— 厘清两套防重复机制是否打架
- `代码证据` `oct-gateway/runtime/chatEngine.js:48-54` 的 `onRoundReset`：续轮前清空上一轮正文（后端缓冲 + 前端气泡）。
- 段协议自述"跨段永不拼接"已从结构上防重复。
- **审查**：两套是否冗余/冲突？确定保留一套（建议段协议接管后，`onRoundReset` 的"前端清空"可退役，仅保留后端缓冲管理）。
- **验收**：多轮工具续写场景无重复、无丢段；trace 显示只有一套机制在起作用。

### 任务 B3 —— 路由规则审查（主对话 vs 后台 Agent）
- `代码证据` `oct-gateway/orchestrator.js` 的 `tryDispatchAsTask` 决定走 Agent 还是主对话。
- **审查**：什么样的请求该进 Researcher 等 Agent、什么留在主对话？样本 BUG 是"调研类请求留在了主对话"，恰好命中主对话兜底缺口。
- **做法**：明确并文档化路由判据；B1 完成后即使留在主对话也安全，但路由清晰可减少此类落差。
- **验收**：写出路由判据表；调研类请求的归属可预测、可测试。

### 4.2 前端主链路
`src/hooks/useWebSocket.ts` → `src/hooks/useMessages.ts` → `turnFSM` + `turnSegments` + `turnUiState` → `src/ui/chat/MessageList.tsx`

### 任务 B4 ⭐ —— 两个状态机并存的边界收口
- `代码证据` 存在两套 FSM：`src/core/turnFSM/turnFSM.ts`（回合生命周期，USER_TYPING→…→STREAM_COMPLETE）与 `src/core/streamRouter/streamRouter.ts`（流状态 IDLE→OPENING→…→CLOSED）。
- **审查**：两者职责边界、转移表是否有重叠/矛盾；谁是权威。
- **做法**：明确分层：生产聊天链路由 `turnFSM` 管"回合/流式生命周期"，`turnSegments` 管正文段事实源，`turnUiState` 管 UI 状态投影；`StreamRouter` 不再挂在生产 `useMessages` 编排中。
- **验收**：职责文档化、生产链路无重叠转移；`turnFSM.test`、`streamRouter.test`、`turnSegments.test`、`turnUiState.test` 覆盖边界并全绿。

### 任务 B5 ⭐ —— 影子投影的"推完或回滚"
- `代码证据` `src/core/turnUiState.ts` 头注已改为 UI presentation projection；`src/core/turnSegments.ts` 头注已改为 assistant 可见正文事实源。
- **风险**：影子与本体长期并存会持续 drift（两份状态算出不同结果）。
- **做法**：用阶段 0 的 trace 确认 UI 究竟消费哪一份。
  - 若已切到新投影 → **删除被取代的旧渲染分支**（这正是 `chat-streaming-block-protocol-plan.md` 里挂起未做的 **B4「删补丁」**）。
  - 若尚未切 → 要么推完切换、要么回滚影子，**不允许长期并存**。
- **验收**：UI 渲染只依赖一份状态；删除后 `turnSegments.test` / `turnUiState.test` 全绿；样本 BUG 与天气查询用例肉眼无重复。

---

## 5. 工具层审查（C）

### 任务 C1 ⭐ —— 时间/日期注入失效（4 月 19 日 BUG）
- 相关文件：`oct-gateway/tools/time_inject.js`、`oct-gateway/add_time_inject.js`、`oct-gateway/runtime/contextBuilder.js`（system prompt 注入处）。
- **排查**：当前日期是否注入进了 system/context？注入位置是否在模型实际读到的地方？是否被搜索结果里的旧日期带偏？
- **做法**：确保每回合 system 上下文含**权威当前日期**，并在 Researcher / 主对话提示中明确"时效信息以系统注入日期为准，不要用搜索结果推断今天的日期"。
- **验收**：复现用例中模型引用的"今天"与系统真实日期一致。

### 任务 C2 —— 记忆工具去重
- `代码证据` 四个高度重叠的记忆工具：`oct-gateway/tools/memory_read.js`、`memory_search.js`、`memory_recall.js`、`memory_vector_search.js`。
- **审查**：各自职责、调用频次（看日志/trace）、是否让模型选错或乱试。
- **做法**：评估合并为 1–2 个（如统一 `memory_search` 语义检索 + `memory_read` 精确读取），删除冗余者并更新 `tool_loader` 与提示词。
- **验收**：工具数减少、职责无重叠；记忆召回相关测试（如有）全绿；trace 显示模型不再在多个记忆工具间反复试错。

### 任务 C3 —— 搜索工具链与空结果处理
- 相关文件：`oct-gateway/tools/web_search.js`、`parallel_web_research.js`、`web_fetch.js`、`oct-gateway/runtime/toolResultSummarizer.js`。
- **审查**：空/弱搜索结果如何返回给模型？是否诱发"再搜一次"的空转（样本 BUG 的触发链）？`toolResultSummarizer` 是否吃掉关键信息？
- **做法**：空结果时返回明确信号（"未找到结果，建议换关键词或直接说明"），配合 B1 的强制收尾，避免空转。
- **验收**：构造"搜索返回空"的用例，模型不空转、给出诚实结论。

### 任务 C4 —— 工具卡片渲染对齐
- `代码证据` 本分支新增"工具活动分组摘要"（见 `B3-tool-group-render-plan.md` 与近期提交 "Make tool activity readable as grouped summaries"）。
- **审查**：分组摘要与段协议的 `tool_use` 段是否两套并行渲染、是否重复。
- **验收**：工具卡片只由一条渲染路径产生。

---

## 6. 冗余 / 死链清单（D，确认后删）

> 删除前必须满足第 0 节"三重确认"。以下为**候选**，最终以阶段 0 trace 为准。

- D1：协议层 A1 定事实源后，被淘汰的 2–3 套表示法（optionBox 桥 / 已无人消费的 delta 渲染分支 / 或 renderBlocks，视决策而定）。
- D2：`turnFSM` 中已被 `turnSegments`/`turnUiState` 取代的旧渲染分支（B5 推完后）。
- D3：重复的记忆工具（C2 合并后的多余者）。
- D4：`/new` slash 旧逻辑——`oct-gateway/gateway/slash.js` 的 "new conversation flush + clear"；多对话功能上线后主路径已不依赖它，确认后删或改为多对话语义。
- D5：扫描 `oct-gateway/` 与 `src/` 中带 `// 旧`、`// 兼容`、`deprecated`、`shadow`、`先忽略` 注释的分支，逐一判定存废。

---

## 7. 执行顺序（分阶段，每阶段独立可验证）

| 阶段 | 内容 | 任务 | 前置 | 风险 |
|---|---|---|---|---|
| **0** | trace 探路：跑 3 个典型回合，产出"模块命中表" | §2.2 | 无 | 无（只读） |
| **1** | 止血：统一收尾兜底 + 修时间注入 | B1, C1 | 阶段 0 | 低，收益大 |
| **2** | 协议层定事实源 + 收口双发 + 删 optionBox 桥 | A1, A2, A3 | 阶段 0 | 中高（改动大） |
| **3** | 前端双 FSM 收口 + 影子推完/回滚 | B4, B5, D1, D2 | 阶段 2 | 中 |
| **4** | 工具层瘦身 + 死链清理 | C2, C3, C4, D3, D4, D5 | 阶段 1 | 中 |
| 收尾 | 防重复机制对齐 + 路由文档化 | B2, B3 | 阶段 2/3 | 低 |

> 每阶段结束：① 跑第 2.3 节全部测试与 tsc ② 跑阶段 0 的 3 个回合人工复核 ③ 为本阶段修掉的冲突补回归测试 ④ 勾选第 8 节进度表。

---

## 8. 落地进度（执行者勾选）

| 任务 | 状态 | 说明 / 提交 |
|---|---|---|
| 阶段 0 trace 探路 | ☑ | `docs/refactors/chat-pipeline-phase0-trace.md`；deterministic harness 已覆盖纯聊天 / 主对话工具续轮 / 后台 Agent，可启动阶段 1；删除前仍需 live UI trace |
| B1 统一收尾兜底 | ☑ | 新增 `oct-gateway/runtime/finalAnswerGuard.js`，主对话与后台 Agent 共用短收尾判定；新增 `oct-gateway/test/finalAnswerGuard.test.js` 覆盖工具后短过渡句强制收尾、纯聊天短答不误伤 |
| C1 时间注入修复 | ☑ | `ContextBuilder` 注入 `[权威当前日期]`，明确相对日期以系统注入日期为准；回归测试覆盖当前日期提示存在 |
| A1 确定事实源 | ☑ | 第 9 节已填写内容表示法归属表：segment 是对外正文流事实源；delta 降级为内部 chunk；render blocks 为 final structured payload；optionBox 暂保留为 legacy parser |
| A2 收口 delta/segment 双发 | ☑ | `chatRequestHandler` 不再外发正文 `payload.delta`；Phase 0 trace 复跑显示 pure/tool 主聊天 `chat.delta` 为 0，正文只来自 `chat.seg` + `chat.done` |
| A3 删 optionBox 桥 | ◐ | `src/core/blockIngest.ts` 已无生产引用并删除；整组删除门槛仍未满足：`useMsgParse`、`MessageList`、`useTypewriter`、`QuestionCards`/`OptionBox`/`TaskList` 仍有生产引用，暂保留 legacy option/task 渲染 |
| B4 双 FSM 边界收口 | ☑ | 生产 `ChatTab`/`useMessages` 运行时只持有 `TurnFSM`；`StreamRouter` 不再接收生产 token 或驱动收尾，仅作为隔离核心模块与测试保留 |
| B5 影子推完/回滚 | ☑ | `turnSegments` 已是正文段事实源，`turnUiState` 驱动 UI 状态投影；删除 `StreamRouter`/`BlockIngest` 生产分支并更新头注 |
| C2 记忆工具去重 | ☑ | `memory_vector_search` / `memory_recall` 合并进 `memory_search` 的 `mode=vector/date`；ToolLoader 不再暴露旧工具名，伪工具与直接执行保留兼容别名；回归测试锁定暴露面与旧名改写 |
| C3 搜索空结果处理 | ☑ | `web_search` 已有弱结果 message；补齐 `parallel_web_research` 聚合退级信号，全部为空或整体弱时顶层 `message/hint` 明确禁止无新线索重复搜索；新增离线回归测试 |
| C4 工具卡片渲染对齐 | ☑ | `turnSegments` 中的 `tool_use` 段由 `MessageList` 内联 `ToolGroup` 渲染；ActivityPanel 在内联工具存在时通过 `filterActivityEntriesForInlineTools` 过滤 `tool_call/tool_result`，保留 CoT/keepalive；后台 Agent 仅透传模型自带短 preamble，不再生成工具兜底文案 |
| B2 防重复机制对齐 | ☐ | |
| B3 路由判据文档化 | ☐ | |
| D1–D5 死链清理 | ☐ | |

---

## 9. 附：内容表示法归属表（任务 A1 产出，执行时填写）

| 表示法 | 保留 / 降级 / 删除 | 理由 | 影响文件 |
|---|---|---|---|
| delta 文本流 | 降级为内部输入 | `StreamController` 仍用 `onDelta` chunk 累积 `fullReply` 并驱动 `TurnSegmentTracker`；`chatRequestHandler` 不再外发正文 `payload.delta`，避免前端双写 | `oct-gateway/runtime/streamController.js`, `oct-gateway/runtime/chatEngine.js`, `oct-gateway/runtime/chatRequestHandler.js` |
| segment 段协议 | 保留，作为对外正文流事实源 | `turnSegments` 明确跨段不拼接；Phase 0 trace 复跑显示主聊天 pure/tool 场景正文只外发 `chat.seg`；前端 `onChatSeg` 已驱动 `text`/`final` 可见正文 | `oct-gateway/runtime/turnSegmentTracker.js`, `src/core/turnSegments.ts`, `src/hooks/useMessages.ts`, `src/ui/chat/MessageList.tsx` |
| render blocks v3 | 保留为最终消息结构化载荷 | 只在 `chat.done` 后由 `normalizeRenderBlocks` 生成 `renderBlocks`，用于最终消息的 pills/markdown 等结构化渲染；不再作为 streaming 正文事实源 | `oct-gateway/runtime/chatRequestHandler.js`, `src/types/renderProtocol.ts`, `src/ui/chat/renderBlocksAdapter.ts`, `src/hooks/useMsgParse.ts` |
| optionBox 桥 | 暂保留，不能删除 | 删除门槛未满足：生产代码仍通过 `useMsgParse`/`MessageList`/`useTypewriter` 和 option/task 组件消费 `parseOptionBox`；`blockRouter`/`blockAdapter` 仍参与 legacy 文本解析。后续只能在 render blocks 覆盖所有 option/task 场景后再删 | `src/utils/optionBoxParser.ts`, `src/hooks/useMsgParse.ts`, `src/ui/chat/MessageList.tsx`, `src/core/blockRouter.ts`, `src/core/blockAdapter.ts` |
