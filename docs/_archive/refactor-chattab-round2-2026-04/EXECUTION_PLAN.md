# ChatTab.v2.tsx 第二轮拆分执行计划

> 归档类型：Cursor 执行包  
> 创建日期：2026-04-29  
> 目标：把 ChatTab.v2.tsx 从 856 行拆到 ~600 行以下  
> 执行者：Cursor  
> 验收者：Zilong / Claude  

---

## 背景

第一轮（refactor-chattab-2026-04）已把 useTtsPlayback / useImageStudio / useOnboarding 抽出去。  
ChatTab 目前 856 行，仍混合了：类型定义、能力栏交互逻辑、Portal 渲染、内联 SVG 滚动按钮。  
CLAUDE.md 规则：超 500 行必须拆分，禁止继续堆新功能。

---

## 重要说明

- 不改聊天主链路（useMessages / useStreamPainting / TurnFSM / StreamRouter）
- 每个 Task 只做一件事，tsc 必须干净才算完成
- 验收方式：Claude / Zilong 读简报 + tsc 通过

---

## 开始前：Cursor 需要读取的文件

```
src/ui/chat/ChatTab.v2.tsx          （完整读取）
src/ui/chat/MessageList.tsx         （看 ChatMessage / UploadedFile 的 import 来源）
src/hooks/useMessages.ts            （看 ChatMessage / UploadedFile 的 import 来源）
src/hooks/useFileAttachment.ts      （看 UploadedFile 的 import 来源）
```

---

## Task 1 — 提取类型到 `src/ui/chat/chatTypes.ts`

### 目标

把 ChatTab.v2.tsx 顶部的类型定义移到独立文件，减少 ChatTab 直接承载的内容。

### 执行内容

**新建** `src/ui/chat/chatTypes.ts`，内容：

```ts
// ChatTab 相关核心类型（单一来源）

export interface ToolEventItem {
  callId: string;
  tool: string;
  args?: Record<string, unknown>;
  state: 'executing' | 'done' | 'error';
  resultPreview?: string;
  error?: string;
  elapsedMs?: number;
  startedAt: number;
}

export interface UploadedFile {
  name: string;
  size: number;
  ext: string;
  mimeType: string;
  isText: boolean;
  content: string | null;
  base64?: string;
  path?: string;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  isStreamingRaw?: boolean;
  timestamp: string | number;
  imageDataUrl?: string;
  isSystemReply?: boolean;
  files?: UploadedFile[];
  toolEvents?: ToolEventItem[];
}

export interface ChatTabProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  getNextMessageId: () => number;
  onStatusChange?: (wsConnected: boolean, isStreaming: boolean, modelName?: string, tokenIn?: number | null, tokenOut?: number | null, ctxUsed?: number | null, ctxMax?: number | null) => void;
  onSwitchTab?: (tab: 'chat' | 'sound' | 'reaper') => void;
}
```

**修改** `src/ui/chat/ChatTab.v2.tsx`：
- 删除上面四个 interface 的定义
- 改为 `import type { ToolEventItem, ChatMessage, UploadedFile, ChatTabProps } from './chatTypes';`

**检查并修改** 以下文件中的 ChatMessage / UploadedFile import 来源：
- `src/ui/chat/MessageList.tsx`
- `src/hooks/useMessages.ts`
- `src/hooks/useFileAttachment.ts`
- 任何其他从 `ChatTab.v2` 中 import 这些类型的文件

（如果某个文件已经是从 `ChatTab.v2` import，改成从 `./chatTypes` 或正确的相对路径 import。）

### 验证

```
npx tsc --noEmit
```

必须 0 错误。

### ⛔ STOP — Task 1

完成后输出简报：

```
【Task 1 简报】

新建文件：src/ui/chat/chatTypes.ts（行数：xxx）
ChatTab.v2.tsx 行数：xxx → xxx（减少 xx 行）
修改了哪些文件的 import：
- [文件名] — 改了什么

tsc 结果：✅ 0 errors

对外暴露说明：
- 四个类型现在从 chatTypes.ts export，原 ChatTab.v2.tsx 的 re-export 已删除
- 如有不符合预期的地方请说明

等待验收后继续 Task 2。
```

---

## Task 2 — 新建 `useCapabilityActions` hook

> ⚠️ Task 1 验收通过后才开始

### 目标

把 ChatTab.v2.tsx 中约 ~130 行的「能力/引导操作」逻辑抽出，让 ChatTab 只负责组合与渲染。

### 哪些内容要移出去

从 ChatTab.v2.tsx 中移出以下全部内容到新 hook：

1. `buildPromptOptimizeRequest` useCallback（约 3 行）
2. `appendImageCapabilityGuideMessage` useCallback（约 20 行）
3. `appendMusicCapabilityGuideMessage` useCallback（约 18 行）
4. `handleWelcomeAction` useCallback（约 30 行）
5. `handleSkipOnboarding` useCallback（约 3 行）
6. `handleCapabilityBarClick` useCallback（约 15 行）
7. `handleCapabilityBarSetup` useCallback（约 5 行）
8. `insertImageToChat` useCallback（约 13 行）

### 执行内容

**新建** `src/hooks/useCapabilityActions.ts`：

```ts
// Hook 负责「能力栏 / 首屏引导」相关的所有操作逻辑
// 不涉及流式主链路，不使用 TurnFSM / StreamRouter
```

Hook 签名（根据实际代码拟定）：

```ts
interface UseCapabilityActionsOptions {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  getNextMessageId: () => number;
  sendMessage: (...args: any[]) => any;
  quickSend: (text: string) => void;
  openImageStudio: (prefill?: string) => void;
  markPendingPromptOptimization: () => void;
  dismissOnboarding: () => void;
  onSwitchTab?: (tab: string) => void;
}

export function useCapabilityActions(options: UseCapabilityActionsOptions) {
  // 把上面 8 个函数移进来
  return {
    handleWelcomeAction,
    handleSkipOnboarding,
    handleCapabilityBarClick,
    handleCapabilityBarSetup,
    insertImageToChat,
  };
}
```

**修改** `src/ui/chat/ChatTab.v2.tsx`：
- 删除上面 8 个 useCallback
- 顶部加 `import { useCapabilityActions } from '../../hooks/useCapabilityActions';`
- 在组件内调用 `const { handleWelcomeAction, handleSkipOnboarding, handleCapabilityBarClick, handleCapabilityBarSetup, insertImageToChat } = useCapabilityActions({ ... });`

### 注意

- `appendImageCapabilityGuideMessage` 和 `appendMusicCapabilityGuideMessage` 是 hook 内部函数，**不需要 export**
- `buildPromptOptimizeRequest` 也是内部辅助，不需要 export
- 不要动 `useImageStudio` / `useOnboarding` 的逻辑，只是把调用它们的 handler 挪出去

### 验证

```
npx tsc --noEmit
```

必须 0 错误。

### ⛔ STOP — Task 2

完成后输出简报：

```
【Task 2 简报】

新建文件：src/hooks/useCapabilityActions.ts（行数：xxx）
ChatTab.v2.tsx 行数：xxx → xxx（减少 xx 行）

对外暴露说明：
- export 了哪些函数（只列对 ChatTab 可见的）
- 内部函数（未 export）：appendImageCapabilityGuideMessage, appendMusicCapabilityGuideMessage, buildPromptOptimizeRequest

有无妥协或特殊处理：[如有请说明]

tsc 结果：✅ 0 errors

等待验收后继续 Task 3。
```

---

## Task 3 — 提取 `ChatHeaderPortal` 组件

> ⚠️ Task 2 验收通过后才开始

### 目标

把 ChatTab.v2.tsx 中通过 `createPortal` 渲染到 `#chat-header-portal` 的 60 行 JSX 抽成独立组件，ChatTab 只传 props。

### 哪些内容要移出去

ChatTab.v2.tsx 中这一段（约行 574–633）：

```jsx
{typeof document !== 'undefined' && document.getElementById('chat-header-portal') && createPortal(
  <>
    <button ... VOICE ON/OFF ... />
    <button ... OPEN CANVAS ... />
    {speakingMessageId != null ? <button ... STOP VOICE ... /> : null}
    {ttsError ? <span ... TTS error ... /> : null}
    <button ... SETTINGS ... />
    <span ... ws-status ... />
    {... toolsSupport badge ...}
  </>,
  document.getElementById('chat-header-portal')!
)}
```

### 执行内容

**新建** `src/ui/chat/ChatHeaderPortal.tsx`：

```tsx
import React from 'react';
import { createPortal } from 'react-dom';

interface ChatHeaderPortalProps {
  ttsPlayback: boolean;
  onToggleTts: () => void;
  canvasOpen: boolean;
  onOpenCanvas: () => void;
  speakingMessageId: number | null | undefined;
  onStopTts: () => void;
  ttsError: string | null | undefined;
  wsConnected: boolean;
  wsReconnecting: boolean;
  wsError: string | null | undefined;
  gatewayCapabilities: any;  // 与 useMessages 返回的类型对齐
  onOpenSettings: () => void;
}

export const ChatHeaderPortal: React.FC<ChatHeaderPortalProps> = (props) => {
  const portal = typeof document !== 'undefined' ? document.getElementById('chat-header-portal') : null;
  if (!portal) return null;
  return createPortal(
    // 把原来的 <> ... </> JSX 粘进来
    <> ... </>,
    portal
  );
};
```

**修改** `src/ui/chat/ChatTab.v2.tsx`：
- 删除原来的 `createPortal(...)` 块
- 替换为 `<ChatHeaderPortal ... />`，传入对应 props
- 顶部加 import

### 验证

```
npx tsc --noEmit
```

必须 0 错误。

### ⛔ STOP — Task 3

完成后输出简报：

```
【Task 3 简报】

新建文件：src/ui/chat/ChatHeaderPortal.tsx（行数：xxx）
ChatTab.v2.tsx 行数：xxx → xxx（减少 xx 行）

对外暴露说明：
- ChatHeaderPortal 的 props 列表（简短）

有无妥协：[如有请说明，特别是类型用了 any 的地方]

tsc 结果：✅ 0 errors

等待验收后继续 Task 4。
```

---

## Task 4 — 提取 `ScrollToBottomButton` 组件

> ⚠️ Task 3 验收通过后才开始

### 目标

把 ChatTab.v2.tsx 中内联的「三段闪烁 chevron」滚动按钮（约 40 行）抽成组件。

### 哪些内容要移出去

ChatTab.v2.tsx 中（约行 681–719）：

```jsx
{scroll.showScrollBtn && (
  <div onClick={() => scroll.scheduleScrollAfterLayout(true)} style={{ ... }}>
    {[0, 1, 2].map((i) => (
      <svg key={i} ...>
        <polyline ... />
      </svg>
    ))}
  </div>
)}
```

### 执行内容

**新建** `src/ui/chat/ScrollToBottomButton.tsx`：

```tsx
import React from 'react';

interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
}

export const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({ visible, onClick }) => {
  if (!visible) return null;
  return (
    <div onClick={onClick} style={{ ... }}>
      {[0, 1, 2].map((i) => (
        <svg key={i} ...>
          <polyline ... />
        </svg>
      ))}
    </div>
  );
};
```

**修改** `src/ui/chat/ChatTab.v2.tsx`：
- 删除原来的内联块
- 替换为 `<ScrollToBottomButton visible={scroll.showScrollBtn} onClick={() => scroll.scheduleScrollAfterLayout(true)} />`
- 顶部加 import

### 验证

```
npx tsc --noEmit
```

必须 0 错误。

### ⛔ STOP — Task 4（最终）

完成后输出简报：

```
【Task 4 简报 — 本轮全部完成】

新建文件：src/ui/chat/ScrollToBottomButton.tsx（行数：xxx）
ChatTab.v2.tsx 最终行数：xxx（本轮起始 856 → 最终 xxx，共减少 xxx 行）

本轮新增文件汇总：
- src/ui/chat/chatTypes.ts
- src/hooks/useCapabilityActions.ts
- src/ui/chat/ChatHeaderPortal.tsx
- src/ui/chat/ScrollToBottomButton.tsx

tsc 结果：✅ 0 errors

等待 Zilong / Claude 最终验收。
```

完成后在 `docs/05_changelog/` 补一条：
`docs/05_changelog/2026-04-29-chattab-round2-refactor.md`

---

## 预期结果

| 阶段 | ChatTab 行数 |
|------|-------------|
| 本轮开始 | 856 行 |
| Task 1 后 | ~815 行 |
| Task 2 后 | ~685 行 |
| Task 3 后 | ~625 行 |
| Task 4 后 | ~590 行 |

---

*本文件是执行包，完成后保留在 docs/_archive/refactor-chattab-round2-2026-04/。*
