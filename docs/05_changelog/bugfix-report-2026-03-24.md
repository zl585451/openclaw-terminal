# BUG 修复报告 - 2026-03-24

> 本文档记录 2026-03-24 对 OCT Terminal 的 Bug 修复和优化

---

## 修复概览

| 优先级 | 问题 | 文件 | 状态 |
|--------|------|------|------|
| P1-1 | 长内容胶囊按钮不渲染（缓存碰撞） | optionBoxParser.ts | ✅ 已修复 |
| P1-2 | pendingPills 有 20 字符限制 | ChatTab.tsx | ✅ 已修复 |
| P1-3 | 长 pill 文本溢出容器 | ResponseTray.css | ✅ 已修复 |
| P2-1 | Streaming 结束时空值覆盖 | ChatTab.tsx | ✅ 已修复 |
| P2-2 | PAIRED_TAG_RX 全局状态问题 | optionBoxParser.ts | ✅ 已修复 |
| P2-3 | session.js 只按条数裁剪 | session.js | ✅ 已修复 |
| P2-4 | Gateway 并发流未取消 | index.js | ✅ 已修复 |
| P2-5 | 打字机在 surrogate pair 中间切断 | ChatTab.tsx | ✅ 已修复 |
| P2-6 | cleanOldSessions 未清理 thinkModes | session.js | ✅ 已修复 |

---

## 详细修复记录

### 🔴 P1-1：长内容胶囊按钮不渲染

**问题**：当消息内容超过一定长度且包含表格和 `[pills]` 标签时，交互元素不渲染。

**原因**：`getCacheKey` 使用 `content.slice(0, 100) + ':' + length`，两条不同消息若前缀相同、长度相近，会错误复用缓存。

**修复**：
```typescript
// 旧代码
function getCacheKey(content: string): string {
  return content.slice(0, 100) + ':' + content.length;
}

// 新代码
function simpleHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

function getCacheKey(content: string): string {
  return content.length + ':' + simpleHash(content);
}
```

**文件**：`src/utils/optionBoxParser.ts`

---

### 🔴 P1-2：pendingPills 有 20 字符限制

**问题**：托盘内联 pill 使用 `line.length <= 20`，导致长选项被截断。

**原因**：`pendingPills` 提取逻辑与 `parseOptionBox` 不一致，自行解析且有字符限制。

**修复**：统一使用 `parseOptionBox` 解析结果。

```typescript
// 旧代码
const options = pillsMatch[1]
  .split('\n')
  .map((line: string) => line.replace(/^[■●◆○◉▪▸\-\*]\s*/, '').trim())
  .filter((line: string) => line.length > 0 && line.length <= 20);

// 新代码
const parsed = parseOptionBox(raw);
const pillsSeg = parsed.segments?.find((s) => s.type === 'pills');
const pills = pillsSeg?.options?.map((o) => o.value) ?? 
  (parsed.forcePills ? parsed.options?.map((o) => o.value) ?? [] : []);
setPendingPills(pills.length > 0 ? pills : null);
```

**文件**：`src/components/ChatTab.tsx`

---

### 🔴 P1-3：长 pill 文本溢出容器

**问题**：`white-space: nowrap` 使超长 pill 文本溢出或撑破布局。

**修复**：添加溢出保护。

```css
.response-tray-inline__pill {
  /* ... */
  max-width: min(240px, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

同时为按钮添加 `title` 属性，悬停时显示完整文本。

**文件**：`src/components/ResponseTray.css`, `src/components/ChatTab.tsx`

---

### 🟡 P2-1：Streaming 结束时空值覆盖

**问题**：流结束时，如果 `buf` 为空，会覆盖已有内容，导致选项突然消失。

**修复**：添加空值保护。

```typescript
// 不用空值覆盖已有内容
const newContent = buf || last.content;
return prev.map((m, idx) => (idx === prev.length - 1 ? { ...m, content: newContent } : m));
```

**文件**：`src/components/ChatTab.tsx`

---

### 🟡 P2-2：PAIRED_TAG_RX 全局状态问题

**问题**：带 `g` flag 的 regex 在模块级共享 `lastIndex` 状态，并发解析时可能出错。

**修复**：在 `parseTaggedContent` 函数内部创建局部 regex 实例。

```typescript
function parseTaggedContent(content: string): { segments: RenderSegment[]; found: boolean } {
  // 每次调用创建新的 regex 实例，避免全局状态的 lastIndex 并发问题
  const pairedTagRx = /(?:\/\s*)?\[\s*(pills|checkbox|question|tasklist|text)\s*\]([\s\S]*?)\[\s*\/\s*\1\s*\]/gi;
  const allMatches = [...content.matchAll(pairedTagRx)];
  // ...
}
```

**文件**：`src/utils/optionBoxParser.ts`, `src/utils/optionBoxParser.fix.ts`

---

### 🟡 P2-3：session.js 只按条数裁剪

**问题**：`MAX_HISTORY=30` 只按条数裁剪，长消息会导致上下文超限。

**修复**：新增按字符数裁剪。

```javascript
const MAX_HISTORY_CHARS = 40000; // 约 2 万 token

function addMessage(sessionKey, role, content) {
  // ... 条数裁剪 ...

  // 按总字符裁剪（从最早的消息开始删，但保留至少 2 条）
  let totalChars = history.reduce((s, m) => s + (m.content?.length || 0), 0);
  while (totalChars > MAX_HISTORY_CHARS && history.length > 2) {
    const removed = history.shift();
    totalChars -= (removed.content?.length || 0);
  }
}
```

**文件**：`oct-gateway/session.js`

---

### 🟡 P2-4：Gateway 并发流未取消

**问题**：用户快速发送多条消息时，多个流同时推送内容导致混乱。

**修复**：每个 WebSocket 连接维护取消令牌。

```javascript
wss.on('connection', (ws) => {
  let currentAbort = null;

  // 在 chat.send 分支
  if (currentAbort) currentAbort();
  let cancelled = false;
  currentAbort = () => { cancelled = true; };

  await streamChat({
    onDelta: (delta) => {
      if (cancelled) return;
      // ...
    },
    onDone: () => {
      if (cancelled) return;
      currentAbort = null;
      // ...
    },
    onError: () => {
      if (cancelled) return;
      currentAbort = null;
      // ...
    },
  });

  ws.on('close', () => {
    if (currentAbort) currentAbort();
    currentAbort = null;
  });
});
```

**文件**：`oct-gateway/index.js`

---

### 🟡 P2-5：打字机在 surrogate pair 中间切断

**问题**：emoji 和多字节字符在流式渲染时被切断，显示乱码。

**修复**：检测并跳过 surrogate pair。

```typescript
let next = Math.min(current + CHARS_PER_TICK, fullLen);
// 不在 surrogate pair 中间切断
const full = streamingMessageRef.current;
if (next < full.length) {
  const code = full.charCodeAt(next - 1);
  if (code >= 0xD800 && code <= 0xDBFF) next += 1; // high surrogate → 跳到下一个
}
```

**文件**：`src/components/ChatTab.tsx`

---

### 🟡 P2-6：cleanOldSessions 未清理 thinkModes

**问题**：过期会话清理时未同步清理 `thinkModes` Map，导致内存泄漏。

**修复**：

```javascript
if (lastMsg && lastMsg.timestamp && lastMsg.timestamp < expireThreshold) {
  sessions.delete(key);
  thinkModes.delete(key);  // ← 新增
  cleaned++;
}
```

**文件**：`oct-gateway/session.js`

---

## 测试验证

### 单元测试
```bash
npm run test
# Test Files  1 passed (1)
#      Tests  26 passed (26)
```

### 功能测试

- [x] 长消息 + 表格 + [pills] 标签，交互元素正确渲染
- [x] 长选项（>20 字符）正确显示在托盘中
- [x] 超长 pill 显示省略号，悬停显示完整文本
- [x] 流式消息 emoji 正确显示
- [x] 快速连续发送消息，旧流被正确取消

---

## 其他改进

### 删除重复测试代码

`optionBoxParser.test.ts` 中有重复的 `describe('长内容 + 表格 + 交互标签')` 块，已合并删除。

---

**🦞 OCT Terminal · 让 AI 更懂你**

**修复日期**: 2026-03-24