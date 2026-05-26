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

## 目的

把“角色正在阅读的文字内容”从普通旁白和角色 OS 中分离出来，交给后续人工确认，减少误归因。
