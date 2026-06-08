# 2026-05-26 Quote Span: 拟声词后缀声合并

## 变更

- `oct-gateway/script_adapter/quoteSpanExtractor.js`
  - 当 narration gap 以 `声` / `声。` / `声，` 等开头时，将该后缀并回前一个 quote 的 `text` 和 `rawText`。
  - 避免 `发出“沙沙”声。` 被拆成 quote `沙沙` 与旁白 `声。...`，导致旁白独立念出残缺的“声”。

## 验证

- `node --check oct-gateway/script_adapter/quoteSpanExtractor.js`
- `npx vitest run oct-gateway/test/quoteSpanExtractor.test.js oct-gateway/test/spanScriptComposer.test.js`
