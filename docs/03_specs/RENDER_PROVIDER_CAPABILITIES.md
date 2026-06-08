# Render Provider Capabilities

Date: 2026-05-19

This document defines the provider capability fields used by Render Protocol v3 Phase 4.

## Fields

| Field | Type | Meaning |
|---|---|---|
| `supportsStructuredOutput` | boolean | Provider/model can be prompted to reliably emit strict structured output directly. |
| `supportsRenderBlocks` | boolean | Gateway/frontend may use Render Blocks for this provider after normalization. |
| `preferredRenderMode` | string | Preferred render strategy for prompts and adapters. |
| `renderPromptProfile` | string | Prompt-profile hint for provider-specific formatting instructions. |

## `preferredRenderMode`

| Value | Meaning |
|---|---|
| `render_blocks` | Prefer strict fenced `render_blocks` JSON. |
| `gateway_normalized` | Prompt may use legacy tags or schema hints; Gateway normalizes to Render Blocks. |
| `legacy_tags` | Prefer existing legacy tags and parser fallback. |
| `markdown` | Plain Markdown only; no interactive UI expected. |

## Current Defaults

| Provider | `preferredRenderMode` | `renderPromptProfile` | Notes |
|---|---|---|---|
| `google` | `render_blocks` | `strict_fenced_json` | Used to reduce Gemini Markdown shape drift. |
| `openai` | `render_blocks` | `strict_fenced_json` | Structured prompt path preferred. |
| `bailian` | `gateway_normalized` | `legacy_tags_with_schema_hint` | Keep legacy compatibility while normalizing in Gateway. |
| `deepseek` | `gateway_normalized` | `legacy_tags_with_schema_hint` | Avoid relying on direct strict JSON for long tasks. |
| `minimax` / `moonshot` | `gateway_normalized` | `legacy_tags_with_schema_hint` | Stable fallback-first migration path. |
| `custom` | `gateway_normalized` | `provider_unknown` | Unknown downstream model, use safe adapter path. |
| `ollama` | `legacy_tags` | `legacy_tags_only` | Local models remain legacy-first. |

## Runtime Flow

1. `oct-gateway/providers.js` declares provider-level render capabilities.
2. `oct-gateway/config.js#getModelCaps()` merges provider defaults into model caps.
3. `oct-gateway/runtime/providerRouter.js` exposes normalized caps to runtime routing.
4. Future prompt assembly can choose provider-specific instructions from `preferredRenderMode` and `renderPromptProfile`.

## Boundary

This capability layer does not by itself change model prompts or chat rendering behavior. It only gives later phases a deterministic source of truth.
