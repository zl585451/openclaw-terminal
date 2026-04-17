# 2026-04-16 · 聊天区 Kimi 风格伪工具调用「代码外露」

## 原因

部分模型（如 Kimi）在 `finish_reason=stop` 时把工具意图以正文形式输出：`<|…tool_calls_section_begin|>…JSON…<|…tool_calls_section_end|>`。网关原有 `extractPseudoToolCalls` 只识别 Ruby 风格 `{tool => …, args => …}`，未识别该段，因此不会进入 `toolLoop` 执行 `canvas`；前端流式 `<pre>` 与最终 Markdown 也未剥离该段，用户看到「代码外露」。

## 修改

- `src/utils/cotExtract.ts`：新增 `stripLeakedToolCallSections`、`getAssistantVisibleMain`；`extractAssistantCotAndMain` 在归一化阶段一并去掉泄漏段。
- `src/hooks/useMessages.ts`：流式 DOM 与 finalize / fallback 与上述可见正文一致；finalize 链增加 `stripLeakedToolCallSections`。
- `src/ui/chat/MessageList.tsx`：assistant 消息在 CoT 分流前对 `fullContent` 先 `stripLeakedToolCallSections`；无 CoT 分支补 `stripTextToolAnnotations`。
- `oct-gateway/ai.js`：新增 `extractKimiStylePseudoToolCalls`，在 Ruby 风格无匹配时解析上述 section 内 JSON（`name` + `arguments`），并入 `extractPseudoToolCalls`，以便仍触发画布等工具。
- `src/utils/__tests__/stripLeakedToolCallSections.test.ts`：Vitest 覆盖闭合段、未闭合段、`getAssistantVisibleMain`。

## 验收

- 欢迎卡片「架构流程图」等触发 Canvas 时：聊天气泡不再展示整段 `<|…|>` + JSON；若网关识别成功，Canvas 仍可通过伪工具调用路径执行。
- `npx tsc --noEmit`、`npm test`、`node --check oct-gateway/ai.js` 通过。
