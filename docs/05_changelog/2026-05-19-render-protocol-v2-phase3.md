# Render Protocol v2 Phase 3：前端流式 Markdown 容错

日期：2026-05-19

分支：`codex/render-protocol-v2`

## 背景

模型在流式输出 Markdown 时，代码围栏常常先输出开始标记，过一段时间才输出结束标记。此前前端会把半截内容直接交给 `ReactMarkdown`，导致代码块结构在每批 token 到达时不断变化，视觉上表现为代码框一段一段跳出。

## 改动

- 新增 `stabilizeStreamingMarkdown()`，仅在流式显示阶段临时闭合未完成的 ``` / ~~~ 代码围栏。
- `MessageList` 的流式 Markdown 分支改用该稳定函数，同时保留 `[echart]` / `[canvas]` 标签转换。
- 新增单元测试覆盖：
  - 未完成三反引号围栏会临时补齐。
  - 已闭合代码块不被改动。
  - 波浪线围栏也能稳定显示。

## 安全边界

- 不修改底层消息内容。
- 不影响最终入库文本。
- 不改变 `[pills]` / `[question]` / `[tasklist]` 等交互标签语义。
- 结束后仍由 Gateway normalizer 负责最终 Markdown 收束。

## 验收

- `npx vitest run src/utils/markdownPreprocess.test.ts`
- `npx vitest run`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `npm run build`
