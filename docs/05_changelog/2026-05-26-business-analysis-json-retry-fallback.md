# 2026-05-26 Business Analysis JSON Retry/Fallback

## Change

- Moved business-analysis JSON parsing inside the retryable request path.
- Tagged JSON parse failures with `BUSINESS_ANALYSIS_JSON_PARSE_FAILED`.
- Allowed malformed analysis JSON to trigger the compact retry path.
- Allowed retry-exhausted JSON parse failures to enter `rule_strategy_fallback` instead of leaving the create-task flow stuck in failed state.
- Added regression coverage for malformed array JSON in business-analysis output.

## Validation

- `node oct-gateway/test/businessAnalysisOrchestrator.test.js`
