# 测试覆盖扩展 + 网关文档 总执行计划

> 归档类型：Cursor 执行包  
> 创建日期：2026-04-29  
> 目标：扩展单元测试覆盖（useInlineInquiry / useTokenUsage / useActivityTimeline / useTypewriter），补写 oct-gateway 架构文档  
> 执行者：Cursor  
> 验收者：Claude  
> 打标方式：每个 Task 验收通过后 git commit 一次（message 带 ✅ 标记）

---

## 背景

当前测试状态（126 用例）：

| 已覆盖 | 未覆盖（本计划目标） |
|--------|---------------------|
| TurnFSM / StreamRouter / BlockRouter | useInlineInquiry |
| ScrollAnchor / clarifyCard parser | useTokenUsage |
| useOnboarding / useCapabilityActions / useImageStudio | useActivityTimeline |
| 多个 utils | useTypewriter |
| | oct-gateway（文档，无测试需求） |

---

## 开始前（第一步，必须先做）

```bash
git checkout -b test/coverage-round2
```

确认在新分支后再开始 Task 1。

---

## Task 1 — useInlineInquiry 测试

### 目标

覆盖澄清卡多页表单状态机的核心流程：初始化、翻页、跳过字段、提交、关闭、重置。

### 执行前必读

```
src/hooks/useInlineInquiry.ts   （完整读取，已知）
src/core/clarifyCard/types.ts   （读取 ClarifyCardSpec / ClarifyField 的精确结构）
src/core/clarifyCard/formatter.ts （了解 formatClarifyReply 输出格式，辅助断言 onReply）
```

### 执行内容

新建 `src/hooks/__tests__/useInlineInquiry.test.ts`

**在文件顶部构造两个可复用 fixture：**

```ts
// 单字段 spec（single 类型，有选项）
const singleFieldSpec: ClarifyCardSpec = { ... }

// 双字段 spec（第一个 text 类型，第二个 single 类型）
const twoFieldSpec: ClarifyCardSpec = { ... }
```

> 注意：请先读 `src/core/clarifyCard/types.ts` 确认字段结构后再构造 fixture，不要猜测字段名。

**测试用例（目标 ≥ 12 个）：**

1. `初始状态` — `hasActive` 为 false，`activeSpec` 为 null，`currentPage` 为 0
2. `openSpec — 空 fields 时返回 false，不激活` — 传入 `{ fields: [] }` 的 spec，`openSpec` 返回 false，`hasActive` 仍为 false
3. `openSpec — 有效 spec 激活成功` — `hasActive` 变 true，`activeSpec` 等于传入的 spec，`currentPage` 为 0
4. `openSpec — 已有活跃 inquiry 时返回 false` — 连续调用两次 openSpec，第二次返回 false
5. `goNext — 非最后一页时翻页` — 双字段 spec，openSpec 后 goNext，`currentPage` 变 1
6. `goPrev — 翻到第二页后可回到第一页` — currentPage 0 → goNext → currentPage 1 → goPrev → currentPage 0
7. `goPrev — 在第一页不变` — openSpec 后直接 goPrev，`currentPage` 仍为 0
8. `goNext — 最后一页时触发 completeAndSubmit，inquiry 关闭` — 单字段 spec，updateDraft 填值，goNext，`hasActive` 变 false
9. `completeAndSubmit — 全跳过时 onReply 不被调用` — openSpec 后不填值直接 completeAndSubmit，`onReply` mock 未被调用
10. `completeAndSubmit — 有填值时 onReply 被调用一次` — updateDraft 填值后 completeAndSubmit，`onReply` 被调用，参数为非空字符串
11. `skipCurrentField — 跳过后字段 skipped 为 true 且自动翻页` — 双字段 spec，skipCurrentField，currentPage 变 1
12. `dismiss — 关闭后 hasActive 为 false，onReply 不被调用` — openSpec 后 dismiss，`hasActive` false，`onReply` 未调用
13. `reset — 清空状态且清除 handledIds（同 messageId 可再次触发）` — maybeTrigger 触发一次后 reset，再次 maybeTrigger 同 id 成功
14. `maybeTrigger — 已处理的 messageId 不重复触发` — maybeTrigger 同 messageId 两次，第二次返回 false
15. `updateDraft — 更新后 currentDraft 反映新值` — openSpec，updateDraft，检查 `currentDraft.value`

### 验证

```bash
npx vitest run
npx tsc --noEmit
```

全部通过（原 126 + 新 ≥12）。

### ⛔ STOP — Task 1

```
【Task 1 简报】

新建文件：src/hooks/__tests__/useInlineInquiry.test.ts
用例数：X 个（全部通过）
npm test 结果：✅ XXX/XXX

ClarifyCardSpec fixture 结构说明：（简述 spec.fields 的字段名，确认与源码一致）
有无与计划不符的地方：[如有请说明]

等待 Claude 验收。验收通过后执行：
git add src/hooks/__tests__/useInlineInquiry.test.ts
git commit -m "test: ✅ Task 1 — useInlineInquiry 测试（X 用例）"
```

---

## Task 2 — useTokenUsage 测试

> ⚠️ Task 1 验收通过并 commit 后才开始

### 目标

覆盖 token 累加、快照模式、重置、setFromSystemReply，以及 RAF 批量合并机制。

### 执行前必读

```
src/hooks/useTokenUsage.ts   （完整读取，已知）
```

### 关键技术说明

useTokenUsage 使用 `requestAnimationFrame` 批量合并 usage 事件。测试中需要：

```ts
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// 触发 RAF 的方式：
await vi.runAllTimersAsync();
// 或：
vi.advanceTimersByTime(16);
```

### 测试用例（目标 ≥ 7 个）

1. `初始状态` — tokenIn/tokenOut/ctxUsed/ctxMax/cost 全为 null
2. `onUsage 增量模式 — 多次调用累加 tokenIn` — 调用两次 onUsage({inputTokens:100}, false)，flush 后 tokenIn 为 200
3. `onUsage 快照模式 — 覆盖而非累加` — 先增量 100，再快照 50，flush 后 tokenIn 为 50
4. `同一帧多个 onUsage 合并后只触发一次 setState` — 连续调用多次 onUsage，flush 一次后状态正确（验证批量合并，不验证 setState 次数，只验证最终值）
5. `resetUsage — 重置后全部回到 null` — onUsage → flush → resetUsage，全 null
6. `setFromSystemReply — 直接写入 tokenIn/ctxUsed/ctxMax` — 不经 onUsage，直接调用 setFromSystemReply，验证对应值
7. `onUsage ctxUsed/ctxMax 字段写入` — 传入含 ctxUsed/ctxMax 的 usage，flush 后验证
8. `onUsage cost 字段累加` — 传入含 cost 的 usage，flush 后验证

### 验证

```bash
npx vitest run
npx tsc --noEmit
```

### ⛔ STOP — Task 2

```
【Task 2 简报】

新建文件：src/hooks/__tests__/useTokenUsage.test.ts
用例数：X 个（全部通过）
npm test 结果：✅ XXX/XXX

RAF 触发方式实际用的：[vi.runAllTimersAsync / vi.advanceTimersByTime(16) / 其他]
有无与计划不符的地方：[如有请说明]

等待 Claude 验收。验收通过后执行：
git add src/hooks/__tests__/useTokenUsage.test.ts
git commit -m "test: ✅ Task 2 — useTokenUsage 测试（X 用例）"
```

---

## Task 3 — useActivityTimeline 测试

> ⚠️ Task 2 验收通过并 commit 后才开始

### 目标

覆盖时间线条目的增删：思考占位、CoT 同步、工具调用/结果、keepalive hint、重置。

### 执行前必读

```
src/hooks/useActivityTimeline.ts         （完整读取，已知）
src/types/gateway.ts                     （读取 GatewayToolPayload / GatewayKeepalivePayload 类型）
```

### 关键技术说明

`scheduleCotSyncFromFullText` 有 300ms 防抖。测试中需要 `vi.useFakeTimers()` + `vi.advanceTimersByTime(300)`。

### 测试用例（目标 ≥ 8 个）

1. `初始状态` — activityTimeline 为空数组
2. `resetTimeline` — 添加条目后调用，timeline 变空
3. `resetWithThinkingPlaceholder` — 调用后 timeline 有一条 type=thinking_placeholder 的条目
4. `onToolEvent tool_call` — 调用后 timeline 新增一条 type=tool_call 的条目，toolName 正确
5. `onToolEvent tool_result` — 调用后 timeline 新增一条 type=tool_result 的条目，isError=false
6. `onToolEvent tool_result isError=true` — 传入 state:'error'，isError 为 true
7. `onKeepalive` — 调用后 timeline 新增一条 type=keepalive_hint 的条目（读源码确认 payload 结构）
8. `scheduleCotSyncFromFullText — [cot]...[/cot] 格式` — 传入含 [cot] 标记的文本，advanceTimersByTime(300) 后，timeline 出现 type=cot 条目，content 正确
9. `scheduleCotSyncFromFullText — <think>...</think> 格式` — 同上，换 think 标签
10. `scheduleCotSyncFromFullText — 300ms 防抖，多次调用只触发一次` — 连续调用三次，只 advance 一次，cot 内容是最后一次的文本

### 验证

```bash
npx vitest run
npx tsc --noEmit
```

### ⛔ STOP — Task 3

```
【Task 3 简报】

新建文件：src/hooks/__tests__/useActivityTimeline.test.ts
用例数：X 个（全部通过）
npm test 结果：✅ XXX/XXX

onKeepalive payload 实际结构：（简述从 gateway.ts 读到的字段名）
有无与计划不符的地方：[如有请说明]

等待 Claude 验收。验收通过后执行：
git add src/hooks/__tests__/useActivityTimeline.test.ts
git commit -m "test: ✅ Task 3 — useActivityTimeline 测试（X 用例）"
```

---

## Task 4 — useTypewriter 测试（保守范围）

> ⚠️ Task 3 验收通过并 commit 后才开始

### 目标

覆盖 useTypewriter 中**不依赖 RAF 精确时序**的行为（enabled=false 模式、reset、feed 不抛错）。  
RAF 动画精确时序**不在本计划范围内**，不要强行测试。

### 执行前必读

```
src/hooks/useTypewriter.ts   （完整读取，已知）
```

### 测试用例（目标 ≥ 5 个）

1. `enabled=false — 初始状态` — displayedText 为空，isTyping 为 false
2. `enabled=false — feed 调用不抛错，displayedText 不变` — feed('hello')，displayedText 仍为空
3. `enabled=false — finish 调用不抛错` — finish() 不报错
4. `enabled=false — reset 调用不抛错，displayedText 仍为空` — reset() 不报错，displayedText 为空
5. `enabled=false — onFinished 不被调用` — feed + finish + advanceTimersByTime(1000)，onFinished mock 未被调用

**可选（如果 vi.useFakeTimers 下 RAF 可正常驱动）：**

6. `enabled=true — feed 后 isTyping 最终变为 false（流结束后）` — feed('hello') + finish() + 推进足够时间，isTyping 回到 false，onFinished 被调用

> 第 6 项如果在 jsdom/fake timers 下 RAF 行为不符合预期（死循环或永远不触发），**跳过第 6 项**，只写 5 个用例，在简报中说明原因。不要为了测第 6 项修改 hook 源码。

### 验证

```bash
npx vitest run
npx tsc --noEmit
```

### ⛔ STOP — Task 4

```
【Task 4 简报】

新建文件：src/hooks/__tests__/useTypewriter.test.ts
用例数：X 个（全部通过）
npm test 结果：✅ XXX/XXX

第 6 项（RAF 动画）：[已测试通过 / 跳过，原因：xxx]

等待 Claude 验收。验收通过后执行：
git add src/hooks/__tests__/useTypewriter.test.ts
git commit -m "test: ✅ Task 4 — useTypewriter 测试（X 用例）"
```

---

## Task 5 — oct-gateway 架构文档

> ⚠️ Task 4 验收通过并 commit 后才开始

### 目标

为 oct-gateway/ 写第一份架构文档，让 AI 接手网关改动时不需要重新读全部代码。

### 执行前必读（全部读取）

```
oct-gateway/index.js           （入口，了解启动与路由）
oct-gateway/streamChat.js      （核心：流式转发逻辑）
oct-gateway/sessionManager.js  （会话管理，若存在）
oct-gateway/toolRouter.js      （工具路由，若存在）
oct-gateway/memoryService.js   （内存服务，若存在）
oct-gateway/config.js          （配置加载，若存在）
oct-gateway/package.json       （依赖）
```

> 文件名可能与上面不完全一致，请先列出 oct-gateway/ 目录下的实际文件，再按实际情况读取。

### 执行内容

新建 `docs/02_architecture/GATEWAY_OVERVIEW.md`，包含：

**1. 一句话定位**  
网关的职责：接收前端 WebSocket、路由到各 AI Provider、返回流式结果。

**2. 启动与端口**  
- WebSocket 端口：18789  
- HTTP 端口：18790  
- 启动命令（从 index.js 读取）  

**3. 目录结构**（只列关键文件）

| 文件 | 职责 |
|------|------|
| index.js | 入口：启动 WS/HTTP 服务，注册路由 |
| ... | ... |

**4. 消息流转（网关视角）**

文字描述：前端 WebSocket 消息 → 网关收到 → 解析 session/model/messages → 调用 streamChat → 各 Provider SSE/HTTP → 逐 token push 回前端

**5. Provider 支持**  
列出网关支持的 AI Provider（从代码中读取）。

**6. 工具调用链路**（如果有 toolRouter）  
简述工具调用的路由与结果回传流程。

**7. 配置与 Key 加载顺序**  
`.env`、`config.json`、用户配置的优先级（从代码读取实际逻辑）。

**8. 高风险区域**  
标注哪些文件/函数改动风险高。

### 格式要求

- 总长 200 行以内  
- 中文  
- 不复制源代码，只写描述和路径

### 验证

```
npx tsc --noEmit
npm test
```

（只验证已有测试不回归，文档本身无 tsc 需求。）

### ⛔ STOP — Task 5（最终）

```
【Task 5 简报 — 本计划全部完成】

新建文件：docs/02_architecture/GATEWAY_OVERVIEW.md（行数：xxx）

读取的实际文件列表：
- oct-gateway/xxx.js — 职责
- ...

Provider 列表（从代码读到的）：[列出]

有无读不到或不确定的部分：[如有请说明]

npm test 最终结果：✅ XXX/XXX
tsc 结果：✅ 0 errors

本次新增文件汇总：
- src/hooks/__tests__/useInlineInquiry.test.ts
- src/hooks/__tests__/useTokenUsage.test.ts
- src/hooks/__tests__/useActivityTimeline.test.ts
- src/hooks/__tests__/useTypewriter.test.ts
- docs/02_architecture/GATEWAY_OVERVIEW.md

等待 Claude 最终验收。验收通过后执行：
git add docs/02_architecture/GATEWAY_OVERVIEW.md
git commit -m "docs: ✅ Task 5 — oct-gateway 架构文档"
git commit --allow-empty -m "test+docs: ✅ 全部完成 — coverage-round2 + gateway docs"
git checkout main
git merge test/coverage-round2 --no-ff -m "test+docs: 合并 test/coverage-round2（测试扩展至 XXX 用例 + gateway 文档）"
```

完成后补 changelog：  
`docs/05_changelog/2026-04-29-coverage-round2-and-gateway-docs.md`

---

## 打标规则

| 情况 | 动作 |
|------|------|
| 验收通过 | Claude 回复「✅ Task X 验收通过」+ 下一步提示词代码框 |
| 验收不通过 | Claude 回复「❌ Task X 不通过」+ 具体修改建议，不给 commit 指令 |
| 修改后通过 | Claude 回复「✅ 修改后通过」+ commit 指令 + 下一步提示词 |

---

## 注意事项

- 每个 Task 完成后必须停下，不要提前写下一个 Task
- useTypewriter 的 RAF 精确时序测试是可选项，不要为它修改 hook 源码
- Task 5 是纯文档，不改任何 src/ 文件

---

*本文件是执行包，完成后保留在 docs/_archive/coverage-and-gateway-docs-2026-04/。*
