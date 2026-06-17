# 执行计划：回合 UI 状态「总指挥」（TurnUiState）

> 执行者须知：这是一份自包含的实现规格，交给具备代码能力的模型（GPT 等）照着执行。需求方**没有代码基础**，验收以「可观察的界面行为」为准。所有文件路径、事件名、现有结构都已核对（截至 commit `f3f084c` 后的工作区）。代码片段是**参考实现**，可在保持语义的前提下调整。完成后由人工重启应用目视验证。

---

## 0. 目标（必须达到什么）

OCT 的聊天界面现在把「当前回合处于什么状态」这件事**分散在 7 个互相独立的地方**各自猜测（见 §2），导致状态会打架——表现为：重复气泡、调用工具后静默、断在过渡句没有结论、工具卡片位置漂移。

**本计划的目标：建立唯一一个权威的「回合 UI 状态」（TurnUiState）投影，让界面上所有元素都从它派生，而不是各自猜测。**

### 0.1 验收 = 用户能观察到的行为（最终形态）

一个会用工具的回合，从头到尾，屏幕上**任一时刻都有且只有一个明确信号**告诉用户现在在干嘛，顺序如下：

| 阶段 | 屏幕上应显示 |
|------|------------|
| 1. 你提问 | 用户气泡 |
| 2. 思考中 | AMY 头像旁「思考中 · 计时」，有动画 |
| 3. 调用工具 | 工具组**展开**、有 spinner、实时进度 |
| 4. 工具收起 | 工具全部完成后工具组**自动折叠成一行摘要** |
| 5. 整理结论 | 明确的「正在整理结论…」提示（**不是空白干等**） |
| 6. 给出结论 | 干净排版的最终答案 |

**关键判据**：
- 不再出现重复气泡 / 工具前后内容叠加。
- 工具结果回来后到最终答案开始之间，有明确的「整理中」态，不是静默空白。
- 回合结束后头像旁徽章、工具组、思考行三者状态**一致**（不会一个说"思考中"一个说"完成"）。

### 0.2 本计划范围

- ✅ **做**：Phase 1（建投影 + 测试，零视觉改动）、Phase 2（让现有界面元素改为消费投影）。
- ❌ **不做**（明确排除，别顺手做）：MCP 协议接入、工具权限/审批 UI、重连状态、超大输出警告、把 OCT 改成 MCP client。这些是远期可选项，**不在本次范围**。
- ⏸ **本次不强求**：Phase 3 样式打磨（结论排版美化等）——投影稳定后另开任务。

---

## 1. 必读约束（违反会引发大面积回归）

1. **绝对不要改、不要替换现有的 `src/core/turnFSM/`（`TurnPhase` 状态机）。** 它管的是流式技术生命周期，被 `useMessages.ts` 多处依赖。新投影是**叠加在上层的只读层**，**消费**现有事件后输出一个面向 UI 的状态。两者并存，各管各的。
2. **不要改后端协议、不要改 `oct-gateway/`**（除非 Phase 2 末确实需要补一个 `turn-state` 事件，见 §5.3，且必须最后做、可选）。Phase 1+2 **纯前端**，靠消费**已有**事件即可。
3. **不要动段协议**（`turnSegments.ts` / `turnSegmentTracker.js` / 工具组渲染）。它们已经稳定，新投影**读**它们的事件，不改它们。
4. **每一步都要能单独验证、单独回退。** Phase 1 完成后界面**外观零变化**（只是内部多了一个被测试覆盖的投影），这是它零风险的前提。

---

## 2. 现状：回合状态现在分散在哪（要统一的对象）

前端当前没有单一回合状态，而是从这些独立来源各自推断（均在 `src/hooks/useMessages.ts`，除非注明）：

| 来源 | 类型/含义 | 问题 |
|------|----------|------|
| `agentPhase` | `'idle' \| 'thinking' \| 'typing' \| 'tool_executing'` | 词汇太窄，没有"等待工具续轮""等用户" |
| `fsmPhase`（来自 `oct.fsm` = turnFSM） | 流式技术生命周期 | 不含工具/clarify 语义 |
| `awaitingResponse` | boolean | 单独的布尔，和上面可能不一致 |
| `activeTools` | 执行中工具数组 | 工具维度的真相，但和 phase 分离 |
| `turnSegmentsRef` / `msg.turnSegments` | 段快照（text/tool_use/final） | 内容真相，但 UI 状态要从它推 |
| `useActivityTimeline` / `activityTimeline` | 思考/keepalive/工具时间线 | 又一套并行表示 |
| `pendingClarifyOpenRef` 等 clarify refs | 旁路标志 | clarify 用空 done 模拟暂停，脆弱 |

**界面元素各自读不同来源** → 偶尔互相矛盾 = 用户看到的 BUG。

### 2.1 现有事件（投影的输入，已经存在，无需新增）

`src/hooks/useWebSocket.ts` 已经把服务端事件路由到这些回调（`useMessages.ts` 里实现）：

- `onChatDelta(content, isDelta, isSystemReply, turnId)` — 文本增量
- `onChatSeg(seg, turnId)` — 段事件（`seg.op`: `open`/`delta`/`close`/`finish`；`seg.type`: `text`/`tool_use`/`final`...）
- `onChatReset(turnId)` — 工具续轮重置
- `onChatDone(content, isSystemReply, turnId, renderBlocks)` — 回合结束
- `onAgentPhase(phase, elapsed)` — `thinking`/`typing`/`tool_executing`/`idle`/`agent_running`
- `onToolEvent(payload)` — `payload.type`: `tool_call` / `tool_result`（含 `callId`/`state`/`elapsedMs`）
- `onClarifyOpen(spec)` — 工具反问用户（暂停）
- `onKeepalive(payload)` — keepalive，含 `phase`: `tool_running` / `waiting_continuation` 等

发送侧入口：`sendMessage` / `quickSend`（用户提交那一刻）。

**这些事件已经够推导出完整回合状态，不需要后端改动。**

### 2.2 参照：现有最干净的代码风格

`src/core/turnSegments.ts` 是当前设计里最干净的纯函数 reducer（事件 in → 状态 out，无副作用，易测试）。**新投影照这个风格写**，放在同目录。

---

## 3. 要建的东西：TurnUiState 投影

一个纯函数 reducer：吃 §2.1 的事件，吐出一个面向 UI 的回合状态。

### 3.1 类型（新建 `src/core/turnUiState.ts`）

```ts
/** 面向 UI 的回合状态——所有界面元素从此派生，取代分散猜测。 */
export type TurnUiPhase =
  | 'idle'                  // 无活动回合
  | 'submitted'             // 用户刚提交，请求已发出
  | 'thinking'              // 模型思考中（首 token 前 / 工具间思考）
  | 'tool_running'          // 有工具正在执行
  | 'waiting_continuation'  // 工具结果已回，等模型继续（关键：之前是静默空白的那段）
  | 'answering'             // 正文/最终答案正在流式输出
  | 'awaiting_user'         // 暂停，等用户回复（clarify/elicitation）
  | 'finalizing'            // 收尾定稿
  | 'completed'             // 回合完成
  | 'error'
  | 'cancelled';

export interface TurnUiState {
  turnId: string | null;
  phase: TurnUiPhase;
  activeToolCount: number;                 // 当前执行中的工具数（驱动工具组 spinner/进度）
  awaitingUser?: { kind: 'clarify' | 'elicitation' };
  error?: { message: string };
  startedAt?: number;                      // 本回合起始时间戳（驱动计时）
}

export type TurnUiEvent =
  | { kind: 'submit'; turnId: string }
  | { kind: 'agent_phase'; phase: string }         // 来自 onAgentPhase
  | { kind: 'keepalive'; phase?: string }           // 来自 onKeepalive
  | { kind: 'tool_call' }                            // onToolEvent tool_call
  | { kind: 'tool_result' }                          // onToolEvent tool_result
  | { kind: 'seg_text_delta' }                       // onChatSeg text/final delta（正文开始流）
  | { kind: 'reset' }                                // onChatReset（工具续轮）
  | { kind: 'clarify' }                              // onClarifyOpen
  | { kind: 'done' }                                 // onChatDone
  | { kind: 'error'; message: string }
  | { kind: 'cancel' };

export function emptyTurnUiState(): TurnUiState {
  return { turnId: null, phase: 'idle', activeToolCount: 0 };
}
```

### 3.2 reducer（状态转移规则）

核心思路：维护一个 `activeToolCount`（`tool_call` +1，`tool_result` -1，下限 0），phase 按下表推导。**phase 的优先级**：`awaiting_user` / `error` / `cancelled` 是"粘性"的，其它按事件流转。

| 收到事件 | 转移到的 phase（除非处于粘性态） |
|---------|------|
| `submit` | `submitted`（重置 activeToolCount=0、记 startedAt） |
| `agent_phase: thinking` / `keepalive: 无工具` | `thinking`（若 activeToolCount==0） |
| `tool_call` | `tool_running`（activeToolCount+1） |
| `tool_result` | activeToolCount-1；若归 0 → `waiting_continuation`，否则保持 `tool_running` |
| `reset`（工具续轮） | `waiting_continuation` |
| `seg_text_delta`（正文/最终答案开始流） | `answering` |
| `clarify` | `awaiting_user`（kind='clarify'，粘性，直到下一个 `submit`） |
| `done` | `completed` |
| `error` | `error`（粘性） |
| `cancel` | `cancelled`（粘性） |

参考实现骨架（GPT 按表补全 switch）：

```ts
export function reduceTurnUi(state: TurnUiState, ev: TurnUiEvent): TurnUiState {
  // 粘性态：只有新的 submit 能解除
  if ((state.phase === 'awaiting_user' || state.phase === 'error' || state.phase === 'cancelled')
      && ev.kind !== 'submit') {
    return state;
  }
  switch (ev.kind) {
    case 'submit':
      return { turnId: ev.turnId, phase: 'submitted', activeToolCount: 0, startedAt: Date.now() };
    case 'tool_call':
      return { ...state, phase: 'tool_running', activeToolCount: state.activeToolCount + 1 };
    case 'tool_result': {
      const n = Math.max(0, state.activeToolCount - 1);
      return { ...state, activeToolCount: n, phase: n === 0 ? 'waiting_continuation' : 'tool_running' };
    }
    case 'reset':
      return { ...state, phase: 'waiting_continuation', activeToolCount: 0 };
    case 'seg_text_delta':
      // 工具执行中收到正文增量也算开始作答
      return { ...state, phase: 'answering' };
    case 'agent_phase':
      if (ev.phase === 'thinking' && state.activeToolCount === 0) return { ...state, phase: 'thinking' };
      return state;
    case 'keepalive':
      if (ev.phase === 'waiting_continuation') return { ...state, phase: 'waiting_continuation' };
      if (ev.phase === 'tool_running' && state.activeToolCount === 0) return { ...state, phase: 'tool_running' };
      return state;
    case 'clarify':
      return { ...state, phase: 'awaiting_user', awaitingUser: { kind: 'clarify' } };
    case 'done':
      return { ...state, phase: 'completed', activeToolCount: 0 };
    case 'error':
      return { ...state, phase: 'error', error: { message: ev.message } };
    case 'cancel':
      return { ...state, phase: 'cancelled' };
    default:
      return state;
  }
}
```

> 注意：`finalizing` 在 reducer 里可暂不单独区分（`done` 直接到 `completed`），保留枚举给未来。`answering` 一旦进入，后续 `tool_result` 归零仍可回 `waiting_continuation`——这是多轮工具的正常情况，符合预期。

---

## 4. Phase 1：建投影 + 测试（**零视觉改动**，先交付这步）

### 4.1 实现
1. 新建 `src/core/turnUiState.ts`（§3 全部内容）。
2. 在 `src/hooks/useMessages.ts` 里加一个 `turnUiStateRef`（参照现有 `turnSegmentsRef` 的写法），在已有的各回调里**额外**喂事件给 `reduceTurnUi`：
   - `sendMessage/quickSend` 提交处 → `submit`
   - `onAgentPhase` → `agent_phase`
   - `onKeepalive` → `keepalive`
   - `onToolEvent`（tool_call/tool_result）→ 对应事件
   - `onChatSeg`（text/final 的 delta）→ `seg_text_delta`
   - `onChatReset` → `reset`
   - `onClarifyOpen` → `clarify`
   - `onChatDone` → `done`
   - 错误/取消路径 → `error`/`cancel`
3. **此阶段只累积、不渲染**（和 B2 影子模式同思路）。可临时把投影 phase `console.log` 出来，肉眼对照是否跟随真实回合演进。

### 4.2 Phase 1 验收（必须全绿）
- 应用外观**零变化**（没接任何 UI，纯内部）。
- `npx -p typescript tsc --noEmit` 无 error。
- 新增单元测试 `src/core/__tests__/turnUiState.test.ts`，覆盖至少：
  1. 纯文本回答：submit → agent_phase:thinking → seg_text_delta → done，phase 走 `submitted→thinking→answering→completed`。
  2. 单工具：submit → tool_call → tool_result → seg_text_delta → done，phase 走 `…→tool_running→waiting_continuation→answering→completed`。
  3. 多工具一轮：两个 tool_call 再两个 tool_result，activeToolCount 正确增减，归零才进 `waiting_continuation`。
  4. 工具出错：tool_call → error，进 `error` 且粘性（后续非 submit 事件不改变）。
  5. clarify 暂停：clarify → `awaiting_user` 粘性 → 新 submit 解除。
  6. 工具续轮：tool_result → reset → 再 tool_call，phase 正确回到 `tool_running`。
- 跑 `npx vitest run src/core/__tests__/turnUiState.test.ts` 全过。

> 注：仓库已有 6 个**与本任务无关**的预存失败测试（`streamRouter.test.ts` 5 个、`lineProtocolParser.test.js` 1 个）。**不要去修它们**，只需保证你新增/触及的测试通过、且失败数不增加。

---

## 5. Phase 2：让界面元素改为消费投影

把 `turnUiStateRef` 升级为会触发渲染的 state（`useState` + 在回调里 `setTurnUiState`），通过 `useMessages` 返回值暴露出去，然后让下列元素**改读投影**，删掉它们各自的猜测逻辑：

### 5.1 改造清单（`src/ui/chat/MessageList.tsx` 等）
| 界面元素 | 现在靠什么猜 | 改为读投影 |
|---------|------------|-----------|
| 头像旁状态徽章（思考中/打字中/调用工具中） | `agentPhase` | `TurnUiState.phase`（映射见 §5.2） |
| 「正在生成回答…」提示 | `awaitingFinalAnswer`（从 toolEvents 推断） | `phase === 'waiting_continuation'` |
| 工具组 running 状态 | 各 toolEvent.state | 可保留（工具组本身按 toolEvents 渲染），但"整组是否在跑"以 `phase`/`activeToolCount` 为准 |
| ActivityPanel streaming 标志 | 多个布尔 | `phase ∈ {thinking, tool_running, waiting_continuation, answering}` |
| 流式光标显示 | `isStreamingMsg` | `phase ∈ {answering, …}` |

### 5.2 phase → 屏幕信号映射（对应 §0.1 与需求方看过的效果图）
| TurnUiPhase | 头像旁徽章 | 其它 |
|-------------|-----------|------|
| `submitted` / `thinking` | 「思考中 · 计时」+ 动画 | — |
| `tool_running` | 「调用工具中」 | 工具组展开、spinner |
| `waiting_continuation` | 「整理中」 | 显示「正在整理结论…」 |
| `answering` | 「输出中」 | 正文流式 + 光标；完成的工具组折叠 |
| `awaiting_user` | 「等你回复」 | clarify 卡片 |
| `completed` | 无（归位） | 最终答案定稿、工具组折叠成摘要 |
| `error` | 「出错」 | 错误提示 |

### 5.3 Phase 2 验收
- **没有任何组件再自己猜"是否在等工具续轮"**——全部读 `phase`。
- `agentPhase` 不再决定消息生命周期（可保留为纯显示兼容，或删除）。
- 重启应用，跑一个会用工具的查询（如「调研一下今天的 AI 新闻」），目视确认 §0.1 表格的 6 个阶段信号依次正确出现，且**头像徽章 / 工具组 / 思考行三者状态始终一致**。
- 回归：clarify 暂停、纯文本回答、多轮工具都不出现重复气泡 / 静默空白 / 断在过渡句。

### 5.4（可选，最后做）后端补 `turn-state` 事件
仅当 Phase 2 发现"从现有事件推导某个状态不够准"时，再考虑让 gateway 显式发一个 `{event:'turn-state', payload:{turnId, phase, ...}}`（GPT 文档 §Proposed Event Vocabulary 有定义）。**默认不做**——优先用纯前端推导。

---

## 6. 陷阱与注意事项
1. **粘性态**：`awaiting_user`/`error`/`cancelled` 必须只能被新 `submit` 解除，否则随后的 keepalive/agent_phase 会把它冲掉，clarify 暂停就失效了。
2. **`activeToolCount` 下限 0**：`tool_result` 比 `tool_call` 多到（异常）时不能变负数。
3. **多轮工具**：`answering` 后又出现 `tool_call` 是正常的（模型边答边继续查），reducer 要允许 `answering → tool_running` 回退。上表已支持。
4. **turnId 隔离**：不同回合的事件不能混。投影在 `submit` 时重置；收到的事件若带 `turnId` 且与当前不符，应忽略（参照 `useMessages` 现有 `lastSentRequestId` 比对逻辑）。
5. **Phase 1 绝不碰 UI**：这是它"零风险"的全部意义。如果 Phase 1 改了任何外观，说明做错了。
6. **不要删 turnFSM**：再次强调，它和本投影并存。

---

## 7. 交付与提交建议
- Phase 1 一个 commit：`feat(core): 回合 UI 状态投影 turnUiState + 单测（影子，不接 UI）`
- Phase 2 一个 commit：`refactor(chat): 界面状态统一由 turnUiState 派生，消除分散猜测`
- 两个 commit 之间各自可独立验证、独立回退。

---

## 8. 背景参考（执行者可选读）
- `docs/07_research/claude-desktop-state-machine-vs-oct.md` — 本方案的来源分析（Claude Desktop 闭源，目标是借鉴 Claude-like 的回合状态粒度，不是克隆内部）。
- `src/core/turnSegments.ts` — 纯函数 reducer 的风格范本。
- `docs/refactors/B3-tool-group-render-plan.md` — 上一阶段（工具组渲染）的执行计划，已完成，本计划接在其后。
