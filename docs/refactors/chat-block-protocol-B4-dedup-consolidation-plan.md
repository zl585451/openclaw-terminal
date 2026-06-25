# 对话块协议 B4：去重收口与补丁削减计划书

> 续 `chat-streaming-block-protocol-plan.md`（B0–B3 已落地）。本文档只规划 **B4**：
> 把段协议（Turn Segment Protocol）固化为**单一事实源**，把散落在收尾/持久化层的
> 去重补丁归并到协议层，删除已被段协议取代的旧补丁。
>
> 状态：草案 / 待排期。本轮（2026-06-25）只产出计划，不展开实现。

---

## 1. 现状诊断（基于当前代码核实）

### 1.1 段协议核心已健全
- 后端 `oct-gateway/runtime/turnSegmentTracker.js`：把扁平流翻译成 `open/delta/close/finish` 段事件，工具前 text 段在 `close` 时重标为 `preamble`。
- 前端 `src/core/turnSegments.ts`：纯 reducer，**跨段永不拼接**（未知 segId 的 delta 直接丢弃，注释自述"这正是旧扁平流的 bug 源"）；`segmentsToVisibleText` 只取 `text/final`。
- 这一层是干净的，**反重复的根在这里已经成立**。

### 1.2 但外围仍是「双路径 + 多层兜底」
重复气泡之所以仍需多处补丁，根因是**两条路径并存**：

`src/hooks/messages/useChatStreamRouter.ts:196-200`
```js
// 段协议激活 → 信任 fullTextRef（段派生，仅含最终答案段）
// 未激活    → preferDoneTextWhenMoreComplete(旧扁平流补丁)
const finalText = segProtocolActiveRef.current
  ? (fullTextRef.current || fallbackText)
  : preferDoneTextWhenMoreComplete(fullTextRef.current, fallbackText);
```
`segProtocolActiveRef` 在 src 中被引用 **12 处**，本质是一个「新旧协议切换开关」，每个分支都要两套行为。

### 1.3 去重补丁清单（核实的使用点）
| 补丁 | 位置 | 使用点 | 性质 |
|---|---|---|---|
| `preferDoneTextWhenMoreComplete` | streamingBufferOps | 3 | 旧扁平流：done 文本比流式更全时回补 |
| `shouldSuppressAssistantTextForClarify` | streamingBufferOps | 3 | clarify 卡已开时压制残留正文 |
| `scheduleFinalizeFallback` | useStreamFinalize | 9 | 定时器兜底定稿（painter 未推进时强制收口）|
| `clearStreamingBubbleContent` | useTurnSegmentRouter | 3 | 段接管时清空 preamble 残留 |
| `finalizeStreamingAssistantBubble` | useStreamFinalize | 4 | 定稿时与上一条 completed 去重（本轮新增）|
| `collapseAdjacentDuplicateAssistantMessages` | App.tsx | 4 | 加载/保存前相邻去重（本轮新增）|
| `onRoundReset` | 前端 | **0** | 已无前端使用，疑似可端到端删除 |

> 观察：`finalizeStreamingAssistantBubble`、`collapseAdjacentDuplicateAssistantMessages`
> 是**段协议没能完全收口**时的「下游清扫」。它们有效（已被回归矩阵锁定），但属于
> 在错误层级补漏——理想状态下段协议正确收口后，下游不该再出现相邻重复。

### 1.4 去重逻辑当前散落在 5 个层级
```
L1 段 reducer：跨段不拼接（turnSegments.ts）            ← 根，保留
L2 段接管清空：clearStreamingBubbleContent             ← preamble 去重
L3 收尾去重：finalizeStreamingAssistantBubble          ← streaming 尾巴 vs 上条
L4 持久化去重：collapseAdjacentDuplicateAssistantMessages ← 加载/保存
L5 旧路径回补：preferDoneText / suppressClarify / fallback ← 仅服务 legacy 分支
```
L2–L5 都是为了补 L1 之外的漏，且 L5 仅在 `segProtocolActiveRef=false` 时才需要。

---

## 2. 目标（B4 终态）

1. **段协议 = 唯一事实源**：删除 `segProtocolActiveRef` 双路径，`done` 事件只用于
   「收口信号 + 兜底快照」，不再用 `done.content` 覆盖段派生正文。
2. **去重收敛为 2 条不变量**（都在协议层，可纯函数单测）：
   - 不变量 A：一回合的可见正文 = `segmentsToVisibleText(state)`（只取 text/final，跨段不拼接）。
   - 不变量 B：定稿时若段派生正文与上一条已完成 assistant 相同 → 不新建气泡（收口幂等）。
3. **删除已被取代的补丁**：`preferDoneTextWhenMoreComplete`、
   `shouldSuppressAssistantTextForClarify`、`onRoundReset`（前端 0 引用）、
   并评估 `scheduleFinalizeFallback` 是否能由段 `finish` 事件替代。
4. **L4 持久化去重降级为「断言式守卫」**：段协议正确后，加载/保存的相邻重复应为 0；
   `collapseAdjacent` 保留为防御性兜底但加日志，若线上触发即说明 L1–L3 有漏，便于定位。

---

## 3. 分阶段执行计划（每阶段独立提交 + 可回滚）

### B4.0 度量基线（只读，不改码）
- **动机**：删补丁前先证明段协议在所有路径都已激活，否则删了会回退。
- **动作**：埋点统计 `segProtocolActiveRef=false` 的实际命中率（chat / agent / AMY / 工具续轮 / 流中断各路径）。可在 `onChatDone` 加一行 debug 计数，跑一周真实使用。
- **验证**：若 false 分支命中率≈0，则 B4.1 可安全删旧路径；否则先补齐这些路径的段发射。
- **回滚**：纯埋点，移除即可。
- **风险**：低。**这是 B4 的前置门禁，不通过不进入 B4.1。**

### B4.1 删除 `segProtocolActiveRef` 双路径
- **动机**：双路径是补丁繁殖的根。
- **动作**：`useChatStreamRouter.ts` 把 L200 三元统一为 `fullTextRef.current || fallbackText`；删除 `segProtocolActiveRef`（12 处）及 `done=true && segProtocolActiveRef` 的跳过分支（L110）。
- **前置**：B4.0 门禁通过。
- **验证**：`streamChatRawSmoke`（后端 6 路径）+ 前端 `useMessages.test.ts` 全绿；手动验证调研类长任务（工具前后正文）只出一个气泡。
- **回滚**：单 commit revert。
- **风险**：中。**未做段发射的路径会丢正文** —— 必须靠 B4.0 数据兜底。

### B4.2 删除 `preferDoneTextWhenMoreComplete` + `shouldSuppressAssistantTextForClarify`
- **动机**：二者仅服务 legacy 分支（B4.1 删后无调用方）。
- **动作**：删函数 + 删 import；clarify 压制改由段协议表达（clarify 是独立段类型，不进 text/final，天然不展示）。
- **验证**：clarify 卡片场景（`request_clarify`）回归——卡片展示、无残留正文气泡。补一条段级单测：含 clarify 段时 `segmentsToVisibleText` 不含其内容。
- **回滚**：单 commit revert。
- **风险**：中（clarify 路径需确认走段协议）。

### B4.3 评估并替换 `scheduleFinalizeFallback`（9 处，最复杂）
- **动机**：定时器兜底定稿是「猜模型流是否结束」的脆弱补丁；段协议有显式 `finish` 事件。
- **动作**：以 `finish` 段事件驱动定稿，替代 180ms 轮询兜底。保留一个**短超时**仅用于「`finish` 始终未到」的网络异常（与流中断路径合流）。
- **验证**：流中断冒烟（已有）+ 新增「finish 到达即定稿、无 finish 则超时定稿」两条段级测试。
- **回滚**：单 commit revert。
- **风险**：高。**这是 B4 里最容易引入「转圈不收口」回归的一步**，建议单独一轮、灰度。

### B4.4 持久化去重降级为守卫 + `onRoundReset` 端到端清理
- **动机**：段协议收口后 L4 不该再触发；`onRoundReset` 前端已 0 引用。
- **动作**：`collapseAdjacent` 保留但命中即 `console.warn`（线上若触发=上游有漏）；删除后端 `onRoundReset` 透传链路（先确认后端无其他消费方）。
- **验证**：加载/保存去重单测保留；跑一轮确认 warn 不触发。
- **回滚**：单 commit revert。
- **风险**：低。

---

## 4. 去重逻辑归并矩阵（终态）

| 层 | 现状 | B4 终态 |
|---|---|---|
| L1 段 reducer 跨段不拼接 | 保留 | **保留（唯一根）** |
| L2 clearStreamingBubbleContent | 段接管清空 | 保留（preamble→final 接管） |
| L3 finalizeStreamingAssistantBubble | 收尾去重 | 保留（不变量 B，收口幂等） |
| L4 collapseAdjacent | 加载/保存去重 | **降级为带告警的防御守卫** |
| L5 preferDoneText / suppressClarify | legacy 回补 | **删除** |
| L5 scheduleFinalizeFallback | 定时兜底 | **由 finish 事件替代（B4.3）** |
| 开关 segProtocolActiveRef | 双路径 | **删除** |

---

## 5. 验收标准
- `segProtocolActiveRef` 在 src 中 0 引用；`onChatDone` 单一路径。
- 删除 `preferDoneTextWhenMoreComplete`、`shouldSuppressAssistantTextForClarify`、`onRoundReset`。
- 全量 `vitest run` 绿；新增段级测试覆盖 clarify 段、finish 定稿、超时定稿。
- 手动：调研长任务 / 工具续轮 / 流中断 / clarify 四场景各只出一个气泡、不转圈、不丢正文。
- `npx tsc --noEmit` 与 `tsconfig.electron.json` 均 0。

## 6. 不在本计划内（另立项）
- 后端 Agent/AMY 统一为 `TurnOutcome`（原 B4 的后半，体量大，单独排期）。
- Electron IPC 拆分（与去重无关）。
- gateway `ai.js` 全量类型迁移。

## 7. 排期建议
B4.0（埋点，1 次提交）→ 观察期 → B4.1/4.2（可同轮）→ B4.4 → **B4.3 单独一轮灰度**（风险最高）。
每步独立提交、独立可回滚；任一步线上异常即 revert 该步，不影响其余。
