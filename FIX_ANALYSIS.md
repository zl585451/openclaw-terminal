# OCT 渲染链路崩溃 — 根因分析 & 修复

## 一句话总结

**`parseOptionBox` 在流式期间永远不被调用 + `splitTableBlockForStreaming` 把表格后的所有内容都当纯文本 = 全部渲染失效。**

---

## 渲染链路追踪

```
Gateway (ai.js)
  → WebSocket delta 推送
    → ChatTab handleIncomingMessage
      → streamingMessageRef.current += delta
      → setMessages({ content: buf, isStreaming: true })
        → ChatMessageList 渲染
          → 判断 isStreamingMsg?
            ├─ true  → parseOptionBox 不调用 ❌
            │         → textToShow = raw（未解析的原文）
            │         → MarkdownContent(isStreaming=true)
            │           → splitTableBlockForStreaming
            │             → 检测到 | 行 → 从此行到结尾全部当纯文本 ❌❌
            │
            └─ false → parseOptionBox(raw) ✅ （但要等打字机跑完）
                      → segments 路径正确渲染 ✅
```

**问题出在 `true` 分支：流式期间所有渲染都走了错误路径。**

---

## 3 个 Bug 详解

### Bug 1: `splitTableBlockForStreaming` 吞掉表格后所有内容

**文件**: `ChatTab.tsx` 第 322-331 行

```typescript
// ❌ 原始代码：从第一个 |行 到结尾全部当 tableAndRest
return {
  before: lines.slice(0, idx).join('\n'),
  tableAndRest: lines.slice(idx).join('\n'),  // 表格后的 [pills]、列表全在这里
};
```

表格后面的 `[pills]` 标签、列表、代码块全部被包在 `<span style="whiteSpace: 'pre'">` 里原样显示。

```typescript
// ✅ 修复后：只隔离连续表格行
return {
  before: lines.slice(0, idx).join('\n'),
  tableBlock: lines.slice(idx, endIdx).join('\n'),  // 只有表格行
  after: lines.slice(endIdx).join('\n'),             // 后续内容继续走 Markdown
};
```

### Bug 2: `parseOptionBox` 只在 `!isStreamingMsg` 时调用

**文件**: `ChatTab.tsx` 第 1093-1095 行

```typescript
// ❌ 原始代码
const parsed = (msg.role === 'assistant' && !isStreamingMsg)  // 流式时跳过
  ? parseOptionBox(raw)
  : { text: display, options: [], segments: undefined };  // 空的解析结果
```

`msg.isStreaming` 从 `true` 变 `false` 依赖打字机定时器完成。如果定时器有任何异常（比如 `streamSpeedMs` 配置问题、组件重渲染导致定时器丢失），`isStreaming` 永远为 `true` → `parseOptionBox` 永远不执行。

```typescript
// ✅ 修复后：始终解析
const parsed = (msg.role === 'assistant')
  ? parseOptionBox(raw)  // 始终调用，流式期间未闭合的标签会被 regex 跳过（正确行为）
  : { ... };
```

### Bug 3: `textToShow` 在有 segments 时仍用原始切片

**文件**: `ChatTab.tsx` 第 1096-1098 行

```typescript
// ❌ 原始代码
const textToShow = msg.role === 'assistant'
  ? (isStreamingMsg && displayedLength > 0 ? display : ...)
  //                                        ^^^^^^^ 未清理的原文，含 [pills]...[/pills] 标签
```

即使 Fix 2 让 `parseOptionBox` 返回了正确的 `segments`，`textToShow` 仍然是原始文本。虽然 segments 路径会被使用（`segments.length > 0`），但某些 fallback 路径可能用到 `textToShow`。

```typescript
// ✅ 修复后：有 segments 时用 parsed.text
? (isStreamingMsg && displayedLength > 0 && !parsed.segments
    ? display
    : (parsed.text?.trim() ? parsed.text : raw))
```

---

## 为什么"安装自适应澄清系统后出问题"？

`CLARIFICATION_PROTOCOL.md` 让 AMY 大量使用 `[pills]...[/pills]` 成对标签输出。这些标签在之前**碰巧没触发**（因为 AMY 之前不用 `[pills]` 标签，用的是 `■` 符号自动检测）。

安装澄清系统后：
1. AMY 开始输出 `[pills]...[/pills]` 标签
2. 流式期间 `parseOptionBox` 不被调用 → 标签原样显示
3. 如果消息中恰好有表格 → 表格后面的一切都变原样文本
4. "越修越乱" 是因为之前尝试的修复没有触及真正的根因

---

## 修复方法

```bash
# Windows (在项目根目录)
node fix-rendering.js
```

修复后运行 `npm run dev` 测试。

---

## 验证清单

修复后用以下测试消息验证：

1. **纯 pills**:
   ```
   少爷，想先处理哪个？
   
   [pills]
   ■ 修复 Bug
   ■ 写文档
   [/pills]
   ```
   → 应显示为胶囊按钮

2. **表格 + pills**:
   ```
   | 方案 | 优点 |
   |------|------|
   | A    | 快   |
   
   你倾向哪个？
   
   [pills]
   ■ 方案 A
   ■ 方案 B
   [/pills]
   ```
   → 表格正常渲染 + pills 正常渲染

3. **代码块 + Markdown**:
   ````
   这是示例：
   
   ```javascript
   console.log('hello');
   ```
   
   - 列表项 1
   - 列表项 2
   ````
   → 代码块高亮 + 列表格式正确
