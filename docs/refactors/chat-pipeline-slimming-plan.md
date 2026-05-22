# Chat Pipeline Slimming Plan

## Goal

Reduce the OCT chat stack so that user-visible chat only renders user-readable text.
Internal protocol payloads, tool status objects, agent result envelopes, and image markers
must no longer leak into the transcript.

## Phase 1: Single Model Outlet

Status: in progress

Targets:

- Remove the `chat / plan / tool-safe` routing split from runtime behavior.
- Keep one OmniRoute model/combo field as the only external model outlet.
- Keep legacy capability names as compatibility shims only; they must resolve to the same outlet.

Files:

- `oct-gateway/runtime/externalOmniRoute.js`
- `oct-gateway/runtime/omniRoute.js`
- `oct-gateway/ai.js`
- `oct-gateway/services/llmClient.js`
- `oct-gateway/runtime/toolLoop.js`
- settings UI

Acceptance:

- `oct-chat`, `oct-plan`, and `oct-tool-safe` do not select different models.
- Tool continuations use the same model outlet as normal chat.
- Settings exposes one `OmniRoute Model / Combo` field, not three aliases.

## Phase 2: Visible Text Boundary

Targets:

- Separate user-visible input text from gateway payload text.
- Normalize assistant output before it reaches the transcript.
- Stop tool/workflow status objects from re-entering the model or chat transcript.

Acceptance:

- No `[用户发送了一张图片，请根据上下文回复]` in user bubbles.
- No `{"status":"completed"...}` or `{"role":"assistant"...}` in assistant bubbles.
- `waiting_user_reply` stays in event/UI flow, not transcript flow.

## Phase 3: Event vs Transcript Split

Targets:

- Split transcript messages from runtime events.
- Clarify, tool, agent, and workflow state updates move to event channels only.
- Frontend transcript rendering stops guessing whether text is protocol or content.

Likely modules:

- `src/hooks/useMessages.ts`
- `src/core/*`
- `oct-gateway/index.js`
- transport event handling

Acceptance:

- Chat transcript renders only `user.visibleText` and `assistant.visibleText`.
- Tool and agent state are visible in side panels/timelines, not chat bubbles.

## Phase 4: Orchestrator Boundary

Targets:

- Make `chat`, `agent`, and `tool` pipelines explicit.
- Remove hidden short-circuit paths that can emit raw objects or alternate message envelopes.
- Introduce one final assistant reply exit path.

Likely modules:

- `oct-gateway/index.js`
- `oct-gateway/orchestrator.js`
- `oct-gateway/runtime/chatEngine.js`
- `oct-gateway/runtime/toolLoop.js`

Acceptance:

- Every pipeline returns a normalized result shape.
- No branch can bypass final reply normalization.
