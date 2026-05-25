# Script Adapter Provider Priority

## Change

- `script_adapter` LLM calls now resolve the dedicated script adapter provider before the external OmniRoute outlet.
- `SCRIPT_ADAPTER_TEXT_REWRITER_MODEL` is accepted as a fallback model when `SCRIPT_ADAPTER_MODEL` is not set.

## Reason

Real script-adapter batch runs were failing with `fetch failed` when the external OmniRoute endpoint at `localhost:20128` was unavailable, even though the script adapter had its own configured provider and API key.

## Verification

- `node oct-gateway/test/llmClient.test.js`
- `npx vitest run oct-gateway/test/innerVoiceSpanExtractor.test.js`
