# 2026-05-26 Script Adapter: document_reading 片段类型与人工确认质检

## 变更

- `oct-gateway/script_adapter/spanScriptComposer.js`
  - 为旁白 gap 新增 `document_reading` 检测。
  - 当片段左侧上下文命中“写着 / 记录着 / 扉页上”等阅读触发词时，先输出 `type = document_reading`，并标记 `needsReview`。

- `oct-gateway/script_adapter/basicQCChecker.js`
  - 新增 `document_reading_needs_review` P1 提示。
  - 当台本中存在 `document_reading` 段时，要求人工确认最终演播声线归属。

- `oct-gateway/script_adapter/agents/textRewriterAgent.js`
  - `normalizeSegmentType` 放行 `document_reading`，避免被强制降级为 `narration`。

- `oct-gateway/script_adapter/agents/quoteAttributionAgent.js`
  - 当 quote 左侧 200 字上下文命中文献阅读触发词时，给归因输入标记 `kindHint = document_reading`。
  - 提示词硬性要求 `document_reading` 不归为对白或 OS，speaker 优先写原文作者名，无法判断时写「文献」。

- `oct-gateway/script_adapter/spanScriptComposer.js`
  - 归因结果为 `voiceType = document_reading` 时保留为 `type = document_reading`，不再落回 dialogue。

- `src/modules/script-adapter/services/exportClient.ts`
  - 导出 docx / Markdown 时将 `document_reading` 显示为「文献·待确认」，避免落入「未标注」。

## 目的

把“角色正在阅读的文字内容”从普通旁白和角色 OS 中分离出来，交给后续人工确认，减少误归因。
