# Script Adapter 人工审核闸门

## 变更

- 在批次产物预览下方增加人工审核操作区，支持填写审核备注并调用通过或退回接口。
- 审核预览只要存在 `adapted_script` 就展示台本；质检报告尚未生成时不再隐藏整个预览。
- 将待审核章节展开区重设计为快速放行型审核面板，包含暂停节点、风险摘要、原文节选、AI 台本关键片段和明确的审核操作反馈。
- 待审核章节会自动弹出人工确认弹窗，突出“当前不确定的问题、原文上下文、AI 当前处理、用户需要选择什么”。
- 审核动作从“通过/退回”改为逐条问题卡片确认；每张卡片只处理一个待确认 segment，并显示 `1/N` 翻页。
- 每个问题卡片支持选择“旁白”、候选角色或自定义角色；选择后立即修改当前 `adapted_script` 的对应 segment。
- 审核弹窗样式改为台本流面板：`台本预览 / 待确认项 / 质检报告` 三个标签页，待确认项直接高亮显示在台本上下文中，并在原位提供声线选择按钮。
- 新增筛选 chips：全部、旁白、对话、OS、待确认，便于在完整台本流中定位问题。
- 所有待确认项处理完成后，再显示“完成本章确认，继续生产”，恢复后续 Agent 流程。
- 同章重跑会读取上一轮人工退回原因，并把反馈注入台词归因 Agent 输入，避免“退回后仍按同一套判断重复产出”。
- 新增 `scriptAdapter.batch.applyReviewDecision` 网关方法和 Electron IPC，用于持久化单条审核选择。
- 真实 Agent 执行到确认闸门时不再自动通过，章节会进入 `awaiting_review`，等待前端人工确认。
- 批次循环在存在待审核章节时暂停，审核通过后从该章节继续执行。

## 验证

- `node --check oct-gateway/script_adapter/agentRunner.js`
- `node --check oct-gateway/script_adapter/batchOrchestrator.js`
- `node --check oct-gateway/script_adapter/persistence.js`
- `node --check oct-gateway/script_adapter/agents/textRewriterAgent.js`
- `node --check oct-gateway/script_adapter/agents/quoteAttributionAgent.js`
- `node --check oct-gateway/script_adapter/messageHandler.js`
- `node --check oct-gateway/index.js`
- `npx tsc --noEmit`
- `npx tsc -p tsconfig.electron.json --noEmit`
- `node oct-gateway/test/scriptAdapterMessageHandler.test.js`
