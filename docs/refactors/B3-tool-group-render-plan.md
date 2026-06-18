# B3 工具组渲染计划（对齐 Claude Code 的「摘要折叠组」结构）

> 执行者须知：这是一份自包含实现规格。你**不需要**读历史对话即可执行。所有文件路径、函数名、现有代码片段都已核对（截至 commit `f3f084c` 之后的工作区状态）。代码片段是**参考实现**，措辞/样式可在保持语义的前提下微调。完成后由人工重启 gateway 并目视验证。

---

## 0. 一句话目标

把当前「每个工具一张**平铺**卡片 + 每次工具前一句文字」的展示，改成 Claude Code 那样的**工具组**：连续的工具调用收进一个**可折叠组**，组顶部一行**摘要标题**（如「读取 7 个文件 · 执行 2 条命令」），点开才看到每个工具的子项。模型主动说的叙述文字仍独立成段。

### 目标结构（ASCII）
```
AMY
我来调研记忆系统的实现方式。            ← 模型主动叙述（text 段，独立）
▾ 读取 7 个文件 · 执行 2 条命令          ← 工具组摘要标题（可点击折叠/展开）
   ✓ read_file   agent_runner.js        ← 子项（展开时可见，点开看 args/result）
   ✓ read_file   orchestrator.js
   ✓ exec_command  grep memory
   …
记忆系统采用文件式存储……               ← 最终答案（final 段）
```

### 关键体验规则
- 工具组**执行中默认展开**（实时看进度），**全部完成后自动折叠**成一行摘要；但**用户手动点过就尊重用户选择**，不再自动开合。
- 连续 tool_use 段聚成一组；中间被任何 text/final 段打断，就分成**两个独立的组**。

---

## 1. 背景：现有基础设施（已完成，不要重做）

段协议（Turn Segment Protocol）已经打通，数据层**已经够用**，本次改动**以前端为主**。

### 1.1 数据结构（已存在）
`src/ui/chat/chatTypes.ts`：
```ts
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

export interface TurnSegmentLite {
  segId: string;
  index: number;
  type: 'text' | 'tool_use' | 'tool_result' | 'reasoning' | 'final';
  content: string;
  open: boolean;
  meta?: { tool?: string | null; callId?: string | null };
}

export interface ChatMessage {
  // …
  toolEvents?: ToolEventItem[];     // 工具执行明细（含 state/elapsedMs/resultPreview）
  turnSegments?: TurnSegmentLite[]; // 有序段快照（text/tool_use/final 交错）
}
```

### 1.2 段事件如何产生（已接好，两条路径都发段）
- **AMY 流式路径**：`oct-gateway/runtime/turnSegmentTracker.js` 把文本/工具翻译成段事件。
- **专职 Agent 路径**（Researcher/Coder/Writer）：`oct-gateway/agents/agent_runner.js` 在工具循环里发段事件（见 §4）。
- 两条路径都通过 `{event:'chat', payload:{turnId, seg}}` 发到前端 → `useWebSocket.ts` 路由到 `onChatSeg` → `useMessages.ts` 累积进 `turnSegmentsRef`，并在段边界（open/close）把快照挂到流式消息的 `msg.turnSegments`。

**因此前端拿到的 `msg.turnSegments` 已经是按时序排列的段数组，含每个工具的 `meta.callId`，可与 `msg.toolEvents` 按 `callId` 关联。** 你只需改前端的渲染方式。

### 1.3 当前前端渲染（要改的地方）
`src/ui/chat/MessageList.tsx`：
- `InlineToolCard`（约 L98-146）：单个工具的折叠卡片。**保留复用**，会被改成工具组的子项。
- `AssistantMessageBody` 里的 `renderInlineRange`（约 L590-618）：当前把每个 tool_use 段渲染成一张平铺 `InlineToolCard`，每个 text 段渲染成 `inline-preamble`。**这是核心改造点**。
- 调用处（约 L627 前缀、L805 后缀）：`{inlineActive && renderInlineRange(0, prefixEnd)}` 与后缀。**不用改调用处**，只改 `renderInlineRange` 内部。

---

## 2. 涉及文件清单

| 文件 | 改动 |
|------|------|
| `src/ui/chat/MessageList.tsx` | 新增 `buildToolGroupSummary()` + `ToolGroup` 组件；改造 `renderInlineRange` 聚合连续 tool_use 段 |
| `src/styles/ChatTab.css` | 新增 `.tool-group*` 样式（紧接现有 `.inline-tool*` 之后，约 L1272 区块附近） |
| `oct-gateway/agents/agent_runner.js` | 去掉「模型沉默时兜底生成 preamble 文字段」；删除 `describeOneTool`/`buildToolPreamble`（前端接管摘要）。**保留**模型主动 content 作为 text 段、**保留** maxTurns 收尾请求 |

> 不需要改：`useMessages.ts`、`useWebSocket.ts`、`chatTypes.ts`、`turnSegmentTracker.js`、`orchestrator.js`、`chatRequestHandler.js`。

---

## 3. 前端实现（MessageList.tsx）

### 3.1 新增组摘要生成函数

放在 `InlineToolCard` 定义之后（约 L146 之后）。按组内工具类型计数生成中文摘要。

```tsx
/** B3 工具组：按组内工具类型计数，生成一行中文摘要标题。 */
function buildToolGroupSummary(
  segs: TurnSegmentLite[],
  getToolDisplayName: (tool: string) => string,
): string {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const s of segs) {
    const name = s.meta?.tool || 'tool';
    if (!counts.has(name)) order.push(name);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const phrase = (name: string, n: number): string => {
    switch (name) {
      case 'time_inject': return '确认时间';
      case 'exec_command': return `执行 ${n} 条命令`;
      case 'read_file': return `读取 ${n} 个文件`;
      case 'web_search': return `搜索 ${n} 次`;
      case 'parallel_web_research': return '并行调研';
      case 'web_fetch': return `抓取 ${n} 个页面`;
      default: return `${getToolDisplayName(name)} ${n} 次`;
    }
  };
  return order.map((name) => phrase(name, counts.get(name) || 1)).join(' · ');
}
```

### 3.2 新增 ToolGroup 组件

放在 `buildToolGroupSummary` 之后。复用 `InlineToolCard` 作为子项。

```tsx
/** B3 工具组：连续工具调用收进一个可折叠组，对齐 Claude Code 的「摘要 + 子项」结构。 */
const ToolGroup = memo(function ToolGroup({
  segs,
  toolEvents,
  getToolDisplayName,
}: {
  segs: TurnSegmentLite[];
  toolEvents?: ToolEventItem[];
  getToolDisplayName: (tool: string) => string;
}) {
  const events = segs.map((s) => toolEvents?.find((t) => t.callId === s.meta?.callId));
  const running = events.some((e) => !e || e.state === 'executing');
  const hasError = events.some((e) => e?.state === 'error');

  // 执行中默认展开看进度；完成后自动折叠成一行摘要；用户手动点过则尊重用户选择
  const [open, setOpen] = useState(running);
  const userTouched = useRef(false);
  useEffect(() => {
    if (!userTouched.current) setOpen(running);
  }, [running]);

  const summary = buildToolGroupSummary(segs, getToolDisplayName);

  return (
    <div className={`tool-group ${running ? 'tool-group--running' : 'tool-group--done'} ${hasError ? 'tool-group--error' : ''}`}>
      <button
        type="button"
        className="tool-group__head"
        onClick={() => { userTouched.current = true; setOpen((o) => !o); }}
      >
        <span className="tool-group__status" aria-hidden>
          {running ? <span className="tool-group__spinner" /> : hasError ? '✗' : '✓'}
        </span>
        <span className="tool-group__summary">{summary}</span>
        <span className="tool-group__chevron">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="tool-group__body">
          {segs.map((seg) => {
            const ev = toolEvents?.find((t) => t.callId === seg.meta?.callId);
            return (
              <InlineToolCard
                key={seg.segId}
                event={ev}
                toolName={seg.meta?.tool || ev?.tool || ''}
                getToolDisplayName={getToolDisplayName}
              />
            );
          })}
        </div>
      )}
    </div>
  );
});
```

> 注意：`ToolGroup` 用了 `useState/useRef/useEffect/memo`，确认这些已在 `MessageList.tsx` 顶部 `import React, { ... } from 'react'` 里（当前已 import `useState, useEffect, useRef, useCallback, memo, useMemo, useLayoutEffect`，齐全）。

### 3.3 改造 renderInlineRange —— 聚合连续 tool_use 段

把当前 `renderInlineRange`（约 L590-618）整体替换为下面版本。语义：遍历段，把**连续的 tool_use 段**缓冲成一组，遇到非 tool_use 段时 flush 成一个 `ToolGroup`；text/final 段照旧渲染为 `inline-preamble`。

**当前代码（替换掉它）**：
```tsx
  const renderInlineRange = (from: number, to: number) => {
    if (!inlineActive || !turnSegs) return null;
    return turnSegs.slice(from, to).map((seg) => {
      if (seg.type === 'tool_use') {
        const ev = msg.toolEvents?.find((t) => t.callId === seg.meta?.callId);
        return (
          <InlineToolCard
            key={seg.segId}
            event={ev}
            toolName={seg.meta?.tool || ev?.tool || ''}
            getToolDisplayName={getToolDisplayName}
          />
        );
      }
      const c = getAssistantVisibleMain(seg.content || '').trim();
      if (!c) return null;
      return (
        <div key={seg.segId} className="inline-preamble">
          <FinalizedMarkdownContent
            messageId={msg.id}
            segmentKey={`pre-${seg.segId}`}
            content={c}
            markdownComponents={markdownComponents}
            streaming
          />
        </div>
      );
    });
  };
```

**新版本**：
```tsx
  const renderInlineRange = (from: number, to: number) => {
    if (!inlineActive || !turnSegs) return null;
    const slice = turnSegs.slice(from, to);
    const out: React.ReactNode[] = [];
    let toolBuffer: TurnSegmentLite[] = [];

    const flushTools = () => {
      if (toolBuffer.length === 0) return;
      const groupSegs = toolBuffer;
      toolBuffer = [];
      out.push(
        <ToolGroup
          key={`tg-${groupSegs[0].segId}`}
          segs={groupSegs}
          toolEvents={msg.toolEvents}
          getToolDisplayName={getToolDisplayName}
        />,
      );
    };

    for (const seg of slice) {
      if (seg.type === 'tool_use') {
        toolBuffer.push(seg);
        continue;
      }
      // 非 tool_use：先收尾当前工具组，再渲染叙述文字
      flushTools();
      const c = getAssistantVisibleMain(seg.content || '').trim();
      if (!c) continue;
      out.push(
        <div key={seg.segId} className="inline-preamble">
          <FinalizedMarkdownContent
            messageId={msg.id}
            segmentKey={`pre-${seg.segId}`}
            content={c}
            markdownComponents={markdownComponents}
            streaming
          />
        </div>,
      );
    }
    flushTools();
    return out;
  };
```

> `TurnSegmentLite` 类型：需要在 `MessageList.tsx` 顶部 import 里补上。当前 import 是 `import type { ChatMessage, ToolEventItem } from './chatTypes';` → 改为 `import type { ChatMessage, ToolEventItem, TurnSegmentLite } from './chatTypes';`。（之前为避免未使用告警删掉了它，现在又用上了。）

> `renderInlineRange` 的两个调用处（前缀 `renderInlineRange(0, prefixEnd)`、后缀 `renderInlineRange(lastTextIdx + 1, turnSegs.length)`）**不用动**——返回值从 `.map()` 数组变成手动 `out` 数组，都是合法 ReactNode[]。

### 3.4 CSS（ChatTab.css）

紧接现有 `.inline-tool*` 样式区块之后追加（约 L1272 区块尾部）。沿用 CSS 变量与既有风格。

```css
/* B3 工具组：连续工具收进可折叠组（对齐 Claude Code） */
.tool-group {
  margin: 6px 0;
  border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  background: var(--bg-panel, rgba(255, 255, 255, 0.02));
  overflow: hidden;
}
.tool-group__head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 11px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  cursor: pointer;
  text-align: left;
}
.tool-group__status { display: inline-flex; width: 14px; justify-content: center; }
.tool-group--done .tool-group__status { color: var(--status-success, #3ba55d); }
.tool-group--error .tool-group__status { color: var(--status-error, #e24b4a); }
.tool-group__summary { font-weight: 500; }
.tool-group__chevron { margin-left: auto; color: var(--text-secondary); opacity: 0.6; }
.tool-group__spinner {
  display: inline-block;
  width: 9px;
  height: 9px;
  border: 1.5px solid var(--accent-primary);
  border-right-color: transparent;
  border-radius: 50%;
  animation: inline-tool-spin 0.7s linear infinite; /* 复用 inline-tool 已定义的 keyframes */
}
/* 子项：在组内缩进、去掉外边距与重复边框，视觉上从属于组 */
.tool-group__body {
  padding: 2px 8px 8px 8px;
  border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
}
.tool-group__body .inline-tool {
  margin: 4px 0;
  border-color: transparent;
  background: transparent;
}
.tool-group__body .inline-tool__head { padding: 3px 6px; }
```

> `inline-tool-spin` 这个 `@keyframes` 已在 `.inline-tool__spinner` 区块里定义过，直接复用，不要重复定义。

---

## 4. 后端调整（agent_runner.js）

目标：**不再由后端兜底生成 preamble 文字段**（那个会和前端工具组摘要重复）。模型自己说的话保留；工具的「干了啥」交给前端工具组摘要。

### 4.1 去掉兜底 preamble 调用

`oct-gateway/agents/agent_runner.js` 约 L425-439，**当前代码**：
```js
      // B3 inline preamble：调工具前发一句中文交代，让 InlineToolCard 之间有文字段垫场。
      // 优先用模型自己的话（content 非空，更自然）；模型沉默时用代码按工具+参数兜底生成，
      // 保证「每次调工具前一定有交代」——不依赖模型自觉（首轮探测类工具模型常静默）。
      let preambleText = typeof assistantMsg.content === 'string' ? assistantMsg.content.trim() : '';
      if (emitSeg && !preambleText) {
        preambleText = buildToolPreamble(toolCalls);
      }
      if (emitSeg && preambleText) {
        closeOpenSeg();
        const preambleSegId = openSeg('text');
        if (preambleSegId) {
          emitSeg({ op: 'delta', segId: preambleSegId, text: preambleText });
        }
        closeOpenSeg();
      }
```

**改为**（删掉兜底那 3 行，只保留模型主动说的话）：
```js
      // B3：模型在调工具前主动说的话（content 非空）作为 text 段发出，成为工具组之间的叙述。
      // 不再兜底生成 preamble——"干了啥"由前端工具组摘要承担，避免重复。
      const preambleText = typeof assistantMsg.content === 'string' ? assistantMsg.content.trim() : '';
      if (emitSeg && preambleText) {
        closeOpenSeg();
        const preambleSegId = openSeg('text');
        if (preambleSegId) {
          emitSeg({ op: 'delta', segId: preambleSegId, text: preambleText });
        }
        closeOpenSeg();
      }
```

### 4.2 删除不再使用的 helper

删除 `describeOneTool`（约 L39-58）和 `buildToolPreamble`（约 L65-90）两个函数整体——它们在 4.1 之后已无引用。删后用 `grep -n "buildToolPreamble\|describeOneTool" oct-gateway/agents/agent_runner.js` 确认无残留引用。

### 4.3 保留不动

- **保留** maxTurns 收尾请求（约 L474 起的 `6c` 块，发不带工具的请求强制出报告）——这是独立的正确修复。
- **保留** 6a 里的「最终回复过短 < 200 字强制续轮」兜底。
- **保留** 工具循环里的 `openSeg('tool_use', …)` / `closeOpenSeg()` / final 段 / `finishSeg()`。

### 4.4 researcher.js 的 prompt（可选，低优先）

`oct-gateway/agents/researcher.js` 里之前加的「工具调用前的语言节奏」段落可以**保留**（鼓励模型主动叙述，配合工具组之间的 text 段更自然）。不需要改。若要进一步精简，可把"每轮都要说一句"弱化为"在切换调研策略/阶段时说一句"，避免模型每轮强行造句。非必须。

---

## 5. 验证步骤

1. 前端类型检查：`npx -p typescript tsc --noEmit`，应无 error。
2. 后端语法检查：`node --check oct-gateway/agents/agent_runner.js`，退出码 0。
3. 后端 grep 确认无残留：`grep -n "buildToolPreamble\|describeOneTool" oct-gateway/agents/agent_runner.js` → 应无输出。
4. **重启 gateway**（agent_runner 是后端，无 HMR）。前端改动 vite 会自动 HMR，但稳妥起见整体重启。
5. 目视验证（发一个会用工具的查询，如「帮我搜一下今天的 AI 新闻，整理成要点」或「调研一下 OCT 代码仓库的记忆系统」）：
   - 连续工具收成**一行摘要**（如「读取 7 个文件 · 执行 2 条命令」），不再平铺一大版；
   - 执行中组是展开的、有 spinner；**全部完成后自动折叠**成一行；
   - 点摘要能展开/收起；展开后每个子项能再点开看 args/result；
   - 模型主动说的叙述（若有）独立成段，在工具组之间；
   - **最后有完整报告**（maxTurns 收尾修复生效）。

---

## 6. 陷阱与注意事项

1. **`useEffect` 自动折叠 vs 用户手动**：`ToolGroup` 用 `userTouched` ref 区分。务必保留这个 ref，否则用户展开后会被「完成→自动折叠」打断，体验差。
2. **`running` 的判定**：`!e || e.state === 'executing'`——`e` 为 undefined 表示 `toolEvents` 还没收到该 callId（工具刚 open、result 未回），此时算「执行中」，正确。
3. **同一回合 finalize 后**：`msg.turnSegments` 不会清空（设计如此），finalize 后 `ToolGroup` 仍渲染，但 `running=false` → 折叠成摘要。**不会有「流式时分组、结束后变平铺」的跳变**——因为前缀/主体/后缀的 inline 渲染对 streaming 和 finalized 都生效（`inlineActive` 不要求 `isStreamingMsg`）。保持这一点。
4. **AMY 流式路径**：AMY 也走段协议，所以工具组对 AMY 同样生效，无需单独处理。
5. **段 `meta.callId` 与 `toolEvents.callId` 必须能对上**：两条路径已保证同源（AMY 经 turnSegmentTracker.toolOpen(tool, callId)；Agent 经 agent_runner openSeg('tool_use', {tool, callId})，callId=toolCall.id）。若子项显示不出 elapsed/result，先查 callId 是否匹配。
6. **不要动 `renderInlineRange` 的两个调用点**和 `prefixEnd`/`lastTextIdx` 切分逻辑——它们负责「前缀(组)→主体(最终答案 textToShow)→后缀(执行中的组)」的位置，已验证正确。
7. **measure 性能**：`ToolGroup` 是 `memo`，但 `msg.toolEvents` 每次工具状态更新都换引用 → 组会重渲染，这是预期的（要更新 spinner/elapsed）。不要为省渲染去掉对 toolEvents 的依赖。

---

## 7. 提交建议

完成并验证后，一个 commit：
```
feat(chat): 工具组折叠渲染，对齐 Claude Code 的摘要+子项结构

连续工具调用收进可折叠组（顶部一行摘要"读取 N 个文件 · 执行 M 条命令"，
子项可展开看 args/result），替代之前的平铺卡片+逐条 preamble。执行中
默认展开看进度、完成后自动折叠；用户手动点过则尊重选择。

- MessageList.tsx: 新增 buildToolGroupSummary + ToolGroup；renderInlineRange
  聚合连续 tool_use 段成组
- ChatTab.css: .tool-group 样式（子项在组内缩进、去重复边框）
- agent_runner.js: 去掉后端兜底 preamble 生成（前端组摘要承担"干了啥"），
  保留模型主动叙述 + maxTurns 收尾请求；删除 describeOneTool/buildToolPreamble
```
