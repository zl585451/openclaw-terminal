# ChatTab.v2 重构执行计划

> 归档类型：Cursor 执行包
> 创建日期：2026-04-29
> 目标：把 ChatTab.v2.tsx（1049 行）中与聊天渲染无关的逻辑提取为独立 hook，降低单文件复杂度
> 执行者：Cursor
> 验收者：GPT-4 / Claude
> 监督者：Zilong

---

## 背景

`src/ui/chat/ChatTab.v2.tsx`（1049 行）是主聊天界面组件，目前混杂了四类不同职责：

1. **TTS 语音朗读**（~120 行）：`playBrowserTTS`、`playTTSForMessage`、`speakingMessageId`、`ttsError`、`speechUtteranceRef`、`audioRef`
2. **图片生成工作台**（~40 行）：`imageStudioOpen`、`imageStudioInitialPrompt` 状态 + 开关逻辑
3. **Onboarding 状态**（~30 行）：`onboardingDismissed` + `localStorage` 持久化 + 触发逻辑
4. **聊天核心**（剩余部分）：消息渲染、输入、WebSocket、FSM 编排

这次只提取前三类，聊天核心不动。

---

## 工作流说明

Cursor 读本文件 → 执行当前 Task → 到 STOP 点停下 → 生成简报
→ Zilong 把简报发给验收方（GPT / Claude）→ 验收通过则继续 → 不通过则返工

铁律：
- 每个 Task 只做一件事
- 每步完成必须跑 `npx tsc --noEmit`，0 错误才算完成
- 每步完成后 git commit 一次
- 不改任何父组件对 ChatTab 的调用方式
- 不改任何子组件的 props 接口

---

## 开始前确认

Cursor 在开始 Task 1 前执行：

- [ ] `npx tsc --noEmit` → 记录当前错误数（基准线，应为 0）
- [ ] `git status` → 确认工作区干净
- [ ] `git log --oneline -3` → 记录当前最新 commit

---

## Task 1 — 提取 `useTtsPlayback` hook

### 背景

TTS 语音朗读逻辑完全独立于消息流转，有自己的状态、ref 和异步逻辑，是最安全的第一刀。
当前散落在 ChatTab 组件体内，与其他逻辑交织。提取后 ChatTab 通过 `useTtsPlayback` 使用 `playTTSForMessage(msg)`（及 `stopTts` 等）。

### 读取文件

```
src/ui/chat/ChatTab.v2.tsx（完整读取）
```

### 执行内容

**Step 1**：新建 `src/hooks/useTtsPlayback.ts`

从 ChatTab.v2.tsx 移入以下内容：
- `speakingMessageId` useState
- `ttsError` useState
- `speechUtteranceRef` useRef
- `audioRef` useRef（如果 TTS 使用了 audio 播放）
- `playBrowserTTS` 函数
- `playTTSForMessage` 函数
- `handleTtsPlay`（如果存在独立的点击 handler）

hook 签名：

```typescript
export function useTtsPlayback(settings: TtsSettings) {
  return {
    speakingMessageId,
    ttsError,
    playTTSForMessage,   // 供消息列表中的朗读按钮调用
    stopTts,             // 停止当前朗读
  }
}
```

其中 `TtsSettings` 只需包含 `ttsPlayback`、`ttsProvider` 两个字段（从 useSettings 传入）。

**Step 2**：修改 `ChatTab.v2.tsx`

- 删除已移走的 useState、useRef 和函数（不保留副本）
- import useTtsPlayback，从 settings 中取需要的字段传入
- 解构 `{ speakingMessageId, ttsError, playTTSForMessage, stopTts }`
- 确保 `speakingMessageId` 和 `ttsError` 仍然传给渲染层（字段名不变）

### 约束（禁止触碰）

- 不改任何渲染 JSX 中对 `speakingMessageId`、`ttsError` 的引用方式
- 不改 TTS 的业务逻辑（fallback 顺序、错误处理）
- 不改 ipcRenderer 的调用方式
- 不动消息发送 / WebSocket / FSM 任何逻辑

### 验证命令

```bash
npx tsc --noEmit
```

---

### ⛔ STOP — Task 1 简报模板

```
=== Task 1 简报 ===

【完成状态】已完成 / 未完成（说明原因）

【新增文件】
- src/hooks/useTtsPlayback.ts（X 行）

【修改文件】
- src/ui/chat/ChatTab.v2.tsx（原 X 行 → 现 X 行，减少 X 行）

【tsc 验证结果】
基准错误数：0
当前错误数：X
结论：通过 / 不通过

【git commit】
commit hash: xxxxxxx
message: "refactor(Task1): extract useTtsPlayback hook from ChatTab"

【移走的内容清单】
- useState: speakingMessageId ✓/✗
- useState: ttsError ✓/✗
- speechUtteranceRef ✓/✗
- audioRef ✓/✗
- playBrowserTTS 函数 ✓/✗
- playTTSForMessage 函数 ✓/✗

【对外暴露说明】
useTtsPlayback return 里是否有不该暴露的内部 setter 或 ref？
（有 / 无，如有请列出并说明原因）

【遇到的问题】
（无 / 描述问题）

【等待验收】将此简报发给验收方，等待指令。
=================
```

---

## Task 2 — 提取 `useImageStudio` hook

> ⚠️ 必须在 Task 1 验收通过后才能开始

### 背景

ImageStudio（图片生成工作台）的开关状态和初始 prompt 与聊天核心无关。
当前 `imageStudioOpen`、`imageStudioInitialPrompt` 两个状态及其联动逻辑内嵌在 ChatTab 里，
提取后 ChatTab 通过一个 hook 拿到开关和 setter，渲染层不变。

### 读取文件

```
src/ui/chat/ChatTab.v2.tsx（完整读取）
src/ui/image/ImageStudio.tsx（了解 props 接口）
```

### 执行内容

**Step 1**：新建 `src/hooks/useImageStudio.ts`

移入：
- `imageStudioOpen` useState
- `imageStudioInitialPrompt` useState
- 打开 / 关闭 ImageStudio 的 handler（如 `handleOpenImageStudio`）
- 从 AI 回复自动提取图片 prompt 并写入 `imageStudioInitialPrompt` 的逻辑（如果有）

hook 签名：

```typescript
// 实现中传入 messages，用于在 assistant 非流式回复就绪后把优化结果注入工作台（与 registerPromptInjector 配合）
export function useImageStudio(messages: ChatMessage[]) {
  return {
    imageStudioOpen,
    imageStudioInitialPrompt,
    openImageStudio,      // 打开并可选设置初始 prompt
    closeImageStudio,
    toggleImageStudio,
    // 内部编排接口（ChatTab ↔ ImageStudio ↔ quickSend），非产品对外能力新增；仅用于保持提取前行为等价。
    registerPromptInjector,
    markPendingPromptOptimization,
  }
}
```

**Step 2**：修改 `ChatTab.v2.tsx`

- 删除已移走的 useState 和逻辑
- import useImageStudio，解构返回值
- 确保 `imageStudioOpen`、`imageStudioInitialPrompt` 仍然传给 `<ImageStudio>` 组件（props 名不变）

### 约束（禁止触碰）

- 不改 `<ImageStudio>` 组件的 props 接口
- 不改打开 ImageStudio 的触发条件逻辑
- 不动 TTS、消息发送、WebSocket 任何逻辑

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
- src/hooks/useImageStudio.ts（X 行）

【修改文件】
- src/ui/chat/ChatTab.v2.tsx（原 X 行 → 现 X 行，减少 X 行）

【tsc 验证结果】
基准错误数：0
当前错误数：X
结论：通过 / 不通过

【git commit】
commit hash: xxxxxxx
message: "refactor(Task2): extract useImageStudio hook from ChatTab"

【移走的内容清单】
- useState: imageStudioOpen ✓/✗
- useState: imageStudioInitialPrompt ✓/✗
- 开关 handler 逻辑 ✓/✗

【对外暴露说明】
（有 / 无）

【遇到的问题】
（无 / 描述问题）

【等待验收】将此简报发给验收方，等待指令。
=================
```

---

## Task 3 — 提取 `useOnboarding` hook

> ⚠️ 必须在 Task 2 验收通过后才能开始

### 背景

`onboardingDismissed` 状态管理着首次使用引导的显示逻辑，包含 localStorage 持久化。
这与聊天核心完全无关，提取后逻辑更内聚，也方便将来修改引导逻辑。

### 读取文件

```
src/ui/chat/ChatTab.v2.tsx（完整读取，此时应已缩减约 160 行）
src/ui/onboarding/WelcomeHero.tsx（了解 props 接口）
```

### 执行内容

**Step 1**：新建 `src/hooks/useOnboarding.ts`

移入：
- `onboardingDismissed` useState（含 localStorage 读取的初始化函数）
- `handleDismissOnboarding` 或类似的 dismiss handler（含 localStorage 写入）
- 判断是否显示 onboarding 的派生逻辑（如果有）

hook 签名：

```typescript
export function useOnboarding() {
  return {
    onboardingDismissed,
    dismissOnboarding,   // 调用后设置 dismissed + 写 localStorage
    // 实现另含 resetOnboardingForDev：仅 DEV「欢迎页」按钮，内部编排、非产品能力新增
  }
}
```

**Step 2**：修改 `ChatTab.v2.tsx`

- 删除已移走的 useState 和 handler
- import useOnboarding，解构返回值
- 确保 `onboardingDismissed` 在渲染条件判断处仍然可用（字段名不变）

### 约束（禁止触碰）

- 不改 localStorage key 名称（`oct.onboarding.dismissed`）
- 不改 WelcomeHero 的 props 接口
- 不动其他任何逻辑

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
- src/hooks/useOnboarding.ts（X 行）

【修改文件】
- src/ui/chat/ChatTab.v2.tsx（原 X 行 → 现 X 行，减少 X 行）

【tsc 验证结果】
基准错误数：0
当前错误数：X
结论：通过 / 不通过

【git commit】
commit hash: xxxxxxx
message: "refactor(Task3): extract useOnboarding hook from ChatTab"

【移走的内容清单】
- useState: onboardingDismissed ✓/✗
- localStorage 初始化逻辑 ✓/✗
- dismissOnboarding handler ✓/✗

【对外暴露说明】
（有 / 无）

【最终行数对比】
ChatTab.v2.tsx 原始行数：1049
ChatTab.v2.tsx 当前行数：X
总计减少：X 行

【遇到的问题】
（无 / 描述问题）

【等待验收】将此简报发给验收方，等待指令。
=================
```

---

## 验收方使用指引

每次收到简报，把以下内容 + 简报发给验收方（GPT 或 Claude）：

```
你是 OpenClaw Terminal 项目的代码审查员。
项目路径：E:\windows-window\OpenClaw-Terminal
项目语言：TypeScript + React

我刚完成了一个重构步骤，简报如下：
[粘贴简报]

请验收：
1. 读取简报列出的所有新增和修改文件
2. 确认新 hook 职责单一，没有混入其他逻辑
3. 确认被移走的代码在 ChatTab.v2.tsx 中已删除（无残留副本）
4. 确认 ChatTab 对外 props 接口没有变化
5. 重点检查"对外暴露说明"——是否有内部 setter 被暴露

结论：
✅ 验收通过 → 告诉 Cursor："Task X 验收通过，请执行下一步指令：[粘贴下一个 Task 内容]"
❌ 验收不通过 → 列出具体问题，告诉 Cursor 修复后重新生成简报
```

---

## 重构完成后的预期状态

| 文件 | 重构前 | 重构后 | 职责 |
|------|--------|--------|------|
| `ChatTab.v2.tsx` | 1049 行 | ~800 行 | 聊天核心渲染 + 组合层 |
| `useTtsPlayback.ts` | — | ~100 行 | TTS 语音朗读 |
| `useImageStudio.ts` | — | ~40 行 | 图片工作台开关 |
| `useOnboarding.ts` | — | ~30 行 | 引导状态持久化 |

完成后建议补充：
- `docs/05_changelog/` 一条变更记录
- `docs/02_architecture/HOOKS_MAP.md` 更新新增的三个 hook

---

*本文件是执行包，完成后保留在 `docs/_archive/refactor-chattab-2026-04/`，不进入主文档区。*
