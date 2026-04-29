# useMessages 重构执行计划

> 归档类型：Cursor 执行包  
> 创建日期：2026-04-28  
> 目标文件：`src/hooks/useMessages.ts`（约 1235 行）  
> 执行者：Cursor（自动模式）  
> 验收者：Claude / GPT-Codex  
> 监督者：Zilong

---

## 工作流说明

```
Cursor 读本文件 → 执行当前 Task → 到 STOP 点停下 → 生成简报
→ Zilong 把简报发给 Claude/Codex 验收
→ 验收通过：Cursor 执行下一个 Task
→ 验收不通过：Cursor 按反馈返工，重新生成简报
```

**铁律：**
- 每个 Task 只做一件事
- 每步完成必须跑 `npx tsc --noEmit`，0 错误才算完成
- 每步完成后 git commit 一次（commit message 用 Task 编号）
- 不改任何组件对 useMessages 的调用方式
- 不改 useMessages 对外 return 的任何字段名

---

## 当前状态（开始前确认）

在开始 Task 1 之前，Cursor 请确认：

- [ ] `src/hooks/useMessages.ts` 存在且可读
- [ ] 运行 `npx tsc --noEmit` → 记录当前错误数（基准线）
- [ ] 运行 `git status` → 确认工作区干净
- [ ] 运行 `git log --oneline -3` → 记录当前最新 commit

把以上结果写入简报 Section 0，然后开始 Task 1。

---

## Task 1 — 提取 `useTokenUsage` hook

### 背景

`useMessages.ts` 里有一套独立的 token 计费逻辑（tokenIn、tokenOut、ctxUsed、ctxMax、cost），
以及配套的 RAF flush 循环。这套逻辑与消息流转完全无关，是最安全的第一刀。

### 读取文件

```
src/hooks/useMessages.ts  （完整读取）
```

### 执行内容

**Step 1**：新建文件 `src/hooks/useTokenUsage.ts`

把以下内容从 `useMessages.ts` 移入新文件：
- `tokenIn`、`tokenOut`、`ctxUsed`、`ctxMax`、`cost` 五个 useState
- `usageFlushRafRef`（RAF ref）
- `onUsage` 回调函数（处理 gateway 返回的 usage 数据）
- usage 相关的 RAF flush 循环

新文件导出的 hook 签名：

```typescript
export function useTokenUsage() {
  // 内部管理五个计数状态 + RAF flush
  return {
    tokenIn,
    tokenOut,
    ctxUsed,
    ctxMax,
    cost,
    onUsage,      // 供 useWebSocket 调用的回调
    resetUsage,   // 发送新消息时重置所有计数为 0
  }
}
```

**Step 2**：修改 `useMessages.ts`

- 删除已移走的 useState、ref 和逻辑（不保留副本）
- 在顶部 import useTokenUsage
- 调用 `const { tokenIn, tokenOut, ctxUsed, ctxMax, cost, onUsage, resetUsage } = useTokenUsage()`
- 确保 `onUsage` 仍然被传给 `useWebSocket` 的对应参数
- 在 sendMessage/quickSend 开头调用 `resetUsage()`（替换原来的手动重置）
- useMessages 对外 return 里保持 `tokenIn, tokenOut, ctxUsed, ctxMax, cost` 字段不变

### 约束（禁止触碰）

- 不改 sendMessage / quickSend 的任何其他逻辑
- 不改 useMessages 对外 return 的字段名
- 不改任何调用 useMessages 的组件文件
- 不优化或修改 RAF flush 的时间逻辑，只是移动代码

### 验证命令

```bash
npx tsc --noEmit
```

必须：错误数 ≤ 基准线（理想为 0）

---

### ⛔ STOP — Task 1 简报模板

**Cursor 执行到这里必须停下，按以下模板生成简报，不要继续执行 Task 2。**

```
=== Task 1 简报 ===

【完成状态】已完成 / 未完成（说明原因）

【新增文件】
- src/hooks/useTokenUsage.ts（X 行）

【修改文件】
- src/hooks/useMessages.ts（原 X 行 → 现 X 行，减少 X 行）

【tsc 验证结果】
基准错误数：X
当前错误数：X
结论：通过 / 不通过

【git commit】
commit hash: xxxxxxx
message: "refactor(Task1): extract useTokenUsage hook"

【移走的内容清单】
- useState: tokenIn, tokenOut, ctxUsed, ctxMax, cost ✓/✗
- usageFlushRafRef ✓/✗
- onUsage 回调 ✓/✗
- RAF flush 循环 ✓/✗
- resetUsage 函数（新增） ✓/✗

【遇到的问题】
（无 / 描述问题）

【等待验收】请将此简报发送给 Claude 或 GPT-Codex 进行验收。
=================
```

---

## Task 2 — 提取 `useActivityTimeline` hook

> ⚠️ 必须在 Task 1 验收通过后才能开始

### 背景

`useMessages.ts` 里的 activityTimeline 状态和 onToolEvent 回调管理着工具调用的展示记录，
以及 CoT 同步的 debounce timer。这套逻辑与 token 计费和流式渲染都无关，可以独立提取。

### 读取文件

```
src/hooks/useMessages.ts  （完整读取）
src/hooks/useTokenUsage.ts  （了解上下文）
```

### 执行内容

**Step 1**：新建文件 `src/hooks/useActivityTimeline.ts`

把以下内容从 `useMessages.ts` 移入新文件：
- `activityTimeline` useState
- `cotSyncTimerRef`（CoT 同步 debounce timer ref）
- `onToolEvent` 回调函数（处理 tool 事件、追加 timeline 条目）
- CoT 同步定时器的启动 / 清理逻辑（300ms debounce 部分）

新文件导出的 hook 签名：

```typescript
export function useActivityTimeline(messages: Message[]) {
  return {
    activityTimeline,
    onToolEvent,      // 供 useWebSocket 调用的回调
    resetTimeline,    // 发送新消息时清空 timeline
  }
}
```

**Step 2**：修改 `useMessages.ts`

- 删除已移走的 useState、ref 和逻辑
- import useActivityTimeline，传入 messages
- 解构返回值，确保 onToolEvent 仍然传给 useWebSocket
- 在 sendMessage/quickSend 开头调用 resetTimeline()
- useMessages 对外 return 里保持 `activityTimeline` 字段不变

### 约束（禁止触碰）

- 不改 onToolEvent 处理 tool 事件的判断条件
- 不改 CoT debounce 的时间参数
- 不改 useMessages 对外 return 的字段名
- 不动 stream paint / sendMessage / quickSend 逻辑

### 验证命令

```bash
npx tsc --noEmit
```

---

### ⛔ STOP — Task 2 简报模板

```
=== Task 2 简报 ===

【完成状态】已完成 / 未完成（说明原因）

【新增文件】
- src/hooks/useActivityTimeline.ts（X 行）

【修改文件】
- src/hooks/useMessages.ts（原 X 行 → 现 X 行，减少 X 行）

【tsc 验证结果】
基准错误数：X
当前错误数：X
结论：通过 / 不通过

【git commit】
commit hash: xxxxxxx
message: "refactor(Task2): extract useActivityTimeline hook"

【移走的内容清单】
- useState: activityTimeline ✓/✗
- cotSyncTimerRef ✓/✗
- onToolEvent 回调 ✓/✗
- CoT debounce timer 逻辑 ✓/✗
- resetTimeline 函数（新增） ✓/✗

【遇到的问题】
（无 / 描述问题）

【等待验收】请将此简报发送给 Claude 或 GPT-Codex 进行验收。
=================
```

---

## Task 3 — 提取 `useStreamPainting` hook

> ⚠️ 必须在 Task 2 验收通过后才能开始

### 背景

`useMessages.ts` 里有一套 RAF（requestAnimationFrame）驱动的逐字符渲染循环。
这是流式打字效果的核心，逻辑完全内聚，可以独立提取。
这一步风险中等，因为它直接操作 messages 状态，需要仔细核对接口传参。

### 读取文件

```
src/hooks/useMessages.ts  （完整读取）
src/core/streamRouter/  （了解 oct.stream 的 API）
```

### 执行内容

**Step 1**：新建文件 `src/hooks/useStreamPainting.ts`

把以下内容从 `useMessages.ts` 移入新文件：
- `streamPaintRafRef`
- `streamPaintBudget` 相关变量
- `runStreamPaintTick` 函数（RAF 回调）
- stream painting 的启动 / 停止 / 清理逻辑

新文件导出的 hook 签名：

```typescript
export function useStreamPainting(
  oct: OctRuntime,
  setMessages: Dispatch<SetStateAction<Message[]>>,
  scrollReconcile: () => void,
) {
  return {
    startPainting,   // 在 onChatDelta 开始时调用
    stopPainting,    // 在 onChatDone 时调用
  }
}
```

**Step 2**：修改 `useMessages.ts`

- 删除已移走的 RAF ref、变量和函数
- import useStreamPainting，传入 oct、setMessages、scroll.reconcile
- 在 onChatDelta 处调用 startPainting()
- 在 onChatDone 处调用 stopPainting()
- useEffect cleanup 里调用 stopPainting()

### 约束（禁止触碰）

- 不改 RAF 的帧预算数值（只移动，不优化）
- 不改逐字符渲染的 buffer 消费逻辑
- 不改 scroll.reconcile 的调用时机
- 不改 useMessages 对外 return 的字段名

### 验证命令

```bash
npx tsc --noEmit
```

---

### ⛔ STOP — Task 3 简报模板

```
=== Task 3 简报 ===

【完成状态】已完成 / 未完成（说明原因）

【新增文件】
- src/hooks/useStreamPainting.ts（X 行）

【修改文件】
- src/hooks/useMessages.ts（原 X 行 → 现 X 行，减少 X 行）

【tsc 验证结果】
基准错误数：X
当前错误数：X
结论：通过 / 不通过

【git commit】
commit hash: xxxxxxx
message: "refactor(Task3): extract useStreamPainting hook"

【移走的内容清单】
- streamPaintRafRef ✓/✗
- streamPaintBudget 相关变量 ✓/✗
- runStreamPaintTick 函数 ✓/✗
- startPainting / stopPainting 封装（新增） ✓/✗
- onChatDelta / onChatDone 调用点已更新 ✓/✗

【遇到的问题】
（无 / 描述问题）

【等待验收】请将此简报发送给 Claude 或 GPT-Codex 进行验收。
=================
```

---

## Task 4 — 合并 sendMessage / quickSend 重复逻辑

> ⚠️ 必须在 Task 3 验收通过后才能开始

### 背景

`useMessages.ts` 里 sendMessage 和 quickSend 的逻辑约 95% 相同，合计约 700 行。
两者唯一区别是 sendMessage 支持 images 和 files 附件，quickSend 不支持。
这一步只在文件内部合并，不新建文件，风险最可控。

### 读取文件

```
src/hooks/useMessages.ts  （完整读取，此时应已缩减到约 500 行）
```

### 执行内容

在 `useMessages.ts` 内部创建私有函数（不 export）：

```typescript
async function _sendMessageCore(options: {
  text: string
  images?: ImageAttachment[]
  files?: FileAttachment[]
}): Promise<void> {
  // 把 sendMessage 和 quickSend 共同的逻辑放这里：
  // - permission 校验
  // - FSM reset
  // - streaming 状态初始化
  // - messages append
  // - resetUsage() / resetTimeline()
  // - stream 开启
}
```

然后：
- `sendMessage` 改为：做参数校验后调用 `_sendMessageCore({ text, images, files })`
- `quickSend` 改为：做参数校验后调用 `_sendMessageCore({ text })`

### 约束（禁止触碰）

- 不改 sendMessage / quickSend 的对外函数签名
- 不改权限校验的判断条件
- 不改任何状态变量名
- 不改 permission check 的执行顺序

### 验证命令

```bash
npx tsc --noEmit
```

---

### ⛔ STOP — Task 4 简报模板

```
=== Task 4 简报 ===

【完成状态】已完成 / 未完成（说明原因）

【修改文件】
- src/hooks/useMessages.ts（原 X 行 → 现 X 行，减少 X 行）

【tsc 验证结果】
基准错误数：X
当前错误数：X
结论：通过 / 不通过

【git commit】
commit hash: xxxxxxx
message: "refactor(Task4): deduplicate sendMessage/quickSend via _sendMessageCore"

【合并清单】
- _sendMessageCore 函数已创建 ✓/✗
- sendMessage 调用 _sendMessageCore ✓/✗
- quickSend 调用 _sendMessageCore ✓/✗
- sendMessage 对外签名不变 ✓/✗
- quickSend 对外签名不变 ✓/✗

【最终行数对比】
useMessages.ts 原始行数：1235
useMessages.ts 当前行数：X
总计减少：X 行

【遇到的问题】
（无 / 描述问题）

【等待验收】请将此简报发送给 Claude 或 GPT-Codex 进行验收。
=================
```

---

## Task 4.5 — 收尾封装：撤回 useTokenUsage 的 setter 泄漏

> ⚠️ 必须在 Task 4 验收通过后才能开始  
> 📌 此任务在 Task 1 验收时发现，是计划外的必要修补

### 背景

Task 1 完成后，`useTokenUsage` 暴露了三个内部 setter（`setTokenIn`、`setCtxUsed`、`setCtxMax`）供 `useMessages.ts` 第 620-628 行的系统回复解析逻辑直接调用。这破坏了封装，外部可以绕过 onUsage 通道随意修改内部状态。

### 读取文件

```
src/hooks/useTokenUsage.ts
src/hooks/useMessages.ts（重点读第 615-635 行附近的系统回复解析段）
```

### 执行内容

**Step 1**：在 `useTokenUsage.ts` 新增一个方法，专门处理从系统回复文本解析出的 token 数据：

```typescript
// 新增到 useTokenUsage 的 return 里
setFromSystemReply: (params: {
  tokenIn?: number
  ctxUsed?: number
  ctxMax?: number
}) => void
```

内部实现就是直接调用对应的 setState，不走 RAF flush（系统回复是一次性写入，不需要批量合并）。

**Step 2**：修改 `useMessages.ts` 第 620-628 行附近：

- 把直接调用 `setTokenIn` / `setCtxUsed` / `setCtxMax` 的地方改为调用 `setFromSystemReply({ tokenIn, ctxUsed, ctxMax })`
- 从 useTokenUsage 的解构里删掉 `setTokenIn`、`setCtxUsed`、`setCtxMax`

**Step 3**：修改 `useTokenUsage.ts`：

- 删除 return 里的 `setTokenIn`、`setCtxUsed`、`setCtxMax`（不再对外暴露）
- 添加 `setFromSystemReply` 到 return

### 验证命令

```bash
npx tsc --noEmit
```

---

### ⛔ STOP — Task 4.5 简报模板

```
=== Task 4.5 简报 ===

【完成状态】已完成 / 未完成（说明原因）

【修改文件】
- src/hooks/useTokenUsage.ts
- src/hooks/useMessages.ts

【tsc 验证结果】
当前错误数：X
结论：通过 / 不通过

【git commit】
commit hash: xxxxxxx
message: "refactor(Task4.5): encapsulate token setters in useTokenUsage"

【封装清单】
- setTokenIn 已从 return 中删除 ✓/✗
- setCtxUsed 已从 return 中删除 ✓/✗
- setCtxMax 已从 return 中删除 ✓/✗
- setFromSystemReply 方法已添加 ✓/✗
- useMessages.ts 调用改为 setFromSystemReply ✓/✗

【等待验收】请将此简报发送给 Claude 或 GPT-Codex 进行验收。
=================
```

---

## 验收方指引（发给 Claude 或 GPT-Codex）

> 每次收到简报后，把以下内容 + 简报内容一起发给验收方：

```
你是 OpenClaw Terminal 项目的代码审查员。
项目路径：E:\windows-window\OpenClaw-Terminal
项目语言：TypeScript + React

我刚完成了一个重构步骤，简报如下：

[粘贴简报内容]

请你做以下验收：

1. 读取简报中列出的所有新增和修改文件
2. 确认新 hook 的职责单一（只做简报描述的那一件事，没有混入其他逻辑）
3. 确认被提取的代码在 useMessages.ts 中已删除（无残留副本）
4. 确认 useMessages.ts 对外 return 的字段没有发生变化
5. 检查是否有明显的类型断裂或逻辑断裂

最终给出以下两种结论之一：

✅ 验收通过：可以继续执行下一个 Task。
   → 请告诉 Cursor："Task X 验收通过，请继续执行 Task X+1。"

❌ 验收不通过：列出具体问题。
   → 请告诉 Cursor："Task X 验收不通过，问题如下：[问题列表]，请修复后重新生成简报。"
```

---

## 重构完成后的最终状态

预期结果：

| 文件 | 重构前行数 | 重构后行数 | 职责 |
|------|-----------|-----------|------|
| `useMessages.ts` | ~1235 | ~350 | 消息生命周期 + FSM 编排 |
| `useTokenUsage.ts` | — | ~100 | token 计费（封装完整，无 setter 泄漏） |
| `useActivityTimeline.ts` | — | ~100 | 工具事件 + CoT timeline |
| `useStreamPainting.ts` | — | ~90 | RAF 流式渲染 |

重构完成后，建议补充：
- `docs/02_architecture/HOOKS_MAP.md`：记录各 hook 的职责和依赖关系
- `docs/05_changelog/`：补一条重构记录

---

*本文件是执行包，完成后归档至 `docs/_archive/refactor-useMessages-2026-04/`，不进入主文档区。*
