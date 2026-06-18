# Chat Streaming Block Protocol Plan（流式块协议重构 · 对齐 Claude）

> 续 `chat-protocol-unification-plan.md` 的 **P2-1（统一工具循环 / TurnOutcome）**，把它从"clarify 终止态"推广到**整条流式内容模型**。
> 目标：把"一根扁平文本流 + 一堆补丁"升级为"**一回合 = 一串带类型、带 ID 的内容段（segment/block）**"，对齐 Claude 的 content-block 流式模型。
> 评判标准：**让一整类对话 BUG（跨轮重复、抢顶、抑制失灵、done/delta 谁更全）结构性消失，而不是再加一个补丁。**
> 证据基准：以源码为准，`代码证据` = 直接读到的 file:line；`推断` = 基于证据的逻辑推论。

---

## 落地进度（2026-06-17）

| 期 | 状态 | 说明 |
|----|------|------|
| **B0 止血** | ✅ 已提交 | `onRoundReset`+`reset` 事件，续轮清空老气泡，临时消除重复。用户的重复 BUG 已修（需重启 gateway）。 |
| **B1 后端段协议双发** | ✅ 已提交 | `TurnSegmentTracker` 把文本/工具/终止翻译成段事件，与裸 delta 双发；前端忽略。**行为零变化**。 |
| **B2 前端影子接入** | ✅ 已提交 | `core/turnSegments` 纯 reducer + `turnSegmentsRef` 累积段状态；**暂不渲染**。 |
| **B3 切换段渲染** | ✅ 已提交 | `segProtocolActiveRef` 激活后 `onChatSeg` 接管显示，跨段永不拼接；新文本段开启自动 reset；`onChatDone` 信任段派生 fullTextRef。肉眼验证：天气查询只出现一个气泡、内容正确。另附：electron passthrough 修复 + 「正在生成回答…」占位。 |
| **B4 删补丁 + 统一 TurnOutcome** | ⏸ 前置 B3 | 计划自身要求"B3 灰度确认稳定"后才删旧路径。 |

> **当前安全边界**：B0–B3 全部已提交。B3 已肉眼验证（天气查询：工具调用后只出现一个气泡，无重复）。B4 等灰度确认稳定后执行。

---

## 0. 结论速览（TL;DR）

1. **今天修的"调研报告重复输出两遍"不是孤立 BUG，是一类 BUG 的样本。** 根因：OCT 把**整回合的所有正文拍平成一根字符串流**（`onDelta` 不断 `+=`），工具调用前后的正文、多轮续写的正文，全部追加进同一个气泡。任何"分多段产出"的场景都会叠在一起。

2. **Claude / GPT 不会，是因为它们的回复是"内容块（content block）"流式的**：每段内容带 `index/type`，前端**按块 ID 放置**，工具前后的文字是不同的块，永不拼接。终止原因是**显式枚举**（`end_turn`/`tool_use`），不靠"字符串空不空"去猜。

3. **OCT 其实已经有"块"的一半**：最终消息走 `render_blocks`（`renderBlocksNormalizer` → `payload.renderBlocks` → 前端 `renderBlocksAdapter`），这条是干净的块协议。**缺的是"流式过程"也块化**——现在流式仍是扁平文本，最终才变块，两套模型在一次回合里割裂。

4. **根治 = 把"块"从"最终消息"前移到"流式过程"**：定义一套 **Turn Segment Protocol**（回合内容段协议），让 gateway 在流式时就发"开段/段增量/闭段"事件，每段带 `segId + type`。前端按段渲染。**今天的 `reset` 补丁、`preferDoneTextWhenMoreComplete`、`shouldSuppress`、`finalizeFallback` 这些"猜结构"的代码会随之退役。**

5. 这是**中等规模重构**（动流式核心 + 前端渲染桥），但**可灰度、可回滚、分 5 期**，每期独立可上线、有测试。今天的 `reset` 补丁作为 B0 临时层保留，到 B3 被正式协议取代。

---

## 1. Claude 怎么做的（对照模型）

Anthropic Messages 流式 API 的线协议是**内容块寻址**的（事实，公开协议）：

```
message_start                                   ← 回合开始（envelope）
content_block_start  { index:0, type:text }     ← 开一个文本块
content_block_delta  { index:0, delta:"我来查" } ← 增量寻址到 index:0
content_block_stop   { index:0 }                ← 闭块
content_block_start  { index:1, type:tool_use } ← 开一个工具块（独立块！）
content_block_delta  { index:1, partial_json }  ← 工具入参增量
content_block_stop   { index:1 }
message_delta        { stop_reason:"tool_use" } ← 显式终止原因
message_stop
（工具结果回传后，下一条 message 再开 index:0 的新文本块 = 最终答案）
```

**为什么这天然免疫今天的 BUG：**

| 维度 | Claude content-block | OCT 现状 |
|------|----------------------|----------|
| 内容承载 | N 个**带 index/type 的块** | **1 根字符串**（`fullReply += chunk`） |
| 增量寻址 | delta 带 `index`，贴到对应块 | delta 无寻址，**一律追加到末尾** |
| 工具前后文字 | 是**两个不同的块**，不相邻渲染 | 拼进同一气泡，相邻 → 视觉重复 |
| 多轮续写 | 下一条 message 开**新块** | 续轮 `onDelta` 仍**追加到老气泡** |
| 终止判定 | `stop_reason` 显式枚举 | 靠 `getFullReply()` 字符串 + `preferDoneText…` 猜 |
| 前端职责 | 按块 ID **放置** | 按时序**拼接**，再用启发式还原结构 |

一句话：**Claude 的前端"摆积木"，OCT 的前端"贴字条再猜断句"。** 贴字条模型每多一个产出阶段，就多一个拼接歧义，就多一个潜在 BUG。

---

## 2. OCT 当前的扁平流模型（grounded）

### 2.1 累加发生在哪（代码证据）

**后端两处累加：**
- `runtime/streamController.js:14` — `this.fullReply += chunk`（smoother 每吐一个字就加）。
- `runtime/chatEngine.js:40` — `const finalizedReply = streamCtrl.getFullReply() || _text` → **最终回复 = 全回合所有 delta 的拼接**（含工具前正文 + 续轮正文）。
- `ai.js:_processContentChunk`（`ai.js:1126/1145/...`）— `fullText += cleaned; onDelta(cleaned)`，每轮 streamChatRaw 的正文都经同一个 `onDelta` 流出。

**前端一处累加：**
- `src/hooks/useMessages.ts:onChatDelta`（`:405-410`）— `streamingMessageRef.current += content; fullTextRef.current = streamingMessageRef.current`，**一根 ref 收全部 delta**，绘进同一个流式气泡（`ensureStreamingAssistantMessage`，`useMessages.ts:308`）。

**多轮工具的递归**：`runtime/toolLoop.js:356` 续轮 `this.streamChat(...)` 复用**同一组** `onDelta/onDone` → 续轮正文继续累加。这就是今天重复的机制（详见 `chat-protocol-unification-plan.md` 的 P2 待办）。

### 2.2 为了让扁平流"看起来对"，现在堆了多少补丁

这些都是"猜结构"的代码，正是 BUG 高发区：

| 补丁 | 位置 | 在补什么 |
|------|------|---------|
| `onRoundReset` / `reset` 事件（**今天加的**） | `streamController.js:resetReply` / `toolLoop.js:356` / `useMessages.ts:onChatReset` | 续轮时清空老气泡，模拟"换块" |
| `preferDoneTextWhenMoreComplete` | `useMessages.ts:56` | done 文本 vs 流式 ref **谁更全**靠长度猜 |
| `shouldSuppressAssistantTextForClarify` | `useMessages.ts:65` | clarify 后空 done 才抑制残留正文 |
| `scheduleFinalizeFallback` / `recoverOctStreamFromEndFailure` | `useMessages.ts:258/32` | 流断了/没收到 done 的兜底定稿 |
| `getAssistantVisibleMain` + paint 自愈 | `useStreamPainting.ts:78-84` | shownLen > target 时夹回，掩盖 ref 被改 |
| `normalizeAssistantTranscriptContent`（删 `waiting_user_reply`/`render_blocks` 残片） | `utils/cotExtract.ts` | 扁平流里混入的协议残片 |

> **判断**：这 6 处补丁有 5 处的存在理由是"扁平流无法表达结构"。块协议落地后，它们**大部分可删**（见 §5）。

### 2.3 已经有的"块"基础设施（可复用，不重造）

- **块类型已定义**：`src/types/renderProtocol.ts` — `markdown/code/table/tasklist/pills/checkbox/question/clarify_card/notice`。
- **块→渲染段已就绪**：`src/ui/chat/renderBlocksAdapter.ts` 把 `RenderBlock[]` 转 `RenderSegment[]` 渲染。
- **块规范化已就绪**：gateway `services/renderBlocksNormalizer.js`（`chatRequestHandler.js:216` 调用）。
- **回合状态机已就绪**：`src/core/turnFSM/turnTypes.ts`（`STREAM_OPEN/STREAMING/STREAM_COMPLETE/...`）。

**结论：块协议不是从零造，是把"已用于最终消息的块模型"提前到"流式过程"。**

---

## 3. 目标架构：Turn Segment Protocol（回合内容段协议）

### 3.1 核心概念

**一回合（turn）= 一个有序的内容段（segment）列表。** 每段：

```ts
interface TurnSegment {
  segId: string;        // 回合内稳定 ID，如 `${turnId}:s0`、`:s1`
  index: number;        // 顺序（对齐 Claude content_block index）
  type: 'text' | 'tool_use' | 'tool_result' | 'reasoning' | 'final';
  // text/final: 增量文本累积到 content；tool_use: 工具卡片；reasoning: CoT 折叠块
  content?: string;
  block?: RenderBlock;  // 结构化块（pills/table/...）直接挂这里，复用现有渲染
  meta?: { tool?: string; callId?: string; round?: number; status?: string };
}
```

**关键规则：delta 必须带 `segId`。** 前端按 `segId` 找段追加；找不到就开新段。**跨段永不拼接** → 今天的重复在协议层就不可能发生。

### 3.2 线协议（gateway → 前端，wire events）

在现有 `event:'chat'` 上**增量扩展**（不破坏旧字段，灰度友好）：

```jsonc
// 开段
{ event:'chat', payload:{ turnId, seg:{ op:'open',  segId, index, type } } }
// 段增量（替代裸 delta）
{ event:'chat', payload:{ turnId, seg:{ op:'delta', segId, text } } }
// 闭段
{ event:'chat', payload:{ turnId, seg:{ op:'close', segId } } }
// 回合终止（替代裸 done，终止原因显式）
{ event:'chat', payload:{ turnId, done:true, stopReason:'end_turn'|'tool_use'|'awaiting_user'|'max_turns'|'error', usage, model } }
```

- `tool_use` / `tool_result` 段：复用现有 `sendToolEvent`（`chatRequestHandler.js:43`）的 `tool_call`/`tool_result`，**只加一个 `segId/index` 让它在段序列里有位置**。
- 结构化块（pills/table）：`seg.op:'open'` 带 `block`，前端直接走 `renderBlocksAdapter`。
- `clarify`：维持现有 `event:'clarify'` 旁路（昨天方案的单协议），段序列里留一个占位段即可。

> **对齐关系**：`seg.open/delta/close` ≡ Claude 的 `content_block_start/delta/stop`；`stopReason` ≡ `message_delta.stop_reason`。

### 3.3 工具多轮如何天然不重复

```
turn t1
 ├─ s0 text     "我来查一下"        (open→delta→close)
 ├─ s1 tool_use parallel_web_research(open→delta→close, stopReason=tool_use)
 │   …工具执行，s1 显示进度卡片…
 ├─ s2 text     "完整报告 …"         (open→delta…→close)
 └─ done stopReason=end_turn
```

- s0（工具前正文）和 s2（最终报告）是**两个段**，前端分别渲染，**不会拼接**。
- 想"工具前不显示话"？前端对 `type:text 且后随 tool_use 的段`折叠/弱化即可——**是渲染策略，不再是数据问题**（今天的 reset 是在删数据，治标）。
- 续轮正文进**新段**，老段不动 → **结构上不可能重复**。

### 3.4 后端如何产生段（落点）

- `streamController.js`：从"一根 `fullReply`"改为"**当前段缓冲 + 已闭段列表**"。新增 `openSegment(type)/closeSegment()`；`getFullReply()` 退化为"调试用拼接"，**不再是最终回复的来源**。
- `chatEngine.js:onDone`：最终回复 = **段列表**（存 session 时拍平为 markdown 以兼容历史），而非 `getFullReply()`。
- `ai.js`：`_processContentChunk` 吐字时带"当前段"；`finish_reason:tool_calls` → 闭当前文本段 + 开 tool_use 段；续轮 streamChat 开新文本段。**今天的 `onRoundReset` 被"闭段/开段"取代**。
- `agent_runner.js`：非流式 Agent 一次性产出 → 包成 1～2 个段（text/final），**与 AMY 走同一段协议** → 落地昨天 P2-1 的"单一 TurnOutcome"。

### 3.5 前端如何渲染段

- `useMessages.ts`：把 `streamingMessageRef`（单根）换成 **`segmentsRef: Map<segId, TurnSegment>` + 顺序数组**。`onChatDelta`→`onSegDelta(segId,text)` 只更新该段。
- 流式气泡渲染 = `segments.map(renderSegment)`，文本段走 `StreamingMarkdownContent`，结构段走 `renderBlocksAdapter`，工具段走现有工具卡片。
- `onChatDone` 只做"标记回合定稿 + 落 stopReason"，**不再 `preferDoneText…` 猜补**。
- 滚动：段是稳定 key，新段 append 不会重排旧段 → **抢顶/向下跳消失**（今天的另一半症状）。

---

## 4. 迁移计划（5 期，向后兼容，逐期可上线）

> 原则：**先并存后切换**。每期 gateway 与前端同批，旧字段保留到 B4 才删。

### B0　止血层（已完成 ✅）
今天的 `onRoundReset` + `reset` 事件。续轮清空老气泡，**临时**消除重复。作为 B3 上线前的兜底保留。
- 验证：已加 `chatEngine.test.js`（onRoundReset）、`useMessages.test.ts`（clearStreamingBubbleContent）。

### B1　定义协议 + 后端双发（不改前端渲染）
- 新增 `TurnSegment` 类型 + wire 事件（§3.2）。gateway **同时**发"裸 delta（旧）"和"seg 事件（新）"，前端旧逻辑仍只读旧字段。
- 改：`streamController.js`（段缓冲）、`chatEngine.js`（段化 onDone）、`ai.js`（开/闭段落点）、`toolLoop.js`（续轮闭段开段）。
- 消除：后端 `getFullReply` 作为唯一真相源。
- 验证：gateway 单测断言"工具前正文段 ≠ 最终答案段，二者 segId 不同"；快照对比 seg 序列。

### B2　前端段渲染（影子模式）
- 前端读 seg 事件构建 `segmentsRef`，**但仍以旧气泡为准显示**；开发模式下对比"段渲染 vs 旧拼接"，打点不一致。
- 改：`useMessages.ts`（segmentsRef）、新增 `SegmentedStreamView` 组件复用 `renderBlocksAdapter`/`StreamingMarkdownContent`。
- 验证：影子对比零 diff（除"工具前正文"这类预期差异）。

### B3　切换为段渲染（正式 fix）
- 前端默认用段渲染；`onRoundReset`/`preferDoneTextWhenMoreComplete`/`shouldSuppress` 路径**置为 no-op 并标 deprecated**。
- 消除：跨轮重复、抢顶、抑制失灵——**整类消失**。
- 验证：今天的调研重复用例端到端断言"报告只出现一次、段数正确、滚动不回跳"；全套 `oct-gateway/test` + 前端 hooks 测试绿。

### B4　删除扁平流补丁 + 统一 Agent/AMY
- 删：裸 delta 旧字段、`onRoundReset`、`reset` 事件、`preferDoneText…`、`finalizeFallback` 的猜补分支。
- 落：`agent_runner` 与 AMY 共用段协议 + `TurnOutcome`（昨天 P2-1）。
- 前置：B3 灰度确认稳定 + 遥测无回退。
- 验证：全量回归 + 灰度；删除后测试仍绿。

---

## 5. 这一步消除的 BUG 类（不是单个 BUG）

| 现象 | 现在靠什么硬撑 | 块协议后 |
|------|---------------|---------|
| 调研/长任务**正文重复两遍** | B0 reset 补丁 | 结构上不可能（分段） |
| 流末**抢顶 / 向下跳** | 气泡内容突变触发滚动 | 新段 append，旧段稳定 |
| done 与流式**谁更全**错乱 | `preferDoneTextWhenMoreComplete` | 段各自定稿，无需比较 |
| clarify 后**残留正文**漏抑制 | `shouldSuppress` + 三层清理 | clarify 是独立段，正文段不渲染即可 |
| 工具前"思考正文"**混进答案** | 删数据（reset） | 标记为弱化段，数据保留 |
| 流断**定稿错位** | `finalizeFallback` 猜 | 已闭段即定稿，未闭段标记中断 |

---

## 6. 风险与回归点

### 6.1 最容易回归
1. **段边界判定错**：`finish_reason:tool_calls` 时没正确闭文本段 → 工具卡片插错位置。→ B1 单测覆盖"文本段→工具段→文本段"序列。
2. **历史/session 兼容**：旧消息是扁平字符串，新消息是段列表。→ 存储时段列表**拍平为 markdown** 落 session，渲染层向后兼容纯字符串消息。
3. **思考标签（CoT）与段交叉**：`_thinkTagMode`（`ai.js:1131+`）的 `[cot]` 块要映射成 `type:reasoning` 段，别和 text 段混。→ B1 专门用例。
4. **影子期双发翻倍带宽**：B1/B2 同时发新旧事件。→ 仅灰度账号开双发；B3 后关旧。
5. **结构化块（pills/table）流式**：现在 pills 只在最终 `renderBlocks` 出现；段协议要支持"流式中途开 pills 段"。→ 先只让 text/tool 段流式，结构块仍在 close 时一次性给（最小风险）。

### 6.2 必补测试
- [ ] gateway：工具前正文段与最终答案段 `segId` 不同、内容不拼接（B1 核心）。
- [ ] gateway：`finish_reason:tool_calls` 正确闭文本段、开 tool_use 段、续轮开新文本段。
- [ ] gateway：`agent_runner` 产出映射为段，与 AMY 段结构一致（B4）。
- [ ] 前端：`onSegDelta` 只更新目标段，不影响其他段。
- [ ] 前端：调研重复端到端——报告只出现一次（B3 验收门槛）。
- [ ] 前端：CoT `[cot]` → `reasoning` 段，不漏进正文段。
- [ ] 回归：clarify 事件路径、render_blocks 最终块路径保持绿（昨天方案的健康样板不被波及）。

---

## 7. 与昨天方案的关系 & 范围决策

- 本方案 = `chat-protocol-unification-plan.md` 的 **§4.3 理想最终版 / P2-1（单工具循环 + TurnOutcome）的内容侧实现**。昨天统一的是**clarify 终止态**；今天统一的是**整回合内容模型**。两者在 B4 汇合（Agent 与 AMY 共用"段协议 + TurnOutcome 终止枚举"）。
- **不在本方案范围**：模型路由、记忆、canvas/workbench（它们走各自事件，段协议只接管"聊天正文"这一路）。
- **建议节奏**：B0 已上线兜底；**B1+B2 一批**（后端双发 + 前端影子，零风险观察）；确认 seg 序列正确后 **B3 切换**（真正告别重复）；稳定后 **B4 清理**。

---
*本文为重构方案文档，未改动源码（B0 止血补丁已在前一轮单独落地）。落地按 §4 分期执行。*
