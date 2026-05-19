# 2026-05-19 Render Protocol v3 Phase 4 Provider Capabilities

## Summary

Phase 4 adds a provider capability layer for Render Protocol v3. Providers and model caps now expose render strategy fields that later prompt assembly can use instead of guessing model behavior.

## Changes

- Updated `oct-gateway/providers.js`.
  - Added provider defaults for `supportsStructuredOutput`, `supportsRenderBlocks`, `preferredRenderMode`, and `renderPromptProfile`.
  - Google and OpenAI prefer strict fenced `render_blocks` JSON.
  - DeepSeek, Bailian, MiniMax, Moonshot, NewAPI, and custom providers use Gateway normalization.
  - Ollama remains legacy-tags first.
- Updated `oct-gateway/config.js`.
  - Model capability normalization now merges provider render capability defaults.
- Updated `oct-gateway/runtime/providerRouter.js`.
  - Runtime caps now retain render capability fields even when a provider model definition is present.
- Added `oct-gateway/test/providerRenderCapabilities.test.js`.
  - Covers provider defaults, model caps, fallback defaults, and router caps.
- Added `docs/03_specs/RENDER_PROVIDER_CAPABILITIES.md`.

## Verification

- `node oct-gateway/test/providerRenderCapabilities.test.js`
- `node oct-gateway/test/renderBlocksNormalizer.test.js`
- `npx vitest run src/ui/chat/renderBlocksAdapter.test.ts src/utils/renderProtocolRegression.test.ts`

## Notes

This phase does not yet rewrite provider-specific system prompts. It creates the stable capability source needed for that work.
