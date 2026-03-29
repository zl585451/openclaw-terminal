# 重构第一步：抽离 useTypewriter Hook

## 为什么从打字机开始？

当前 ChatTab_v2.tsx 里打字机逻辑散布在 **4 个地方**，共享 **8 个 ref**：

| 位置 | 做什么 | 共享的 ref |
|------|--------|-----------|
| `scheduleFullTextSync` 里的 `driveTypewriter` (System A) | setTimeout 驱动的字符推进 | `displayedLenRef`, `rafFlushRef`, `streamDoneReceived`, `visibleFullTextRef` |
| `useEffect` 里的 `tick` 循环 (System B) | rAF 驱动的字符推进 | `displayedLenRef`, `typewriterRafRef`, `streamDoneReceived`, `typingBudgetMsRef`, `visibleFullTextRef` |
| StreamRouter COMPLETED handler | 强制快进 + 清零 | `displayedLenRef`, `streamDoneReceived`, `rafFlushRef`, `visibleFullTextRef` |
| `handleIncomingMessage` done 分支 | 设置 streamDoneReceived | `streamDoneReceived` |

**4 个写入者竞争同一组 ref = 无穷 bug。**

抽成 hook 后，只有 hook 内部能写这些 ref，外部只能调用 `feed(text)` 和 `finish()`。

---

## 目标结构

```
src/hooks/useTypewriter.ts    ← 新文件，~200 行
src/tabs/chat/ChatTab_v2.tsx  ← 删除所有打字机相关代码，调用 hook
```

### useTypewriter API 设计

```typescript
interface UseTypewriterOptions {
  /** 基础字符延迟（ms），来自 settings.streamSpeedMs */
  baseDelayMs: number;
  /** 打字音效模式 */
  typingSound: 'off' | 'typewriter' | 'soft' | 'bubble';
  /** 当打字机追完所有文字并收尾后调用 */
  onFinished: (finalText: string) => void;
}

interface UseTypewriterReturn {
  /** 喂入新的完整文本（每次调用传入累积的全文，不是增量） */
  feed: (fullText: string) => void;
  /** 通知流已结束，打字机应加速打完 */
  finish: () => void;
  /** 强制重置（新一轮对话开始时调用） */
  reset: () => void;
  /** 当前应该显示的文本（React state，驱动渲染） */
  displayedText: string;
  /** 是否正在打字中 */
  isTyping: boolean;
}
```

### 使用方式（ChatTab 里）

```typescript
const typewriter = useTypewriter({
  baseDelayMs: streamSpeedMs,
  typingSound: settings.typingSound,
  onFinished: (finalText) => {
    // 之前散在 tick 循环和 COMPLETED handler 里的清零逻辑
    oct.fsm.onTurnFinish();
    oct.ingest.reset();
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.isStreaming) {
        return prev.map((msg, i) =>
          i === prev.length - 1
            ? { ...msg, content: finalText, isStreaming: false, isStreamingRaw: false }
            : msg
        );
      }
      return prev;
    });
  },
});

// 在 stream tokens 事件里：
typewriter.feed(ingest.getAccumulatedRaw());

// 在 COMPLETED handler 里（不再做快进/清零）：
typewriter.finish();

// 在 sendMessage 里（新一轮开始）：
typewriter.reset();

// 在渲染里：
const textToShow = isStreamingMsg ? typewriter.displayedText : parsed.text;
```

---

## Cursor Prompt：创建 useTypewriter.ts

在 `src/hooks/useTypewriter.ts` 创建新文件，内容如下。
这是一个完整的、可直接使用的 hook 实现。

### 文件内容

```typescript
// src/hooks/useTypewriter.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import { playClickSound, resetSoundCounter } from '../utils/clickSound';
import { parseOptionBox } from '../utils/optionBoxParser';

export interface UseTypewriterOptions {
  baseDelayMs: number;
  typingSound: 'off' | 'typewriter' | 'soft' | 'bubble';
  onFinished: (finalText: string) => void;
}

export interface UseTypewriterReturn {
  feed: (fullText: string) => void;
  finish: () => void;
  reset: () => void;
  displayedText: string;
  isTyping: boolean;
}

// ── 字符工具函数 ────────────────────────────────────────

function getNextCharIndex(text: string, idx: number): number {
  if (idx >= text.length) return idx;
  const code = text.charCodeAt(idx);
  if (code >= 0xd800 && code <= 0xdbff && idx + 1 < text.length) {
    const next = text.charCodeAt(idx + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return idx + 2;
  }
  return idx + 1;
}

function isWordChar(ch: string): boolean {
  return /^[A-Za-z0-9_]+$/.test(ch);
}

function charDelayMs(ch: string, base: number): number {
  const d = Math.max(base, 40);
  if (ch === '\n') return d + d * 2.5;
  if ('。！？…'.includes(ch)) return d + d * 2;
  if ('.!?'.includes(ch)) return d + d * 1.5;
  if (',，、;；'.includes(ch)) return d + d * 0.6;
  return d;
}

function computeRangeCostMs(text: string, start: number, end: number, base: number): number {
  let cost = 0;
  let i = start;
  while (i < end) {
    const ni = getNextCharIndex(text, i);
    cost += charDelayMs(text.slice(i, ni), base);
    i = ni;
  }
  return cost;
}

function pickPreferredNextIndex(text: string, idx: number, maxChars: number): number {
  if (idx >= text.length) return idx;
  const firstEnd = getNextCharIndex(text, idx);
  const firstCh = text.slice(idx, firstEnd);
  if (!isWordChar(firstCh)) return firstEnd;

  let i = idx;
  let used = 0;
  while (used < maxChars && i < text.length) {
    const ni = getNextCharIndex(text, i);
    if (!isWordChar(text.slice(i, ni))) break;
    i = ni;
    used += 1;
  }
  if (used < maxChars && i < text.length) {
    const ni = getNextCharIndex(text, i);
    if (text.slice(i, ni) === ' ') return ni;
  }
  return i;
}

// ── Hook ────────────────────────────────────────────────

export function useTypewriter(options: UseTypewriterOptions): UseTypewriterReturn {
  const { baseDelayMs, typingSound, onFinished } = options;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // ── 内部 refs：只有 hook 内部读写 ──
  const fullTextRef = useRef('');           // 累积的原始全文
  const visibleTextRef = useRef('');        // 解析后的可见正文
  const displayedLenRef = useRef(0);        // 当前已显示的字符数
  const streamDoneRef = useRef(false);      // 流是否已结束
  const rafRef = useRef<number | null>(null);
  const budgetRef = useRef(0);
  const lastTsRef = useRef(0);
  const startTsRef = useRef(0);

  // ── feed：外部每次传入累积全文 ──
  const feed = useCallback((rawFullText: string) => {
    fullTextRef.current = rawFullText;
    // 解析出可见正文（去掉 [pills]、[cot] 等标签内容）
    try {
      const parsed = parseOptionBox(rawFullText || '');
      visibleTextRef.current = (parsed.text ?? '').toString();
    } catch {
      visibleTextRef.current = rawFullText || '';
    }
    // 夹紧：如果可见文本因为标签被剥离而变短，避免 slice 越界
    if (displayedLenRef.current > visibleTextRef.current.length) {
      displayedLenRef.current = visibleTextRef.current.length;
    }
  }, []);

  // ── finish：通知流已结束 ──
  const finish = useCallback(() => {
    streamDoneRef.current = true;
  }, []);

  // ── reset：新一轮对话开始 ──
  const reset = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    fullTextRef.current = '';
    visibleTextRef.current = '';
    displayedLenRef.current = 0;
    streamDoneRef.current = false;
    budgetRef.current = 0;
    lastTsRef.current = 0;
    startTsRef.current = 0;
    setDisplayedText('');
    setIsTyping(false);
  }, []);

  // ── 唯一的 tick 循环 ──
  useEffect(() => {
    // 只要有新内容且 tick 未运行，就启动
    const tryStart = () => {
      if (rafRef.current !== null) return; // 已在运行
      if (visibleTextRef.current.length === 0) return; // 没东西显示
      if (displayedLenRef.current >= visibleTextRef.current.length && !streamDoneRef.current) return;

      setIsTyping(true);
      budgetRef.current = 20;
      startTsRef.current = performance.now();
      lastTsRef.current = 0;
      resetSoundCounter();

      const tick = (ts: number) => {
        if (!lastTsRef.current) lastTsRef.current = ts;
        const dt = Math.min(80, ts - lastTsRef.current);
        lastTsRef.current = ts;

        const full = visibleTextRef.current;
        const fullLen = full.length;
        let idx = displayedLenRef.current;

        // 追赶：平缓曲线
        const elapsed = ts - startTsRef.current;
        const backlog = fullLen - idx;
        let catchUpBoost = 0;
        if (elapsed > 2000 && !streamDoneRef.current) {
          if (backlog > 60) catchUpBoost = Math.min((backlog - 60) * 0.12, 10);
          if (backlog > 200) catchUpBoost = 10 + Math.min((backlog - 200) * 0.15, 20);
        }

        // stream 结束后加速收尾
        if (streamDoneRef.current && idx < fullLen) {
          budgetRef.current += 300;
        }

        budgetRef.current += dt + catchUpBoost;

        // 推进字符
        let typedThisFrame = 0;
        while (typedThisFrame < 4 && idx < fullLen) {
          const remain = 4 - typedThisFrame;
          let targetIdx = pickPreferredNextIndex(full, idx, remain);
          if (targetIdx <= idx) targetIdx = getNextCharIndex(full, idx);
          const cost = computeRangeCostMs(full, idx, targetIdx, baseDelayMs);
          if (budgetRef.current < cost) {
            const singleIdx = getNextCharIndex(full, idx);
            const singleCost = computeRangeCostMs(full, idx, singleIdx, baseDelayMs);
            if (budgetRef.current < singleCost) break;
            budgetRef.current -= singleCost;
            idx = singleIdx;
            typedThisFrame += 1;
            continue;
          }
          budgetRef.current -= cost;
          let count = 0;
          let j = idx;
          while (j < targetIdx && count < remain) {
            j = getNextCharIndex(full, j);
            count += 1;
          }
          idx = targetIdx;
          typedThisFrame += count;
        }

        if (idx !== displayedLenRef.current) {
          displayedLenRef.current = idx;
          setDisplayedText(full.slice(0, idx));
          if (typingSound !== 'off') playClickSound(typingSound);
        }

        // 追完且流已结束 → 收尾
        if (idx >= fullLen && streamDoneRef.current) {
          rafRef.current = null;
          setIsTyping(false);
          // 回调：让 ChatTab 做 FSM/ingest 清理和 isStreaming:false
          onFinishedRef.current(fullTextRef.current);
          // 内部重置
          fullTextRef.current = '';
          visibleTextRef.current = '';
          displayedLenRef.current = 0;
          streamDoneRef.current = false;
          budgetRef.current = 0;
          lastTsRef.current = 0;
          setDisplayedText('');
          return;
        }

        // 还没追完或流还没结束 → 继续
        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    };

    // 用 interval 轮询是否需要启动（16ms = 约 60fps）
    // 这比依赖 useEffect deps 更可靠，因为 feed() 只写 ref 不触发重渲染
    const poll = setInterval(tryStart, 16);
    return () => {
      clearInterval(poll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [baseDelayMs, typingSound]);

  return { feed, finish, reset, displayedText, isTyping };
}
```

---

## Cursor Prompt：修改 ChatTab_v2.tsx 接入 hook

### 步骤 1：导入 hook

在文件顶部 import 区域添加：

```typescript
import { useTypewriter } from '../../hooks/useTypewriter';
```

### 步骤 2：初始化 hook

在 ChatTab 组件内，`const oct = octRuntimeRef.current;` 之后添加：

```typescript
const typewriter = useTypewriter({
  baseDelayMs: streamSpeedMs,
  typingSound: settings.typingSound,
  onFinished: (finalText) => {
    const finalRaw = stripThinkModeMarker(finalText || '');
    try { oct.fsm.onTurnFinish(); } catch (e) { console.warn('[ChatTab.v2] fsm.onTurnFinish', e); }
    oct.ingest.reset();
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant' && last.isStreaming) {
        return prev.map((msg, i) =>
          i === prev.length - 1
            ? { ...msg, content: finalRaw || msg.content, isStreaming: false, isStreamingRaw: false }
            : msg
        );
      }
      return prev;
    });
  },
});
```

### 步骤 3：在 stream tokens 事件里调用 feed

在 StreamRouter subscribe 的 `tokens` 事件处理里（`applyRawToMessages(raw)` 之后），添加：

```typescript
typewriter.feed(raw);
```

### 步骤 4：修改 COMPLETED handler

将整个 COMPLETED handler 的 queueMicrotask 内容简化为：

```typescript
if (event.type === 'state' && event.payload.state === StreamState.COMPLETED) {
  queueMicrotask(() => {
    typewriter.finish();
    try { stream.close(); } catch (e) { console.warn('[ChatTab.v2] stream.close', e); }
  });
}
```

### 步骤 5：在 sendMessage 和 quickSend 里调用 reset

在 `sendMessage` 函数里，`streamingMessageRef.current = '';` 之后添加：
```typescript
typewriter.reset();
```

在 `quickSend` 函数里同样位置添加：
```typescript
typewriter.reset();
```

### 步骤 6：修改渲染层使用 typewriter.displayedText

在 `ChatMessageList` 的 props 传递里，将：
```typescript
displayedText={displayedText}
```
改为：
```typescript
displayedText={typewriter.displayedText}
```

### 步骤 7：删除被 hook 取代的代码

以下变量/函数/effect 可以删除（由 hook 内部管理）：

**删除 state：**
- `const [fullText, setFullText] = useState('');`
- `const [displayedText, setDisplayedText] = useState('');`

**删除 ref：**
- `displayedLenRef`
- `typingBudgetMsRef`
- `lastTypingTsRef`
- `typewriterRafRef`
- `displayedCharsRef`
- `frameCountRef`
- `visibleFullTextRef`
- `rafFlushRef`
- `shouldRunTypewriterRef`
- `typewriterStartTsRef`
- `streamDoneReceived`（由 hook 内部管理）

**删除函数：**
- `getNextCharIndex`
- `charDelayMs`
- `isWordChar`
- `computeRangeCostMs`
- `pickPreferredNextIndex`
- `scheduleFullTextSync` 里的 driveTypewriter 代码块
- 主 tick 循环的整个 `useEffect`（约第3122-3261行）

**注意：** `fullTextRef`、`streamingMessageRef`、`scheduleFullTextSync` 仍保留（WS 消息处理需要），但 `scheduleFullTextSync` 里删除 driveTypewriter 启动块和 displayedLen 相关逻辑。

---

## 验证清单

- [ ] 打字机匀速出现，无突然加速
- [ ] 流式结束后约 0.5-1 秒自然打完
- [ ] 打完后平滑切换到 Markdown 渲染
- [ ] 多轮连续对话正常
- [ ] 打字音效正常
- [ ] CoT 面板不受影响

## 下一步

抽完 `useTypewriter` 后，用同样的方式抽：
1. `useWebSocket` — IPC 监听 + message 解析 + 状态管理
2. `useChatScroll` — ScrollAnchor + snap + handleChatScroll
3. `useGateway` — gateway 状态 + 日志
4. 把 MessageRenderer 相关（markdownComponents, preprocessMarkdown, 所有表格函数）移到 `components/MessageRenderer.tsx`
